use anyhow::Context;

// Inicializado en lib.rs setup() con app.path().resource_dir()
pub static RESOURCE_DIR: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

fn ff_bin(name: &str) -> std::path::PathBuf {
    let fname = if cfg!(windows) { format!("{}.exe", name) } else { name.to_string() };
    // 1. Bundle instalado (resource_dir)
    if let Some(dir) = RESOURCE_DIR.get() {
        let c = dir.join(&fname);
        if c.exists() { return c; }
    }
    // 2. Junto al exe / resources/
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for c in [dir.join(&fname), dir.join("resources").join(&fname)] {
                if c.exists() { return c; }
            }
        }
    }
    // 3. PATH del sistema (dev / instalación global)
    if let Ok(paths) = std::env::var("PATH") {
        for dir in std::env::split_paths(&paths) {
            let c = dir.join(&fname);
            if c.exists() { return c; }
        }
    }
    std::path::PathBuf::from(name)
}

fn ffmpeg_bin() -> std::path::PathBuf { ff_bin("ffmpeg") }
fn ffprobe_bin() -> std::path::PathBuf { ff_bin("ffprobe") }
use axum::{
    Router,
    body::Body,
    extract::{Path, Query, State},
    response::Response,
    routing::get,
};
use axum::http::{HeaderMap, StatusCode, header};
use librqbit::{
    AddTorrent, AddTorrentOptions, AddTorrentResponse, Api,
    Session, SessionOptions, PeerConnectionOptions,
    api::TorrentIdOrHash,
};

use serde::{Deserialize, Serialize};
use std::{io::SeekFrom, process::Stdio, sync::Arc};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncSeekExt};
use tokio::net::TcpListener;

#[derive(Clone)]
struct StreamState {
    api: Arc<Api>,
    port: u16,
}

#[derive(Deserialize)]
struct PlayParams {
    audio: Option<usize>,
    start: Option<f64>,
}

// ffprobe output structures
#[derive(Deserialize)]
struct FfprobeTags {
    language: Option<String>,
    title: Option<String>,
}

#[derive(Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    tags: Option<FfprobeTags>,
}

#[derive(Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
}

#[derive(Deserialize)]
struct FfprobeOutput {
    streams: Vec<FfprobeStream>,
    format: Option<FfprobeFormat>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TrackInfo {
    pub index: usize,
    pub codec: String,
    pub language: String,
    pub label: String,
    pub is_text: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct VideoTracks {
    pub duration_secs: f64,
    pub audio: Vec<TrackInfo>,
    pub subtitles: Vec<TrackInfo>,
}

async fn h_stream(
    Path((id, file_id)): Path<(usize, usize)>,
    headers: HeaderMap,
    State(state): State<StreamState>,
) -> Response {
    let torrent_id = TorrentIdOrHash::Id(id);

    let mut stream = match state.api.api_stream(torrent_id, file_id) {
        Ok(s) => s,
        Err(e) => return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from(format!("{e}")))
            .unwrap(),
    };

    let file_len = stream.len(); // total bytes in this file

    // Parse Range header: "bytes=start-" or "bytes=start-end"
    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("bytes="))
        .and_then(|v| {
            let (s, e) = v.split_once('-')?;
            let start = s.parse::<u64>().ok()?;
            let end = if e.is_empty() { None } else { e.parse::<u64>().ok() };
            Some((start, end))
        });

    let (start, req_end) = range.unwrap_or((0, None));
    // Default end = last byte of file
    let end = req_end.unwrap_or_else(|| file_len.saturating_sub(1));
    let length = end.saturating_sub(start).saturating_add(1);

    if start > 0 {
        if let Err(e) = stream.seek(SeekFrom::Start(start)).await {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .body(Body::from(format!("{e}")))
                .unwrap();
        }
    }

    let reader = stream.take(length);
    let body_stream = tokio_util::io::ReaderStream::new(reader);

    // Always 206 when a Range header was sent, otherwise 200.
    let status = if range.is_some() { StatusCode::PARTIAL_CONTENT } else { StatusCode::OK };

    // Detect video MIME type from file extension so the browser can pick the right
    // GStreamer pipeline. MPV ignores Content-Type, so this is safe to change.
    let mime_type = {
        let name = state.api.api_torrent_details(TorrentIdOrHash::Id(id))
            .ok()
            .and_then(|d| d.files)
            .and_then(|files| files.get(file_id).map(|f| f.name.to_lowercase()))
            .unwrap_or_default();
        if name.ends_with(".mkv") { "video/x-matroska" }
        else if name.ends_with(".mp4") || name.ends_with(".m4v") { "video/mp4" }
        else if name.ends_with(".avi") { "video/x-msvideo" }
        else if name.ends_with(".webm") { "video/webm" }
        else if name.ends_with(".ts") { "video/MP2T" }
        else { "video/mp4" }
    };

    let mut builder = Response::builder()
        .status(status)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_TYPE, mime_type)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CONTENT_LENGTH, length.to_string());

    if range.is_some() {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{file_len}"),
        );
    }

    builder.body(Body::from_stream(body_stream)).unwrap()
}

// /play/{id}/{file_id}?audio=N&start=T — ffmpeg → fragmented MP4 for in-app <video>.
// Pipes librqbit stream directly to ffmpeg stdin so ffmpeg reads sequentially without
// HTTP Range seeks that would block on undownloaded torrent pieces.
async fn h_play(
    Path((id, file_id)): Path<(usize, usize)>,
    Query(params): Query<PlayParams>,
    State(state): State<StreamState>,
) -> Response {
    let audio_idx = params.audio.unwrap_or(0);
    let start_secs = params.start.unwrap_or(0.0);
    let audio_map_opt = format!("0:a:{}?", audio_idx);
    let start_str = format!("{:.3}", start_secs);

    // Open librqbit stream directly — piped to ffmpeg stdin (pipe:0).
    // This avoids HTTP Range seeks which would block waiting for undownloaded pieces.
    let torrent_id = librqbit::api::TorrentIdOrHash::Id(id);
    let rqbit_stream = match state.api.api_stream(torrent_id, file_id) {
        Ok(s) => s,
        Err(e) => return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from(format!("stream error: {e}")))
            .unwrap(),
    };

    // With pipe:0 input, ffmpeg reads sequentially and cannot seek back.
    // analyzeduration/probesize cover the container header in the first 500KB.
    // -ss after pipe input does a slow seek (reads forward until target timestamp).
    let mut args: Vec<String> = vec![
        "-v".into(), "error".into(),
        "-analyzeduration".into(), "1000000".into(),
        "-probesize".into(), "500000".into(),
        "-fflags".into(), "+genpts".into(),
        "-i".into(), "pipe:0".into(),
    ];
    if start_secs > 0.5 {
        args.push("-ss".into());
        args.push(start_str);
    }
    args.extend([
        "-map".into(), "0:v:0".into(),
        "-map".into(), audio_map_opt,
        "-c:v".into(), "libx264".into(),
        "-preset".into(), "ultrafast".into(),
        "-tune".into(), "zerolatency".into(),
        "-crf".into(), "22".into(),
        "-g".into(), "50".into(),
        "-c:a".into(), "aac".into(),
        "-b:a".into(), "192k".into(),
        "-sn".into(),
        "-f".into(), "mp4".into(),
        "-movflags".into(), "frag_keyframe+empty_moov+default_base_moof".into(),
        "pipe:1".into(),
    ]);

    let mut child = match tokio::process::Command::new(ffmpeg_bin())
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::from(format!("ffmpeg not found: {e}")))
            .unwrap(),
    };

    // Pipe librqbit stream → ffmpeg stdin sequentially (no seeking, no blocking).
    if let Some(mut ffmpeg_stdin) = child.stdin.take() {
        let mut rqbit_read = rqbit_stream;
        tokio::spawn(async move {
            tokio::io::copy(&mut rqbit_read, &mut ffmpeg_stdin).await.ok();
        });
    }

    // Log ffmpeg stderr so we can diagnose issues without silencing errors.
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let reader = tokio::io::BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                log::error!("[ffmpeg-torrent] {}", line);
            }
        });
    }

    let stdout = child.stdout.take().unwrap();
    let body_stream = tokio_util::io::ReaderStream::new(stdout);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(body_stream))
        .unwrap()
}

// /play/plex?url=URL&audio=N&start=T — same ffmpeg transcode pipeline, but reads from a Plex URL.
#[derive(Deserialize)]
struct PlexPlayParams {
    url: String,
    audio: Option<usize>,
    start: Option<f64>,
}

async fn h_play_plex(
    Query(params): Query<PlexPlayParams>,
) -> Response {
    let audio_idx = params.audio.unwrap_or(0);
    let start_secs = params.start.unwrap_or(0.0);
    let audio_map = format!("0:a:{}", audio_idx);
    let start_str = format!("{:.3}", start_secs);

    let mut args: Vec<String> = vec![
        "-v".into(), "quiet".into(),
        "-analyzeduration".into(), "100000".into(),
        "-probesize".into(), "500000".into(),
        "-fflags".into(), "+genpts+discardcorrupt".into(),
    ];
    if start_secs > 0.5 {
        args.push("-ss".into());
        args.push(start_str);
    }
    args.extend([
        "-i".into(), params.url,
        "-map".into(), "0:v:0".into(),
        "-map".into(), audio_map,
        "-c:v".into(), "libx264".into(),
        "-preset".into(), "ultrafast".into(),
        "-tune".into(), "zerolatency".into(),
        "-crf".into(), "22".into(),
        "-c:a".into(), "aac".into(),
        "-b:a".into(), "192k".into(),
        "-sn".into(),
        "-f".into(), "mp4".into(),
        "-movflags".into(), "frag_keyframe+empty_moov+default_base_moof".into(),
        "pipe:1".into(),
    ]);

    let mut child = match tokio::process::Command::new(ffmpeg_bin())
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::from(format!("ffmpeg not found: {e}")))
            .unwrap(),
    };

    let stdout = child.stdout.take().unwrap();
    let body_stream = tokio_util::io::ReaderStream::new(stdout);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(body_stream))
        .unwrap()
}

// /tracks/{id}/{file_id} — ffprobe the stream to discover audio/subtitle tracks.
async fn h_tracks(
    Path((id, file_id)): Path<(usize, usize)>,
    State(state): State<StreamState>,
) -> Response {
    let stream_url = format!("http://127.0.0.1:{}/stream/{}/{}", state.port, id, file_id);

    // Probe with a tight timeout — torrent may only have 2-3 MB buffered at this point.
    // Match probesize to h_play so track detection is consistent with what gets encoded.
    let probe_fut = tokio::process::Command::new(ffprobe_bin())
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            "-analyzeduration", "1000000",
            "-probesize", "3000000",
            &stream_url,
        ])
        .output();

    let output = match tokio::time::timeout(std::time::Duration::from_secs(12), probe_fut).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Body::from(format!("ffprobe error: {e}")))
            .unwrap(),
        Err(_) => return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Body::from(r#"{"duration_secs":0,"audio":[],"subtitles":[]}"#))
            .unwrap(),
    };

    parse_tracks_response(output)
}

// /subtitle/{id}/{file_id}/{sub_idx} — extract subtitle as WebVTT via ffmpeg.
async fn h_subtitle(
    Path((id, file_id, sub_idx)): Path<(usize, usize, usize)>,
    State(state): State<StreamState>,
) -> Response {
    let stream_url = format!("http://127.0.0.1:{}/stream/{}/{}", state.port, id, file_id);
    let map_arg = format!("0:s:{}", sub_idx);

    let mut child = match tokio::process::Command::new(ffmpeg_bin())
        .args([
            "-v", "quiet",
            "-i", &stream_url,
            "-map", &map_arg,
            "-f", "webvtt",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Body::from(format!("ffmpeg error: {e}")))
            .unwrap(),
    };

    let stdout = child.stdout.take().unwrap();
    let body_stream = tokio_util::io::ReaderStream::new(stdout);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/vtt; charset=utf-8")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(body_stream))
        .unwrap()
}

// /play/local?path=...&audio=N&start=T  — same ffmpeg pipeline as /play/plex but
// accepts a raw filesystem or smb:// path instead of a proxied URL.
#[derive(Deserialize)]
struct LocalPlayParams {
    path: String,
    audio: Option<usize>,
    start: Option<f64>,
}

async fn h_play_local(Query(params): Query<LocalPlayParams>) -> Response {
    let audio_map = format!("0:a:{}?", params.audio.unwrap_or(0));
    let start_secs = params.start.unwrap_or(0.0);
    let start_str = format!("{:.3}", start_secs);

    let mut args: Vec<String> = vec![
        "-v".into(), "quiet".into(),
        "-analyzeduration".into(), "10000000".into(),
        "-probesize".into(), "10000000".into(),
        "-fflags".into(), "+genpts+discardcorrupt".into(),
    ];
    if start_secs > 0.5 {
        args.extend(["-ss".into(), start_str]);
    }
    args.extend([
        "-i".into(), params.path,
        "-map".into(), "0:v:0".into(),
        "-map".into(), audio_map,
        "-c:v".into(), "libx264".into(),
        "-preset".into(), "ultrafast".into(),
        "-tune".into(), "zerolatency".into(),
        "-crf".into(), "22".into(),
        "-c:a".into(), "aac".into(),
        "-b:a".into(), "192k".into(),
        "-sn".into(),
        "-f".into(), "mp4".into(),
        "-movflags".into(), "frag_keyframe+empty_moov+default_base_moof".into(),
        "pipe:1".into(),
    ]);

    let mut child = match tokio::process::Command::new(ffmpeg_bin())
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::from(format!("ffmpeg error: {e}")))
            .unwrap(),
    };

    let body_stream = tokio_util::io::ReaderStream::new(child.stdout.take().unwrap());
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(body_stream))
        .unwrap()
}

// /tracks/local?path=... — ffprobe a filesystem/smb path to discover audio+subtitle tracks.
async fn h_tracks_local(Query(params): Query<LocalPlayParams>) -> Response {
    let probe_fut = tokio::process::Command::new(ffprobe_bin())
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            "-analyzeduration", "10000000",
            "-probesize", "10000000",
            &params.path,
        ])
        .output();

    let output = match tokio::time::timeout(std::time::Duration::from_secs(15), probe_fut).await {
        Ok(Ok(o)) => o,
        _ => return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Body::from(r#"{"duration_secs":0,"audio":[],"subtitles":[]}"#))
            .unwrap(),
    };

    parse_tracks_response(output)
}

// Shared track-parsing logic used by both /tracks/{id}/{file_id} and /tracks/local.
fn parse_tracks_response(output: std::process::Output) -> Response {
    let probed: FfprobeOutput = match serde_json::from_slice(&output.stdout) {
        Ok(p) => p,
        Err(_) => return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Body::from(r#"{"duration_secs":0,"audio":[],"subtitles":[]}"#))
            .unwrap(),
    };

    const TEXT_CODECS: &[&str] = &[
        "subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "microdvd", "text",
    ];
    let mut audio_idx = 0usize;
    let mut sub_idx = 0usize;
    let mut audio_tracks: Vec<TrackInfo> = Vec::new();
    let mut sub_tracks: Vec<TrackInfo> = Vec::new();

    for s in &probed.streams {
        let codec_type = s.codec_type.as_deref().unwrap_or("");
        let codec = s.codec_name.as_deref().unwrap_or("unknown").to_string();
        let lang = s.tags.as_ref()
            .and_then(|t| t.language.as_deref()).filter(|&l| l != "und")
            .unwrap_or("?").to_uppercase();
        let tag_title = s.tags.as_ref().and_then(|t| t.title.as_deref()).unwrap_or("").to_string();
        match codec_type {
            "audio" => {
                let label = if !tag_title.is_empty() { format!("{} ({})", tag_title, lang) }
                            else { format!("Pista {} ({})", audio_idx + 1, lang) };
                audio_tracks.push(TrackInfo { index: audio_idx, codec, language: lang, label, is_text: true });
                audio_idx += 1;
            }
            "subtitle" => {
                let is_text = TEXT_CODECS.contains(&codec.as_str());
                let label = if !tag_title.is_empty() { format!("{} ({})", tag_title, lang) }
                            else { format!("Sub {} ({})", sub_idx + 1, lang) };
                sub_tracks.push(TrackInfo { index: sub_idx, codec, language: lang, label, is_text });
                sub_idx += 1;
            }
            _ => {}
        }
    }

    let duration_secs = probed.format
        .and_then(|f| f.duration).and_then(|d| d.parse::<f64>().ok()).unwrap_or(0.0);
    let tracks = VideoTracks { duration_secs, audio: audio_tracks, subtitles: sub_tracks };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Body::from(serde_json::to_string(&tracks).unwrap()))
        .unwrap()
}

pub struct TorrentManager {
    session: Arc<Session>,
    api: Arc<Api>,
    port: u16,
    cache_dir: std::path::PathBuf,
}

#[derive(Debug, Serialize, Clone)]
pub struct TorrentStreamInfo {
    pub id: usize,
    pub stream_url: String, // raw bytes — for MPV
    pub play_url: String,   // ffmpeg-remuxed fragmented MP4 — for in-app <video>
}

// Serve a static test video for diagnosing WebKit video element support.
async fn h_test_video() -> Response {
    match tokio::fs::read("/tmp/test_video.mp4").await {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "video/mp4")
            .header(header::CONTENT_LENGTH, bytes.len().to_string())
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::ACCEPT_RANGES, "bytes")
            .body(Body::from(bytes))
            .unwrap(),
        Err(e) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from(format!("test video not found: {e}")))
            .unwrap(),
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct TorrentStats {
    pub id: usize,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub download_speed_mbps: f64,
    pub peers: usize,
    pub progress_percent: f64,
}

impl TorrentManager {
    pub async fn new() -> anyhow::Result<Self> {
        // /tmp is tmpfs (RAM) on Linux — data never touches a persistent disk.
        // Previous session leftovers are cleaned on startup.
        let cache_dir = std::env::temp_dir().join("streamdeck_cache");
        let _ = tokio::fs::remove_dir_all(&cache_dir).await;
        tokio::fs::create_dir_all(&cache_dir).await
            .context("Failed to create /tmp/streamdeck_cache")?;

        // Public trackers: fallback cuando DHT falla (Windows Firewall bloquea UDP)
        let trackers = [
            "udp://open.demonii.com:1337/announce",
            "udp://tracker.openbittorrent.com:6969/announce",
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://tracker.tiny-vps.com:6969/announce",
            "udp://open.stealth.si:80/announce",
            "udp://explodie.org:6969/announce",
            "https://tracker.gbitt.info/announce",
            "https://tracker.tamersunion.org/announce",
        ]
        .iter()
        .filter_map(|u| u.parse::<url::Url>().ok())
        .collect();

        let opts = SessionOptions {
            listen_port_range: Some(6881..6900),
            // UPnP puede colgar en Windows si el router no responde — lo desactivamos
            enable_upnp_port_forwarding: false,
            trackers,
            peer_opts: Some(PeerConnectionOptions {
                connect_timeout: Some(std::time::Duration::from_secs(10)),
                read_write_timeout: Some(std::time::Duration::from_secs(30)),
                keep_alive_interval: Some(std::time::Duration::from_secs(20)),
            }),
            ..SessionOptions::default()
        };
        let session = Session::new_with_opts(cache_dir.clone(), opts)
            .await
            .context("Failed to create librqbit session")?;

        // Api::new takes (Arc<Session>, Option<UnboundedSender<String>>)
        let api = Arc::new(Api::new(session.clone(), None));

        let port = 7777u16;
        let stream_state = StreamState { api: api.clone(), port };

        let router = Router::new()
            .route("/stream/{id}/{file_id}", get(h_stream))
            .route("/play/{id}/{file_id}", get(h_play))
            .route("/play/plex", get(h_play_plex))
            .route("/play/local", get(h_play_local))
            .route("/tracks/{id}/{file_id}", get(h_tracks))
            .route("/tracks/local", get(h_tracks_local))
            .route("/subtitle/{id}/{file_id}/{sub_idx}", get(h_subtitle))
            .route("/test.mp4", get(h_test_video))
            .with_state(stream_state);

        let listener = TcpListener::bind(format!("127.0.0.1:{port}"))
            .await
            .context("Failed to bind streaming server on port 7777")?;

        tokio::spawn(async move {
            axum::serve(listener, router).await.ok();
        });

        Ok(Self { session, api, port, cache_dir })
    }

    pub async fn add_torrent(&self, magnet: &str) -> anyhow::Result<TorrentStreamInfo> {
        let add = AddTorrent::from_url(magnet);
        // overwrite=true so the file can be written while streaming
        let opts = AddTorrentOptions {
            overwrite: true,
            ..AddTorrentOptions::default()
        };
        let response = self
            .session
            .add_torrent(add, Some(opts))
            .await
            .context("librqbit session.add_torrent failed")?;

        let id: usize = match response {
            AddTorrentResponse::Added(id, _) => id,
            AddTorrentResponse::AlreadyManaged(id, _) => id,
            AddTorrentResponse::ListOnly(_) => anyhow::bail!("Torrent returned ListOnly — no peers or bad magnet"),
        };

        Ok(TorrentStreamInfo {
            id,
            stream_url: format!("http://127.0.0.1:{}/stream/{}/0", self.port, id),
            play_url:   format!("http://127.0.0.1:{}/play/{}/0",   self.port, id),
        })
    }

    /// After metadata resolves, find the index of the largest video file.
    /// Returns 0 if undetermined (metadata not ready yet).
    pub fn find_video_file(&self, id: usize) -> usize {
        const VIDEO_EXTS: &[&str] = &["mkv", "mp4", "avi", "m4v", "mov", "ts", "wmv", "webm"];
        let Ok(details) = self.api.api_torrent_details(TorrentIdOrHash::Id(id)) else {
            return 0;
        };
        let Some(files) = details.files else {
            return 0;
        };
        files
            .iter()
            .enumerate()
            .filter(|(_, f)| {
                let name = f.name.to_lowercase();
                VIDEO_EXTS.iter().any(|ext| name.ends_with(ext))
            })
            .max_by_key(|(_, f)| f.length)
            .map(|(i, _)| i)
            .unwrap_or(0)
    }

    pub fn get_stats(&self, id: usize) -> anyhow::Result<TorrentStats> {
        // api_stats_v1 is NOT async in librqbit 8
        let stats = self
            .api
            .api_stats_v1(TorrentIdOrHash::Id(id))
            .map_err(|e| anyhow::anyhow!("{e}"))?;

        let downloaded = stats.progress_bytes;
        let total = stats.total_bytes;
        let speed = stats.live.as_ref().map(|l| l.download_speed.mbps).unwrap_or(0.0);
        let peers = stats
            .live
            .as_ref()
            .map(|l| l.snapshot.peer_stats.live as usize)
            .unwrap_or(0);
        let progress = if total > 0 {
            (downloaded as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        Ok(TorrentStats {
            id,
            downloaded_bytes: downloaded,
            total_bytes: total,
            download_speed_mbps: speed,
            peers,
            progress_percent: progress,
        })
    }

    pub async fn stop_torrent(&self, id: usize) -> anyhow::Result<()> {
        self.api
            .api_torrent_action_delete(TorrentIdOrHash::Id(id))
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        // Wipe the tmpfs cache so the next torrent starts clean.
        // /tmp is tmpfs on Linux so nothing ever lands on a real disk.
        let _ = tokio::fs::remove_dir_all(&self.cache_dir).await;
        let _ = tokio::fs::create_dir_all(&self.cache_dir).await;
        Ok(())
    }
}
