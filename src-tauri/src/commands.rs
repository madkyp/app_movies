use serde::{Deserialize, Serialize};
use tauri::State;
use crate::torrent_manager::{TorrentManager, TorrentStreamInfo, TorrentStats};
use std::sync::Arc;

// ─── Binary path helpers ──────────────────────────────────────────────────────

fn mpv_bin() -> std::path::PathBuf {
    let fname = if cfg!(windows) { "mpv.exe" } else { "mpv" };
    // 1. Bundle (resource_dir)
    if let Some(dir) = crate::torrent_manager::RESOURCE_DIR.get() {
        let p = dir.join(fname);
        if p.exists() { return p; }
    }
    // 2. Junto al exe / resources/
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for p in [dir.join(fname), dir.join("resources").join(fname)] {
                if p.exists() { return p; }
            }
        }
    }
    // 3. Ubicaciones típicas en Windows
    #[cfg(windows)]
    {
        let mut candidates: Vec<std::path::PathBuf> = Vec::new();
        for var in &["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
            if let Ok(pf) = std::env::var(var) {
                candidates.push(std::path::PathBuf::from(format!(r"{}\mpv\mpv.exe", pf)));
                candidates.push(std::path::PathBuf::from(format!(r"{}\mpv-x86_64\mpv.exe", pf)));
            }
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            candidates.push(std::path::PathBuf::from(format!(r"{}\Programs\mpv\mpv.exe", local)));
        }
        if let Ok(home) = std::env::var("USERPROFILE") {
            candidates.push(std::path::PathBuf::from(format!(r"{}\scoop\apps\mpv\current\mpv.exe", home)));
        }
        for c in candidates {
            if c.exists() { return c; }
        }
    }
    // 4. PATH del sistema
    if let Ok(paths) = std::env::var("PATH") {
        for dir in std::env::split_paths(&paths) {
            let c = dir.join(fname);
            if c.exists() { return c; }
        }
    }
    std::path::PathBuf::from(fname)
}

#[cfg(not(windows))]
fn smbclient_bin() -> &'static str {
    "smbclient"
}

fn ytdlp_bin() -> std::path::PathBuf {
    let fname = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
    if let Some(dir) = crate::torrent_manager::RESOURCE_DIR.get() {
        let p = dir.join(fname);
        if p.exists() { return p; }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for p in [dir.join(fname), dir.join("resources").join(fname)] {
                if p.exists() { return p; }
            }
        }
    }
    if let Ok(paths) = std::env::var("PATH") {
        for dir in std::env::split_paths(&paths) {
            let c = dir.join(fname);
            if c.exists() { return c; }
        }
    }
    std::path::PathBuf::from(fname)
}

/// Creates a Command with CREATE_NO_WINDOW on Windows so no console flashes appear.
fn proc_cmd(bin: impl AsRef<std::ffi::OsStr>) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut c = tokio::process::Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.as_std_mut().creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    c
}

#[tauri::command]
pub async fn get_youtube_stream_url(video_id: String) -> Result<String, String> {
    let url = format!("https://www.youtube.com/watch?v={}", video_id);
    // Formats 18 (360p mp4) and 22 (720p mp4) are always single-file with audio
    let out = proc_cmd(ytdlp_bin())
        .args(["-f", "22/18/best[ext=mp4]/best", "--get-url", "--no-playlist", &url])
        .output()
        .await
        .map_err(|_| "yt-dlp no encontrado".to_string())?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("yt-dlp: {}", err.lines().last().unwrap_or("error desconocido")));
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let stream_url = stdout.lines().next().unwrap_or("").trim().to_string();
    if stream_url.is_empty() {
        return Err("yt-dlp no devolvió ninguna URL".to_string());
    }
    Ok(stream_url)
}

// ─── Shared State ─────────────────────────────────────────────────────────────

pub struct AppState {
    pub torrent_manager: Arc<TorrentManager>,
}

// ─── Torrent Commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_torrent(
    magnet: String,
    state: State<'_, AppState>,
) -> Result<TorrentStreamInfo, String> {
    state
        .torrent_manager
        .add_torrent(&magnet)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn get_torrent_stats(
    id: usize,
    state: State<'_, AppState>,
) -> Result<TorrentStats, String> {
    state
        .torrent_manager
        .get_stats(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_video_file(
    id: usize,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    Ok(state.torrent_manager.find_video_file(id))
}

#[tauri::command]
pub async fn stop_torrent(
    id: usize,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .torrent_manager
        .stop_torrent(id)
        .await
        .map_err(|e| e.to_string())
}

// ─── External Player ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_in_mpv(url: String, title: String) -> Result<(), String> {
    tokio::process::Command::new(mpv_bin())
        .args([
            &url,
            &format!("--title={}", title),
            "--cache=yes",
            "--cache-secs=120",
            "--demuxer-max-bytes=500MiB",
            "--demuxer-max-back-bytes=50MiB",
            "--force-seekable=yes",
            "--network-timeout=30",
            "--no-ytdl",        // don't invoke yt-dlp on localhost URLs
            "--start=0",
            "--really-quiet",
        ])
        .spawn()
        .map_err(|e| format!("No se pudo lanzar mpv: {e}"))?;
    Ok(())
}

// ─── Torrent Source Commands ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum TorrentLanguage {
    Es,       // Español España
    EsLat,    // Latino
    Dual,     // Español + Inglés
    EnSubEs,  // Inglés con subtítulos en español
    En,       // Inglés
    Multi,    // Múltiples idiomas
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TorrentSource {
    pub title: String,
    pub magnet: String,
    pub quality: String,
    pub codec: String,
    pub size: String,
    pub seeds: u32,
    pub peers: u32,
    pub provider: String,
    pub language: TorrentLanguage,
    /// Sources fetched by IMDB ID (Torrentio) are pre-verified — skip relevance filter.
    #[serde(default)]
    pub trusted: bool,
}

fn detect_codec(title: &str) -> String {
    let t = title.to_lowercase();
    if t.contains("x265") || t.contains("h.265") || t.contains("h265") || t.contains("hevc") {
        "x265".to_string()
    } else if t.contains("av1") {
        "av1".to_string()
    } else if t.contains("x264") || t.contains("h.264") || t.contains("h264")
        || t.contains("avc") || t.contains("yify") {
        // YIFY releases are always x264 H.264
        "x264".to_string()
    } else {
        "unknown".to_string()
    }
}

fn codec_priority(c: &str) -> u8 {
    match c {
        "x264" => 0,    // Best browser compatibility
        "unknown" => 1, // Probably x264
        "av1" => 2,     // Limited browser support
        "x265" => 3,    // Not supported by most browsers
        _ => 4,
    }
}

// Providers in Torrentio that publish Spanish-dubbed content
// Providers that publish exclusively in Spanish — used as language fallback when
// the title has no explicit language tag. Do NOT add multi-language sites here.
const SPANISH_PROVIDERS: &[&str] = &[
    "wolfmax4k", "cinecalidad", "mejortorrent", "bludv", "peliculas.vip", "dontorrent",
    // comando = Portuguese, besttorrents = Polish, torrent9 = French → excluded
];

// Returns true when the title contains an unambiguous non-Spanish language tag,
// e.g. ".PL." (Polish), ".FR." (French), ".PT." (Portuguese), etc.
// These prevent a Spanish-provider fallback from mislabeling the release.
fn has_other_lang_tag(t: &str) -> bool {
    // t must already be lowercased
    let tags = [
        ".pl.", "[pl]", "(pl)",   // Polish
        ".fr.", "[fr]", "(fr)",   // French
        ".pt.", "[pt]", "(pt)",   // Portuguese
        ".ru.", "[ru]", "(ru)",   // Russian
        ".nl.", "[nl]", "(nl)",   // Dutch
        ".hu.", "[hu]", "(hu)",   // Hungarian
        ".tr.", "[tr]", "(tr)",   // Turkish
        ".cs.", "[cs]", "(cs)",   // Czech
        ".sk.", "[sk]", "(sk)",   // Slovak
        ".ro.", "[ro]", "(ro)",   // Romanian
        ".sv.", "[sv]", "(sv)",   // Swedish
        ".no.", "[no]", "(no)",   // Norwegian
        ".da.", "[da]", "(da)",   // Danish
        ".fi.", "[fi]", "(fi)",   // Finnish
    ];
    tags.iter().any(|tag| t.contains(tag))
}

fn detect_language(title: &str) -> TorrentLanguage {
    let t = title.to_lowercase();
    let has_multi = t.contains(".multi.") || t.contains("[multi]") || t.contains("(multi)")
        || t.contains(" multi ") || t.contains(".multi-") || t.contains("-multi.")
        || t.contains("multi audio") || t.ends_with(".multi") || t.ends_with(" multi");
    let has_es_audio = t.contains("español") || t.contains("espanol") || t.contains("castellano")
        || t.contains("[esp]") || t.contains("(esp)") || t.contains(".esp.")
        || t.contains("[spa]") || t.contains("(spa)") || t.contains(".spa.")
        || t.contains("[cast]") || t.contains("(cast)");
    let has_lat = t.contains("latino") || t.contains("lat]") || t.contains("lat)")
        || t.contains(".lat.") || t.contains("[lat]") || t.contains("(lat)");
    let has_dual = t.contains("dual") || t.contains("dual audio") || t.contains("dual-audio");
    let has_spa_subs = !has_es_audio && !has_lat && !has_dual && (
        t.contains("sub esp") || t.contains("subs esp")
        || t.contains("sub español") || t.contains("subs español")
        || t.contains("subtitulado") || t.contains("subtitulada")
        || t.contains("spanish sub") || t.contains("spa sub")
        || t.contains("[spa subs]") || t.contains("(spa subs)")
    );

    if has_multi { TorrentLanguage::Multi }
    else if has_lat { TorrentLanguage::EsLat }
    else if has_es_audio { TorrentLanguage::Es }
    else if has_dual { TorrentLanguage::Dual }
    else if has_spa_subs { TorrentLanguage::EnSubEs }
    else if t.contains("english") || t.contains("[eng]") || t.contains("(eng)")
        || t.contains(".eng.") || t.contains("yify") || t.contains("web-dl")
        { TorrentLanguage::En }
    else { TorrentLanguage::Unknown }
}

fn detect_language_with_provider(title: &str, provider: &str) -> TorrentLanguage {
    let detected = detect_language(title);
    // Only infer Spanish from provider when the title carries no language signal at all.
    // If the title has an explicit non-Spanish tag (.PL., .FR., etc.) never override it.
    if matches!(detected, TorrentLanguage::En | TorrentLanguage::Unknown) {
        let t = title.to_lowercase();
        if !has_other_lang_tag(&t) {
            let p = provider.to_lowercase();
            if SPANISH_PROVIDERS.iter().any(|sp| p.contains(sp)) {
                return TorrentLanguage::Es;
            }
        }
    }
    detected
}

fn lang_sort_priority(l: &TorrentLanguage) -> u8 {
    match l {
        TorrentLanguage::Es      => 0,
        TorrentLanguage::EsLat   => 1,
        TorrentLanguage::Dual    => 2,
        TorrentLanguage::EnSubEs => 3,
        TorrentLanguage::Multi   => 4,
        TorrentLanguage::En      => 5,
        TorrentLanguage::Unknown => 6,
    }
}

// The Pirate Bay API ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct TpbTorrent {
    name: String,
    info_hash: String,
    leechers: String,
    seeders: String,
    size: String,
    #[allow(dead_code)]
    category: String,
}

fn tpb_to_source(t: TpbTorrent) -> TorrentSource {
    let seeds = t.seeders.parse().unwrap_or(0);
    let peers = t.leechers.parse().unwrap_or(0);
    let size_bytes: u64 = t.size.parse().unwrap_or(0);
    let language = detect_language(&t.name);
    let codec = detect_codec(&t.name);
    TorrentSource {
        quality: detect_quality(&t.name),
        codec,
        size: format_size(size_bytes),
        magnet: build_magnet(&t.info_hash, &t.name),
        seeds,
        peers,
        language,
        title: t.name,
        provider: "TPB".to_string(),
        trusted: false,
    }
}

async fn search_tpb(query: &str, category: &str) -> anyhow::Result<Vec<TorrentSource>> {
    let url = format!(
        "https://apibay.org/q.php?q={}&cat={}",
        urlencoding::encode(query),
        category
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let torrents = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 StreamDeck/1.0")
        .send()
        .await?
        .json::<Vec<TpbTorrent>>()
        .await?;

    Ok(torrents
        .into_iter()
        .filter(|t| is_valid_btih(&t.info_hash))
        .map(tpb_to_source)
        .collect())
}

fn quality_tier(q: &str) -> u8 {
    match q { "4K" => 0, "1080p" => 1, "720p" => 2, _ => 3 }
}

// Strips studio presenter prefixes like "Marvel Television presenta ..."
// so 1337x/TPB searches use just the actual movie title.
fn clean_search_query(query: &str) -> &str {
    let lower = query.to_lowercase();
    for kw in &["presenta ", "presents ", "präsentiert "] {
        if let Some(pos) = lower.find(kw) {
            let after = query[pos + kw.len()..].trim_start();
            if !after.is_empty() {
                return after;
            }
        }
    }
    query
}

// Returns true if the torrent title is relevant to the search query.
// Requires at least ceil(effective_words/2) query words to appear in the title.
//
// Critical case: when the series/movie title is entirely a stopword or very short
// (e.g. "FROM", "IT", "YOU"), filtering stopwords would leave nothing and the old
// code returned true unconditionally — matching every torrent with S01E01.
// Fix: if filtering leaves no sig_words, fall back to ALL query words so that
// "Pluribus S01E01" doesn't pass a search for "FROM S01E01".
fn is_title_relevant(title: &str, query: &str) -> bool {
    const STOPWORDS: &[&str] = &[
        "the", "a", "an", "and", "of", "in", "on", "at", "to", "for",
        "is", "it", "its", "be", "as", "by", "or", "from", "with", "that",
        "el", "la", "los", "las", "de", "del", "en", "y", "e", "un", "una",
        "le", "les", "du", "des", "et",
    ];
    let q = query.to_lowercase();
    let all_words: Vec<&str> = q
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    if all_words.is_empty() {
        return true;
    }
    let sig_words: Vec<&str> = all_words.iter()
        .copied()
        .filter(|w| w.len() > 2 && !STOPWORDS.contains(w))
        .collect();
    // If all query words were filtered out (title is a stopword like "FROM", "IT"),
    // use the raw words — otherwise every torrent would be accepted.
    let effective: &[&str] = if sig_words.is_empty() { &all_words } else { &sig_words };
    let title_lower = title.to_lowercase();
    let matches = effective.iter().filter(|w| title_lower.contains(*w)).count();
    let required = ((effective.len() + 1) / 2).max(1).min(3);
    matches >= required
}

fn merge_and_sort(mut sources: Vec<TorrentSource>, query: &str) -> Vec<TorrentSource> {
    // Filter out results unrelated to the search query.
    // Trusted sources (fetched by IMDB ID via Torrentio) are pre-verified — skip check.
    sources.retain(|s| s.trusted || is_title_relevant(&s.title, query));

    // Deduplicate by magnet hash prefix
    let mut seen = std::collections::HashSet::new();
    sources.retain(|s| {
        let hash = s.magnet
            .split("urn:btih:")
            .nth(1)
            .and_then(|h| h.split('&').next())
            .unwrap_or(&s.title)
            .to_lowercase();
        seen.insert(hash)
    });

    // Always show only 1080p and 4K — user explicitly wants HD-only.
    sources.retain(|s| s.quality == "4K" || s.quality == "1080p");

    // Sort: seeded first, then language (es→lat→dual→en-sub-es→en→?), quality, codec, seeds
    sources.sort_by(|a, b| {
        let a_dead = u8::from(a.seeds == 0);
        let b_dead = u8::from(b.seeds == 0);
        a_dead.cmp(&b_dead)
            .then(lang_sort_priority(&a.language).cmp(&lang_sort_priority(&b.language)))
            .then(quality_tier(&a.quality).cmp(&quality_tier(&b.quality)))
            .then(codec_priority(&a.codec).cmp(&codec_priority(&b.codec)))
            .then(b.seeds.cmp(&a.seeds))
    });
    sources
}

/// Searches in parallel across all sources including Torrentio (when IMDB ID is available).
#[tauri::command]
pub async fn search_yts(query: String, imdb_id: Option<String>) -> Result<Vec<TorrentSource>, String> {
    // Use core title for searches (strips "Studio presenta ..." prefixes)
    let core = clean_search_query(&query).to_string();

    let q_es   = format!("{} español", core);
    let q_lat  = format!("{} latino", core);
    let q_dual = format!("{} dual", core);
    let q_1080 = format!("{} 1080p", core);

    let imdb_ref = imdb_id.as_deref().unwrap_or("");

    let (tpb_es, tpb_lat, tpb_dual, tpb_1080, csv_es, csv_1080, leet, mejortorrent, divxtotal, dontorrent, torrentio) =
        tokio::join!(
            search_tpb(&q_es, "200,207"),
            search_tpb(&q_lat, "200,207"),
            search_tpb(&q_dual, "200,207"),
            search_tpb(&q_1080, "200,207"),
            search_torrentcsv(&q_es),
            search_torrentcsv(&q_1080),
            search_1337x(&core, false),
            search_mejortorrent_inner(&core, false),
            search_divxtotal(&core, false),
            search_dontorrent(&core, false),
            async {
                if imdb_ref.is_empty() { return Ok(vec![]); }
                search_torrentio(imdb_ref, "movie").await
            },
        );

    let mut all = Vec::new();
    for r in [tpb_es, tpb_lat, tpb_dual, tpb_1080, csv_es, csv_1080] {
        if let Ok(mut v) = r { all.append(&mut v); }
    }
    if let Ok(mut v) = leet { all.append(&mut v); }
    if let Ok(mut v) = mejortorrent { all.append(&mut v); }
    if let Ok(mut v) = divxtotal { all.append(&mut v); }
    if let Ok(mut v) = dontorrent { all.append(&mut v); }
    if let Ok(mut v) = torrentio { all.append(&mut v); }

    Ok(merge_and_sort(all, &core))
}

// EZTV ────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct EztvResponse {
    torrents: Option<Vec<EztvTorrent>>,
}
#[derive(Deserialize)]
struct EztvTorrent {
    title: String,
    magnet_url: String,
    size_bytes: Option<serde_json::Value>,
    seeds: Option<u32>,
    peers: Option<u32>,
}

#[tauri::command]
pub async fn search_eztv(
    imdb_id: String,
    query: String,
    season: Option<u32>,
    episode: Option<u32>,
) -> Result<Vec<TorrentSource>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut sources = Vec::new();

    // Build episode-specific query when season+episode provided (much more accurate)
    let effective_query = match (season, episode) {
        (Some(s), Some(e)) => format!("{} S{:02}E{:02}", query, s, e),
        _ => query.clone(),
    };

    // EZTV API — limit=200 to cover shows with many seasons/episodes
    let id = imdb_id.trim_start_matches("tt");
    let url = format!("https://eztvx.to/api/get-torrents?imdb_id={}&limit=200", id);
    if let Ok(resp) = client.get(&url).header("User-Agent", "StreamDeck/1.0").send().await {
        if let Ok(data) = resp.json::<EztvResponse>().await {
            if let Some(torrents) = data.torrents {
                for t in torrents {
                    // Skip invalid or missing magnet links (EZTV sometimes returns
                    // empty strings or .torrent file URLs in the magnet_url field)
                    if !t.magnet_url.starts_with("magnet:?xt=urn:btih:") {
                        continue;
                    }
                    let size_bytes: u64 = match &t.size_bytes {
                        Some(serde_json::Value::Number(n)) => n.as_u64().unwrap_or(0),
                        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0),
                        _ => 0,
                    };
                    sources.push(TorrentSource {
                        quality: detect_quality(&t.title),
                        codec: detect_codec(&t.title),
                        size: format_size(size_bytes),
                        language: detect_language(&t.title),
                        magnet: t.magnet_url,
                        seeds: t.seeds.unwrap_or(0),
                        peers: t.peers.unwrap_or(0),
                        title: t.title,
                        provider: "EZTV".to_string(),
                        trusted: false,
                    });
                }
            }
        }
    }

    // Parallel external searches with episode-specific query
    let q_es   = format!("{} español", effective_query);
    let q_lat  = format!("{} latino", effective_query);
    let q_dual = format!("{} dual", effective_query);
    let q_1080 = format!("{} 1080p", effective_query);

    let torrentio_id = match (season, episode) {
        (Some(s), Some(e)) => format!("{}:{}:{}", imdb_id, s, e),
        _ => imdb_id.clone(),
    };
    let tio_id_ref = torrentio_id.as_str();

    let (tpb_es, tpb_lat, tpb_dual, tpb_1080, csv_es, csv_1080, leet, mejortorrent, divxtotal, dontorrent, torrentio) =
        tokio::join!(
            search_tpb(&q_es, "205"),
            search_tpb(&q_lat, "205"),
            search_tpb(&q_dual, "205"),
            search_tpb(&q_1080, "205"),
            search_torrentcsv(&q_es),
            search_torrentcsv(&q_1080),
            search_1337x(&effective_query, true),
            search_mejortorrent_inner(&effective_query, true),
            search_divxtotal(&effective_query, true),
            search_dontorrent(&effective_query, true),
            async {
                if imdb_id.is_empty() { return Ok(vec![]); }
                search_torrentio(tio_id_ref, "series").await
            },
        );
    for r in [tpb_es, tpb_lat, tpb_dual, tpb_1080, csv_es, csv_1080] {
        if let Ok(mut v) = r { sources.append(&mut v); }
    }
    if let Ok(mut v) = leet { sources.append(&mut v); }
    if let Ok(mut v) = mejortorrent { sources.append(&mut v); }
    if let Ok(mut v) = divxtotal { sources.append(&mut v); }
    if let Ok(mut v) = dontorrent { sources.append(&mut v); }
    if let Ok(mut v) = torrentio { sources.append(&mut v); }

    // Filter to only torrents matching the specific S/E pattern
    if let (Some(s), Some(e)) = (season, episode) {
        let p_sxxexx = format!("s{:02}e{:02}", s, e);
        let p_dotted = format!(" {}x{:02} ", s, e);
        let p_loose  = format!("{}x{:02}", s, e);
        sources.retain(|src| {
            let l = src.title.to_lowercase();
            l.contains(&p_sxxexx) || l.contains(p_dotted.trim()) || l.contains(&p_loose)
        });
    }

    Ok(merge_and_sort(sources, &query))
}

// MejorTorrent ────────────────────────────────────────────────────────────────

const MT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Known MejorTorrent domains (they change periodically)
const MT_DOMAINS: &[&str] = &[
    "https://www.mejortorrent.one",
    "https://www.mejortorrent.zip",
    "https://mejortorrent.nz",
];

async fn search_mejortorrent_inner(query: &str, for_series: bool) -> anyhow::Result<Vec<TorrentSource>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .danger_accept_invalid_certs(true)
        .build()?;

    for base in MT_DOMAINS {
        match fetch_mt_search(&client, base, query, for_series).await {
            Ok(v) if !v.is_empty() => return Ok(v),
            _ => continue,
        }
    }
    Ok(vec![])
}

async fn fetch_mt_search(
    client: &reqwest::Client,
    base: &str,
    query: &str,
    for_series: bool,
) -> anyhow::Result<Vec<TorrentSource>> {
    let url = format!("{}/buscar?q={}", base, urlencoding::encode(query));
    let html = client
        .get(&url)
        .header("User-Agent", MT_UA)
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Accept-Language", "es-ES,es;q=0.9")
        .send()
        .await?
        .text()
        .await?;

    // Parse HTML synchronously — scraper::Html is !Send so no .await while it's in scope
    let (direct, detail_urls) = {
        use scraper::{Html, Selector};
        let doc = Html::parse_document(&html);

        let magnet_sel = Selector::parse("a[href^='magnet:']").unwrap();
        let direct: Vec<TorrentSource> = doc
            .select(&magnet_sel)
            .filter_map(|el| {
                mt_source_from_magnet(el.value().attr("href")?, &el.text().collect::<String>())
            })
            .collect();

        let type_path = if for_series { "/serie/" } else { "/pelicula/" };
        let link_sel = Selector::parse("a[href]").unwrap();
        let mut seen = std::collections::HashSet::new();
        let detail_urls: Vec<String> = doc
            .select(&link_sel)
            .filter_map(|el| {
                let href = el.value().attr("href")?;
                if !href.contains(type_path) && !href.contains("/torrent/") { return None; }
                if href.starts_with("magnet:") || href.ends_with(".jpg") { return None; }
                let full = if href.starts_with("http") {
                    href.to_string()
                } else {
                    format!("{}{}", base, href)
                };
                if seen.insert(full.clone()) { Some(full) } else { None }
            })
            .take(6)
            .collect();

        (direct, detail_urls)
        // doc dropped here — no longer !Send
    };

    if !direct.is_empty() {
        return Ok(direct);
    }

    // Now safe to .await — no scraper types in scope
    let futs: Vec<_> = detail_urls.iter().map(|u| fetch_mt_detail(client, u)).collect();
    let mut all: Vec<TorrentSource> = futures::future::join_all(futs)
        .await
        .into_iter()
        .filter_map(|r| r.ok())
        .flatten()
        .collect();

    for s in &mut all {
        if s.language == TorrentLanguage::Unknown {
            s.language = TorrentLanguage::Es;
        }
    }

    Ok(all)
}

async fn fetch_mt_detail(client: &reqwest::Client, url: &str) -> anyhow::Result<Vec<TorrentSource>> {
    let html = client
        .get(url)
        .header("User-Agent", MT_UA)
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .await?
        .text()
        .await?;

    // Parse synchronously — drop before any future await
    let sources = {
        use scraper::{Html, Selector};
        let doc = Html::parse_document(&html);

        let title_sel = Selector::parse("h1, h2, .entry-title, .torrent-title, title").unwrap();
        let page_title = doc
            .select(&title_sel)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        let seeds = extract_number_from_doc(&doc, &["[class*='seed']", ".seeders"]);
        let peers = extract_number_from_doc(&doc, &["[class*='leech']", ".leechers"]);

        let size_sel = Selector::parse("[class*='size'], .file-size").unwrap();
        let size_str = doc
            .select(&size_sel)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_else(|| "?".to_string());

        let magnet_sel = Selector::parse("a[href^='magnet:']").unwrap();
        let sources: Vec<TorrentSource> = doc
            .select(&magnet_sel)
            .filter_map(|el| {
                let href = el.value().attr("href")?;
                let lang = {
                    let l = detect_language(&page_title);
                    if l == TorrentLanguage::Unknown { TorrentLanguage::Es } else { l }
                };
                Some(TorrentSource {
                    title: page_title.clone(),
                    magnet: href.to_string(),
                    quality: detect_quality(&page_title),
                    codec: detect_codec(&page_title),
                    language: lang,
                    size: size_str.clone(),
                    seeds: seeds.unwrap_or(30),
                    peers: peers.unwrap_or(5),
                    provider: "MejorTorrent".to_string(),
                    trusted: false,
                })
            })
            .collect();
        sources
        // doc dropped here
    };

    Ok(sources)
}

fn mt_source_from_magnet(magnet: &str, label: &str) -> Option<TorrentSource> {
    // Extract dn= from magnet as title if label is empty
    let title = if label.trim().is_empty() {
        let dn = magnet
            .split("&dn=")
            .nth(1)
            .and_then(|s| s.split('&').next())
            .map(|s| urlencoding::decode(s).unwrap_or_default().into_owned())
            .unwrap_or_default();
        if dn.is_empty() { "MejorTorrent".to_string() } else { dn }
    } else {
        label.trim().to_string()
    };

    let lang = {
        let l = detect_language(&title);
        if l == TorrentLanguage::Unknown { TorrentLanguage::Es } else { l }
    };

    Some(TorrentSource {
        quality: detect_quality(&title),
        codec: detect_codec(&title),
        language: lang,
        size: "?".to_string(),
        seeds: 30,
        peers: 5,
        title,
        magnet: magnet.to_string(),
        provider: "MejorTorrent".to_string(),
        trusted: false,
    })
}

fn extract_number_from_doc(doc: &scraper::Html, selectors: &[&str]) -> Option<u32> {
    for sel_str in selectors {
        if let Ok(sel) = scraper::Selector::parse(sel_str) {
            if let Some(el) = doc.select(&sel).next() {
                let text = el.text().collect::<String>();
                // Strip non-numeric prefix (e.g. "Seeders: 120")
                let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
                if let Ok(n) = digits.parse::<u32>() {
                    return Some(n);
                }
            }
        }
    }
    None
}

// Knaben ──────────────────────────────────────────────────────────────────────

// TorrentCSV ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct TorrentCsvResponse {
    torrents: Option<Vec<TorrentCsvItem>>,
}

#[derive(Deserialize)]
struct TorrentCsvItem {
    name: String,
    infohash: String,
    size_bytes: Option<u64>,
    seeders: Option<u32>,
    leechers: Option<u32>,
}

async fn search_torrentcsv(query: &str) -> anyhow::Result<Vec<TorrentSource>> {
    let url = format!(
        "https://torrents-csv.com/service/search?q={}&size=30",
        urlencoding::encode(query)
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let data: TorrentCsvResponse = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 StreamDeck/1.0")
        .send()
        .await?
        .json()
        .await?;

    let sources = data
        .torrents
        .unwrap_or_default()
        .into_iter()
        .filter_map(|t| {
            if !is_valid_btih(&t.infohash) {
                return None;
            }
            Some(TorrentSource {
                quality: detect_quality(&t.name),
                codec: detect_codec(&t.name),
                language: detect_language(&t.name),
                size: format_size(t.size_bytes.unwrap_or(0)),
                magnet: build_magnet(&t.infohash, &t.name),
                seeds: t.seeders.unwrap_or(0),
                peers: t.leechers.unwrap_or(0),
                title: t.name,
                provider: "TorrentCSV".to_string(),
                trusted: false,
            })
        })
        .collect();

    Ok(sources)
}

// Torrentio ───────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct TorrentioStream {
    #[serde(rename = "infoHash")]
    info_hash: Option<String>,
    title: Option<String>,
    name: Option<String>,
    #[serde(rename = "behaviorHints")]
    behavior_hints: Option<TorrentioHints>,
}

#[derive(Deserialize)]
struct TorrentioHints {
    filename: Option<String>,
}

#[derive(Deserialize)]
struct TorrentioResponse {
    streams: Vec<TorrentioStream>,
}

// All providers shown in the Torrentio UI (Spanish ones included).
const TORRENTIO_PROVIDERS: &str =
    "providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,\
     magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,rutor,rutracker,comando,\
     bluDV,MicoLeaoDublado,torrent9,ilcorsaronero,mejortorrent,wolfmax4k,\
     cinecalidad,besttorrents";

// kind = "movie" | "series"   id = imdb_id  or  "imdb_id:season:episode"
async fn search_torrentio(id: &str, kind: &str) -> anyhow::Result<Vec<TorrentSource>> {
    let url = format!(
        "https://torrentio.strem.fun/{}/stream/{}/{}.json",
        TORRENTIO_PROVIDERS, kind, id
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;
    let resp: TorrentioResponse = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 StreamDeck/1.0")
        .send()
        .await?
        .json()
        .await?;

    let sources = resp.streams.into_iter().filter_map(|s| {
        let hash = s.info_hash?;
        if !is_valid_btih(&hash) { return None; }

        let raw_title = s.title.unwrap_or_default();
        let mut parts = raw_title.splitn(2, '\n');
        let torrent_name = parts.next().unwrap_or("").trim();
        let meta_line   = parts.next().unwrap_or("").trim();

        // "👤 73 💾 21.57 GB ⚙️ ThePirateBay"
        let seeds: u32 = meta_line.split('\u{1F464}').nth(1)
            .and_then(|s| s.trim().split_whitespace().next())
            .and_then(|n| n.replace(',', "").parse().ok())
            .unwrap_or(0);

        let size = meta_line.split('\u{1F4BE}').nth(1)
            .map(|s| s.split("⚙️").next().unwrap_or("").trim().to_string())
            .unwrap_or_else(|| "?".to_string());

        let provider = meta_line.split("⚙️").nth(1)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Torrentio".to_string());

        // Prefer the actual filename from behaviorHints for quality detection
        let display = s.behavior_hints
            .and_then(|h| h.filename)
            .unwrap_or_else(|| torrent_name.to_string());

        // Quality: prefer the name field ("4k HDR", "1080p") over filename
        let name_field = s.name.unwrap_or_default();
        let quality = if detect_quality(&name_field) != "480p" {
            detect_quality(&name_field)
        } else {
            detect_quality(&display)
        };

        Some(TorrentSource {
            magnet: build_magnet(&hash, &display),
            quality,
            codec: detect_codec(&display),
            language: detect_language_with_provider(&display, &provider),
            size,
            seeds,
            peers: 0,
            title: display,
            provider,
            trusted: true, // fetched by IMDB ID — guaranteed correct movie
        })
    }).collect();

    Ok(sources)
}

// 1337x ───────────────────────────────────────────────────────────────────────

const LEET_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

struct LeetEntry {
    url: String,
    title: String,
    seeds: u32,
    peers: u32,
}

async fn search_1337x(query: &str, for_series: bool) -> anyhow::Result<Vec<TorrentSource>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()?;

    let cat = if for_series { "TV" } else { "Movies" };
    // Strip punctuation — colons/quotes in titles break 1377x search matching.
    let clean: String = query
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let url = format!(
        "https://www.1377x.to/category-search/{}/{}/1/",
        urlencoding::encode(&clean),
        cat
    );

    let html = client
        .get(&url)
        .header("User-Agent", LEET_UA)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Referer", "https://www.1377x.to/")
        .send()
        .await?
        .text()
        .await?;

    // Parse synchronously — scraper::Html is !Send
    let mut entries: Vec<LeetEntry> = {
        use scraper::{Html, Selector};
        let doc = Html::parse_document(&html);

        let sel_row = Selector::parse("table.table-list tbody tr").unwrap();
        let sel_name = Selector::parse("td.name a[href^='/torrent/']").unwrap();
        let sel_seeds = Selector::parse("td.coll-2").unwrap();
        let sel_leeches = Selector::parse("td.coll-3").unwrap();

        doc.select(&sel_row)
            .filter_map(|row| {
                let name_el = row.select(&sel_name).next()?;
                let href = name_el.value().attr("href")?;
                let title = name_el.text().collect::<String>().trim().to_string();
                let seeds = row
                    .select(&sel_seeds)
                    .next()
                    .and_then(|el| el.text().collect::<String>().trim().replace(',', "").parse::<u32>().ok())
                    .unwrap_or(0);
                let peers = row
                    .select(&sel_leeches)
                    .next()
                    .and_then(|el| el.text().collect::<String>().trim().replace(',', "").parse::<u32>().ok())
                    .unwrap_or(0);
                Some(LeetEntry {
                    url: format!("https://www.1377x.to{}", href),
                    title,
                    seeds,
                    peers,
                })
            })
            .collect()
        // doc dropped
    };

    if entries.is_empty() {
        return Ok(vec![]);
    }

    // Sort by seeds, filter irrelevant titles early (before fetching detail pages)
    entries.sort_by(|a, b| b.seeds.cmp(&a.seeds));
    entries.retain(|e| e.seeds > 0 && is_title_relevant(&e.title, &clean));
    entries.truncate(8);

    // Fetch magnet links from detail pages in parallel
    let futs: Vec<_> = entries
        .iter()
        .map(|e| fetch_1337x_magnet(&client, &e.url))
        .collect();

    let magnets = futures::future::join_all(futs).await;

    let sources: Vec<TorrentSource> = entries
        .into_iter()
        .zip(magnets.into_iter())
        .filter_map(|(entry, magnet_res)| {
            let magnet = magnet_res.ok().flatten()?;
            Some(TorrentSource {
                quality: detect_quality(&entry.title),
                codec: detect_codec(&entry.title),
                language: detect_language(&entry.title),
                size: "?".to_string(),
                magnet,
                seeds: entry.seeds,
                peers: entry.peers,
                title: entry.title,
                provider: "1377x".to_string(),
                trusted: false,
            })
        })
        .collect();

    Ok(sources)
}

async fn fetch_1337x_magnet(
    client: &reqwest::Client,
    url: &str,
) -> anyhow::Result<Option<String>> {
    let html = client
        .get(url)
        .header("User-Agent", LEET_UA)
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Referer", "https://www.1377x.to/")
        .send()
        .await?
        .text()
        .await?;

    let magnet = {
        use scraper::{Html, Selector};
        let doc = Html::parse_document(&html);
        let sel = Selector::parse("a[href^='magnet:?xt=urn:btih:']").unwrap();
        doc.select(&sel)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|s| s.to_string())
        // doc dropped
    };

    Ok(magnet)
}

// DivxTotal ───────────────────────────────────────────────────────────────────

const DT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DT_BASE: &str = "https://divxtotal.foo";

#[derive(Deserialize)]
struct DivxItem {
    title: String,
    #[serde(rename = "type")]
    item_type: String,
    url: String,
}

/// Skip one bencoded value starting at `pos`, returning whether it succeeded.
fn bencode_skip(b: &[u8], pos: &mut usize) -> bool {
    if *pos >= b.len() { return false; }
    match b[*pos] {
        c @ b'd' | c @ b'l' => {
            *pos += 1;
            while *pos < b.len() && b[*pos] != b'e' {
                if !bencode_skip(b, pos) { return false; }
                if c == b'd' && !bencode_skip(b, pos) { return false; }
            }
            if *pos >= b.len() { return false; }
            *pos += 1; // consume 'e'
            true
        }
        b'i' => {
            *pos += 1;
            while *pos < b.len() && b[*pos] != b'e' { *pos += 1; }
            if *pos >= b.len() { return false; }
            *pos += 1;
            true
        }
        c if c.is_ascii_digit() => {
            let s = *pos;
            while *pos < b.len() && b[*pos].is_ascii_digit() { *pos += 1; }
            if *pos >= b.len() || b[*pos] != b':' { return false; }
            let len: usize = std::str::from_utf8(&b[s..*pos]).ok()
                .and_then(|s| s.parse().ok()).unwrap_or(0);
            *pos += 1 + len;
            *pos <= b.len()
        }
        _ => false,
    }
}

/// SHA1-hash the info dictionary from a raw .torrent file bytes.
fn torrent_info_hash(bytes: &[u8]) -> Option<String> {
    let needle = b"4:info";
    let start = bytes.windows(needle.len()).position(|w| w == needle)?;
    let info_start = start + needle.len();
    let mut pos = info_start;
    if !bencode_skip(bytes, &mut pos) { return None; }
    use sha1::{Sha1, Digest};
    Some(format!("{:x}", Sha1::digest(&bytes[info_start..pos])))
}

/// Download a .torrent file and return a magnet link.
async fn dt_torrent_to_magnet(
    client: &reqwest::Client,
    torrent_url: &str,
    title: &str,
) -> Option<String> {
    let bytes = client
        .get(torrent_url)
        .header("User-Agent", DT_UA)
        .header("Referer", DT_BASE)
        .send().await.ok()?
        .bytes().await.ok()?;
    let hash = torrent_info_hash(&bytes)?;
    if !is_valid_btih(&hash) { return None; }
    Some(build_magnet(&hash, title))
}

/// Fetch a DivxTotal detail page and return (title, torrent_download_url).
async fn dt_detail(client: &reqwest::Client, page_url: &str) -> Option<(String, String)> {
    let html = client
        .get(page_url)
        .header("User-Agent", DT_UA)
        .header("Referer", DT_BASE)
        .send().await.ok()?
        .text().await.ok()?;

    let (title, download_url) = {
        use scraper::{Html, Selector};
        let doc = Html::parse_document(&html);

        let title = doc
            .select(&Selector::parse("h1").unwrap())
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        // The download button: <a class="opcion_2" href="https://divxtotal.foo/download_tt.php?u=BASE64">
        let href = doc
            .select(&Selector::parse("a.opcion_2[href*='download_tt.php']").unwrap())
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|h| h.to_string())?;

        // The PHP script 302-redirects to the actual .torrent URL — use it directly
        (title, href)
    };

    if download_url.is_empty() { return None; }
    Some((title, download_url))
}

fn dt_quality(item_type: &str) -> &'static str {
    let t = item_type.to_lowercase();
    if t.contains("4k") { "4K" }
    else if t.contains("hd") { "1080p" }
    else { "720p" }
}

async fn search_divxtotal(query: &str, for_series: bool) -> anyhow::Result<Vec<TorrentSource>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    let search_url = format!(
        "{}/wp-admin/admin-ajax.php?action=search_autocomplete&q={}",
        DT_BASE, urlencoding::encode(query)
    );

    let items: Vec<DivxItem> = client
        .get(&search_url)
        .header("User-Agent", DT_UA)
        .send().await?
        .json().await?;

    // Filter to the right content type, prefer HD/4K for movies
    let type_kw = if for_series { "serie" } else { "pel" };
    let candidates: Vec<_> = items.into_iter()
        .filter(|i| i.item_type.to_lowercase().contains(type_kw))
        .filter(|i| {
            if for_series { return true; }
            let t = i.item_type.to_lowercase();
            t.contains("hd") || t.contains("4k")
        })
        .take(3)
        .collect();

    if candidates.is_empty() { return Ok(vec![]); }

    // Fetch detail pages in parallel
    let detail_futs: Vec<_> = candidates.iter()
        .map(|item| dt_detail(&client, &item.url))
        .collect();
    let details = futures::future::join_all(detail_futs).await;

    // Download torrent files and extract hashes (sequentially to avoid hammering)
    let mut sources = Vec::new();
    for (item, detail) in candidates.iter().zip(details.into_iter()) {
        let Some((page_title, torrent_url)) = detail else { continue };
        let title = if page_title.is_empty() { item.title.clone() } else { page_title };
        let Some(magnet) = dt_torrent_to_magnet(&client, &torrent_url, &title).await else { continue };
        sources.push(TorrentSource {
            title,
            magnet,
            quality: dt_quality(&item.item_type).to_string(),
            codec: "x264".to_string(), // DivxTotal releases are predominantly x264
            language: TorrentLanguage::Es,
            size: "?".to_string(),
            seeds: 25,
            peers: 5,
            provider: "DivxTotal".to_string(),
            trusted: false,
        });
    }

    Ok(sources)
}

// DonTorrent ──────────────────────────────────────────────────────────────────

const DON_BASE: &str = "https://dontorrent.rocks";
const DON_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Cached Anubis JWT auth cookie (expires every ~12 hours)
static DON_ANUBIS_COOKIE: tokio::sync::Mutex<Option<(String, std::time::Instant)>> =
    tokio::sync::Mutex::const_new(None);

/// Solve SHA-256 PoW: find nonce where SHA256(data + str(nonce)) starts with `difficulty` hex zeros.
fn don_pow_solve(data: &str, difficulty: usize) -> (u64, String) {
    use sha2::Digest;
    let c = difficulty / 2;
    let l = difficulty % 2 != 0;
    let mut nonce = 0u64;
    loop {
        let input = format!("{}{}", data, nonce);
        let hash = sha2::Sha256::digest(input.as_bytes());
        let mut ok = hash[..c].iter().all(|&b| b == 0);
        if ok && l && (hash[c] >> 4) != 0 { ok = false; }
        if ok {
            let hash_hex: String = hash.iter().map(|b| format!("{:02x}", b)).collect();
            return (nonce, hash_hex);
        }
        nonce += 1;
    }
}

/// Get (or refresh) the Anubis browser-pow-auth cookie for dontorrent.rocks.
async fn don_get_auth_cookie(client: &reqwest::Client) -> anyhow::Result<String> {
    // Return cached cookie if fresh (< 10 hours old)
    {
        let guard = DON_ANUBIS_COOKIE.lock().await;
        if let Some((cookie, ts)) = guard.as_ref() {
            if ts.elapsed().as_secs() < 36_000 {
                return Ok(cookie.clone());
            }
        }
    }

    // 1. Fetch challenge page — capture headers before consuming body
    let resp = client
        .get(DON_BASE)
        .header("User-Agent", DON_UA)
        .send().await?;

    let verif_cookie = resp.headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find(|v| v.contains("browser-pow-cookie-verification"))
        .and_then(|v| v.split('=').nth(1))
        .and_then(|v| v.split(';').next())
        .unwrap_or("")
        .to_string();

    let html = resp.text().await?;

    // Parse Anubis challenge JSON
    let challenge_json = html
        .split(r#"id="anubis_challenge""#).nth(1)
        .and_then(|s| s.split('>').nth(1))
        .and_then(|s| s.split("</script>").next())
        .ok_or_else(|| anyhow::anyhow!("no anubis challenge found"))?;

    let challenge: serde_json::Value = serde_json::from_str(challenge_json.trim())?;
    let random_data = challenge["challenge"]["randomData"].as_str().unwrap_or("");
    let difficulty = challenge["rules"]["difficulty"].as_u64().unwrap_or(5) as usize;
    let chall_id = challenge["challenge"]["id"].as_str().unwrap_or("");

    // 2. Solve PoW
    let random_data = random_data.to_string();
    let chall_id = chall_id.to_string();
    let (nonce, hash_hex) = tokio::task::spawn_blocking(move || don_pow_solve(&random_data, difficulty)).await?;

    // 3. Submit to pass-challenge
    let pass_url = format!(
        "{}/.within.website/x/cmd/anubis/api/pass-challenge?id={}&response={}&nonce={}&redir=%2F&elapsedTime=500",
        DON_BASE, chall_id, hash_hex, nonce
    );

    let pass_resp = client
        .get(&pass_url)
        .header("User-Agent", DON_UA)
        .header("Cookie", format!("browser-pow-cookie-verification={}", verif_cookie))
        .send().await?;

    // The response sets browser-pow-auth cookie
    let auth_cookie = pass_resp.headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find(|v| v.contains("browser-pow-auth=ey"))
        .and_then(|v| v.split('=').nth(1))
        .and_then(|v| v.split(';').next())
        .ok_or_else(|| anyhow::anyhow!("no auth cookie in response"))?
        .to_string();

    let mut guard = DON_ANUBIS_COOKIE.lock().await;
    *guard = Some((auth_cookie.clone(), std::time::Instant::now()));

    Ok(auth_cookie)
}

fn don_parse_quality(quality_str: &str) -> &'static str {
    let q = quality_str.to_lowercase();
    if q.contains("4k") || q.contains("2160") { "4K" }
    else if q.contains("1080") || q.contains("bdremux") || q.contains("bluray") || q.contains("bdrip") { "1080p" }
    else if q.contains("720") || q.contains("hdrip") || q.contains("hd") { "720p" }
    else { "480p" }
}

async fn don_torrent_to_source(
    client: &reqwest::Client,
    auth: &str,
    content_id: u32,
    tabla: &str,
    title: &str,
    quality: &str,
) -> Option<TorrentSource> {
    // 1. Generate per-download PoW challenge
    let gen_resp: serde_json::Value = client
        .post(format!("{}/api_validate_pow.php", DON_BASE))
        .header("User-Agent", DON_UA)
        .header("Cookie", format!("browser-pow-auth={}", auth))
        .header("Referer", DON_BASE)
        .json(&serde_json::json!({"action":"generate","content_id":content_id,"tabla":tabla}))
        .send().await.ok()?
        .json().await.ok()?;

    if gen_resp["success"].as_bool() != Some(true) { return None; }
    let challenge = gen_resp["challenge"].as_str()?.to_string();

    // 2. Solve PoW (difficulty 3)
    let ch = challenge.clone();
    let (nonce, _) = tokio::task::spawn_blocking(move || don_pow_solve(&ch, 3)).await.ok()?;

    // 3. Validate and get download URL
    let val_resp: serde_json::Value = client
        .post(format!("{}/api_validate_pow.php", DON_BASE))
        .header("User-Agent", DON_UA)
        .header("Cookie", format!("browser-pow-auth={}", auth))
        .header("Referer", DON_BASE)
        .json(&serde_json::json!({"action":"validate","challenge":challenge,"nonce":nonce}))
        .send().await.ok()?
        .json().await.ok()?;

    if val_resp["success"].as_bool() != Some(true) { return None; }
    let dl_path = val_resp["download_url"].as_str()?;
    let torrent_url = if dl_path.starts_with("//") {
        format!("https:{}", dl_path)
    } else if dl_path.starts_with('/') {
        format!("{}{}", DON_BASE, dl_path)
    } else {
        dl_path.to_string()
    };

    // 4. Download torrent file and extract info hash
    let torrent_bytes = client
        .get(&torrent_url)
        .header("User-Agent", DON_UA)
        .header("Cookie", format!("browser-pow-auth={}", auth))
        .header("Referer", DON_BASE)
        .send().await.ok()?
        .bytes().await.ok()?;

    let hash = torrent_info_hash(&torrent_bytes)?;
    if !is_valid_btih(&hash) { return None; }

    Some(TorrentSource {
        title: title.to_string(),
        magnet: build_magnet(&hash, title),
        quality: don_parse_quality(quality).to_string(),
        codec: "x264".to_string(),
        language: TorrentLanguage::Es,
        size: "?".to_string(),
        seeds: 20,
        peers: 5,
        provider: "DonTorrent".to_string(),
        trusted: false,
    })
}

async fn search_dontorrent(query: &str, for_series: bool) -> anyhow::Result<Vec<TorrentSource>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()?;

    let auth = don_get_auth_cookie(&client).await.map_err(|e| {
        log::warn!("[dontorrent] Anubis PoW failed: {e}");
        e
    })?;

    // Search via POST
    let html = client
        .post(format!("{}/buscar", DON_BASE))
        .header("User-Agent", DON_UA)
        .header("Cookie", format!("browser-pow-auth={}", auth))
        .header("Referer", DON_BASE)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!("valor={}&Buscar=Buscar", urlencoding::encode(query)))
        .send().await?
        .text().await?;

    // Parse results into candidates before any await (scraper::Html is !Send)
    let candidates: Vec<(u32, String, String, String)> = {
        use scraper::{Html, Selector};
        let doc = Html::parse_document(&html);
        let type_kw = if for_series { "serie" } else { "pel" };
        let p_sel = Selector::parse("#buscador p").unwrap();
        let a_sel = Selector::parse("a[href]").unwrap();

        let mut out = Vec::new();
        for p in doc.select(&p_sel) {
            let href = match p.select(&a_sel).next().and_then(|a| a.value().attr("href")) {
                Some(h) => h,
                None => continue,
            };
            if !href.contains(type_kw) { continue; }

            let title = p.select(&a_sel).next()
                .map(|a| a.text().collect::<String>().trim().to_string())
                .unwrap_or_default();
            if title.is_empty() { continue; }

            let quality = regex_quality_span(&p.html()).unwrap_or_default();
            let id: u32 = href.split('/').find_map(|s| s.parse().ok()).unwrap_or(0);
            if id == 0 { continue; }

            let tabla = if href.contains("/serie") { "series" } else { "peliculas" };
            out.push((id, tabla.to_string(), title, quality));
            if out.len() >= 3 { break; }
        }
        out
    };

    if candidates.is_empty() { return Ok(vec![]); }

    // Resolve magnets sequentially (each needs its own PoW challenge)
    let mut sources = Vec::new();
    for (id, tabla, title, quality) in candidates {
        if let Some(src) = don_torrent_to_source(&client, &auth, id, &tabla, &title, &quality).await {
            sources.push(src);
        }
    }

    Ok(sources)
}

fn regex_quality_span(html: &str) -> Option<String> {
    // Match: <span>(Quality text)</span>
    let start = html.find("</a>")?;
    let after = &html[start..];
    let s = after.find(">(")? + 1;
    let e = after[s..].find(")</")? + s + 1;
    Some(after[s..e].trim_matches(|c| c == '(' || c == ')' || c == ' ').to_string())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn build_magnet(hash: &str, name: &str) -> String {
    // Normalize hash: lowercase, no whitespace
    let hash = hash.trim().to_lowercase();
    let trackers = [
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://open.stealth.si:80/announce",
        "udp://tracker.torrent.eu.org:451/announce",
        "udp://tracker.tiny-vps.com:6969/announce",
        "udp://p4p.arenabg.com:1337/announce",
        "udp://tracker.openbittorrent.com:6969/announce",
        "udp://explodie.org:6969/announce",
        "udp://tracker.dler.org:6969/announce",
        "udp://open.demonii.com:1337/announce",
        "https://tracker.gbitt.info/announce",
        "https://tr.burnbit.com/announce",
    ];
    let tr: String = trackers.iter().map(|t| format!("&tr={}", urlencoding::encode(t))).collect();
    format!("magnet:?xt=urn:btih:{}&dn={}{}", hash, urlencoding::encode(name), tr)
}

fn is_valid_btih(hash: &str) -> bool {
    let h = hash.trim();
    // SHA-1 v1: 40 hex chars. Base32 v1: 32 chars. SHA-256 v2: 64 hex chars.
    let valid_len = h.len() == 40 || h.len() == 32 || h.len() == 64;
    let all_hex_or_b32 = h.chars().all(|c| c.is_ascii_alphanumeric());
    valid_len && all_hex_or_b32 && h != "0000000000000000000000000000000000000000"
}

fn detect_quality(title: &str) -> String {
    let t = title.to_lowercase();
    if t.contains("2160p") || t.contains("4k") || t.contains("uhd") {
        "4K".to_string()
    } else if t.contains("1080p") || t.contains("1080i") {
        "1080p".to_string()
    } else if t.contains("720p") {
        "720p".to_string()
    } else {
        "480p".to_string()
    }
}

fn format_size(bytes: u64) -> String {
    if bytes == 0 {
        return "?".to_string();
    }
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else {
        format!("{:.0} MB", bytes as f64 / 1_048_576.0)
    }
}

// ─── Network Folder Browser ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct FolderEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: String,
    pub extension: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedFolder {
    pub name: String,
    pub path: String,
}

const MEDIA_EXTS: &[&str] = &[
    "mkv", "mp4", "avi", "m4v", "mov", "ts", "wmv", "webm", "m2ts", "mpg", "mpeg",
    "flac", "mp3", "aac", "m4a", "ogg", "wav", "opus",
];

fn is_media_ext(ext: &str) -> bool {
    MEDIA_EXTS.contains(&ext)
}

#[tauri::command]
pub async fn browse_folder(path: String) -> Result<Vec<FolderEntry>, String> {
    if path.starts_with("smb://") {
        #[cfg(windows)]
        return browse_via_smb_windows(&path).await;
        #[cfg(not(windows))]
        return browse_via_smbclient(&path).await;
    }
    browse_local_path(&path).await
}

async fn browse_local_path(path: &str) -> Result<Vec<FolderEntry>, String> {
    let mut dir = tokio::fs::read_dir(path).await
        .map_err(|e| format!("No se puede abrir '{path}': {e}"))?;
    let mut entries = Vec::new();
    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }
        let Ok(meta) = entry.metadata().await else { continue };
        let is_dir = meta.is_dir();
        let ext = entry.path()
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !is_dir && !is_media_ext(&ext) { continue; }
        entries.push(FolderEntry {
            path: entry.path().to_string_lossy().to_string(),
            size: if is_dir { String::new() } else { format_size(meta.len()) },
            name, is_dir, extension: ext,
        });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

// Parse smb://[user:pass@]host[/share[/subpath]]
// Returns (user, pass, host, share, subpath).
// Uses rfind('@') so passwords containing '@' are handled correctly.
fn parse_smb_url(url: &str) -> (String, String, String, String, String) {
    let without_scheme = url.trim_start_matches("smb://");
    let (creds, hostpath) = match without_scheme.rfind('@') {
        Some(at) => (&without_scheme[..at], &without_scheme[at + 1..]),
        None => ("", without_scheme),
    };
    let (user, pass) = if creds.is_empty() {
        (String::new(), String::new())
    } else if let Some(colon) = creds.find(':') {
        (creds[..colon].to_string(), creds[colon + 1..].to_string())
    } else {
        (creds.to_string(), String::new())
    };
    let mut parts = hostpath.splitn(3, '/');
    let host = parts.next().unwrap_or("").to_string();
    let share = parts.next().unwrap_or("").to_string();
    let subpath = parts.next().unwrap_or("").to_string();
    (user, pass, host, share, subpath)
}

#[cfg(not(windows))]
fn smb_auth_args(user: &str, pass: &str) -> Vec<String> {
    if user.is_empty() {
        // guest% = user "guest" with empty password; more compatible than bare -N
        vec!["-U".to_string(), "guest%".to_string()]
    } else {
        vec!["-U".to_string(), format!("{}%{}", user, pass)]
    }
}

#[cfg(not(windows))]
async fn browse_via_smbclient(url: &str) -> Result<Vec<FolderEntry>, String> {
    let (user, pass, host, share, subpath) = parse_smb_url(url);
    if host.is_empty() {
        return Err("URL SMB inválida".to_string());
    }
    if share.is_empty() {
        smb_list_shares(&host, &user, &pass, url).await
    } else {
        smb_list_files(&host, &share, &subpath, &user, &pass, url).await
    }
}

#[cfg(not(windows))]
async fn smb_list_shares(host: &str, user: &str, pass: &str, base_url: &str) -> Result<Vec<FolderEntry>, String> {
    let mut args: Vec<String> = vec!["-L".to_string(), format!("//{}", host), "-g".to_string()];
    args.extend(smb_auth_args(user, pass));

    let out = proc_cmd(smbclient_bin())
        .args(&args)
        .output()
        .await
        .map_err(|_| "smbclient no encontrado. Instala el paquete 'samba'.".to_string())?;

    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        if stderr.contains("LOGON_FAILURE") || stderr.contains("WRONG_PASSWORD") {
            return Err("Credenciales incorrectas. Verifica usuario y contraseña.".to_string());
        }
        if stderr.contains("ACCOUNT_DISABLED") || stderr.contains("GUEST_ACCESS_DENIED") {
            return Err("El servidor no permite acceso de invitado. Introduce usuario y contraseña.".to_string());
        }
        if stderr.contains("ACCESS_DENIED") || stderr.contains("NT_STATUS_ACCESS_DENIED") {
            return Err("Acceso denegado. El servidor requiere usuario y contraseña.".to_string());
        }
        if stderr.contains("CONNECTION_REFUSED") || stderr.contains("NETWORK_UNREACHABLE") || stderr.contains("failed") {
            return Err(format!("No se puede conectar a {host}. Verifica la IP y que SMB esté activo."));
        }
        // Return meaningful lines from stderr (skip smb.conf warnings)
        let useful: Vec<&str> = stderr.lines()
            .filter(|l| !l.contains("smb.conf") && !l.trim().is_empty())
            .collect();
        if useful.is_empty() {
            return Err(format!("No se puede acceder a {host}. Comprueba que SMB está activo y la IP es correcta."));
        }
        return Err(format!("Error SMB: {}", useful.join(" | ")));
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let base = base_url.trim_end_matches('/');
    let entries: Vec<FolderEntry> = stdout.lines()
        .filter(|l| l.starts_with("Disk|"))
        .filter_map(|l| {
            let mut parts = l.splitn(3, '|');
            parts.next();
            let name = parts.next()?.trim().to_string();
            if name.is_empty() { return None; }
            Some(FolderEntry { path: format!("{}/{}", base, name), name, is_dir: true, size: String::new(), extension: String::new() })
        })
        .collect();

    if entries.is_empty() {
        return Err("No se encontraron recursos compartidos (Disk) en el servidor.".to_string());
    }
    Ok(entries)
}

#[cfg(not(windows))]
fn parse_smb_ls_line(line: &str) -> Option<(String, bool)> {
    if !line.starts_with("  ") { return None; }
    let tokens: Vec<&str> = line.split_whitespace().collect();
    // Need at least: name attrs size weekday month day time year = 8 tokens
    if tokens.len() < 8 { return None; }
    let n = tokens.len();
    let attrs = tokens[n - 7];
    let size_tok = tokens[n - 6];
    if !attrs.chars().all(|c| "DAHRSCN".contains(c)) { return None; }
    if !size_tok.chars().all(|c| c.is_ascii_digit()) { return None; }
    let name = tokens[..n - 7].join(" ");
    if name.is_empty() || name == "." || name == ".." { return None; }
    Some((name, attrs.contains('D')))
}

#[cfg(not(windows))]
async fn smb_list_files(host: &str, share: &str, subpath: &str, user: &str, pass: &str, base_url: &str) -> Result<Vec<FolderEntry>, String> {
    // "cd subpath; ls" to list directory contents.
    // "ls subpath" only shows the entry itself, not its children.
    // Use backslash separator (native SMB) and chain cd levels for deep paths.
    let ls_cmd = if subpath.is_empty() {
        "ls".to_string()
    } else {
        let smb_path = subpath.replace('/', "\\").replace('"', "\\\"");
        format!("cd \"{}\"; ls", smb_path)
    };

    let mut args: Vec<String> = vec![format!("//{}/{}", host, share), "-c".to_string(), ls_cmd];
    args.extend(smb_auth_args(user, pass));

    let out = proc_cmd(smbclient_bin())
        .args(&args)
        .output()
        .await
        .map_err(|_| "smbclient no encontrado.".to_string())?;

    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);

    if !out.status.success() {
        if stderr.contains("LOGON_FAILURE") || stderr.contains("WRONG_PASSWORD") {
            return Err("Credenciales incorrectas.".to_string());
        }
        // smbclient sometimes writes errors to stdout
        let err_lines: Vec<&str> = stdout.lines().chain(stderr.lines())
            .filter(|l| {
                let l = l.trim();
                !l.is_empty() && !l.contains("smb.conf") && !l.starts_with("smb:")
                    && !l.contains("blocks of size")
            })
            .collect();
        let msg = if err_lines.is_empty() {
            format!("smbclient falló (código {})", out.status.code().unwrap_or(-1))
        } else {
            err_lines.join(" | ")
        };
        return Err(format!("Error listando archivos: {}", msg));
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let base = base_url.trim_end_matches('/');
    let mut entries: Vec<FolderEntry> = stdout.lines()
        .filter_map(|line| {
            let (name, is_dir) = parse_smb_ls_line(line)?;
            let ext = if is_dir {
                String::new()
            } else {
                std::path::Path::new(&name)
                    .extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase()
            };
            if !is_dir && !is_media_ext(&ext) { return None; }
            Some(FolderEntry { path: format!("{}/{}", base, name), name, is_dir, size: String::new(), extension: ext })
        })
        .collect();

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

// ─── Windows SMB (rutas UNC + net use para auth) ──────────────────────────────

/// Convierte smb://host/share/sub → \\host\share\sub
#[cfg(windows)]
fn smb_to_unc(host: &str, share: &str, subpath: &str) -> String {
    if share.is_empty() {
        format!(r"\\{}", host)
    } else if subpath.is_empty() {
        format!(r"\\{}\{}", host, share)
    } else {
        format!(r"\\{}\{}\{}", host, share, subpath.replace('/', r"\"))
    }
}

/// Autentica contra el servidor con `net use \\host\IPC$`
/// Sintaxis: net use <target> [password] [/user:username] /persistent:no
#[cfg(windows)]
async fn smb_authenticate_windows(host: &str, user: &str, pass: &str) -> Result<(), String> {
    let target = format!(r"\\{}\IPC$", host);
    let mut args = vec!["use".to_string(), target];
    if !user.is_empty() {
        // password (empty string = no password), then /user:name
        args.push(if pass.is_empty() { "\"\"".to_string() } else { pass.to_string() });
        args.push(format!("/user:{}", user));
    }
    // Without user: let Windows negotiate (guest / current session)
    args.push("/persistent:no".to_string());

    let out = proc_cmd("net")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("net use falló: {e}"))?;

    if !out.status.success() {
        let msg = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
        // "Multiple connections" = ya autenticado, está bien
        if msg.contains("1219") || msg.contains("multiple connections") || msg.contains("multiple") { return Ok(()); }
        if msg.contains("1326") || msg.contains("Logon failure") || msg.contains("denegado") {
            return Err("Credenciales incorrectas.".to_string());
        }
        return Err(format!("Error de autenticación SMB: {}", msg.trim()));
    }
    Ok(())
}

#[cfg(windows)]
async fn browse_via_smb_windows(url: &str) -> Result<Vec<FolderEntry>, String> {
    let (user, pass, host, share, subpath) = parse_smb_url(url);
    if host.is_empty() { return Err("URL SMB inválida".to_string()); }

    if !user.is_empty() || !pass.is_empty() {
        smb_authenticate_windows(&host, &user, &pass).await?;
    }

    // Sin share → listar shares del servidor con `net view \\host /all`
    if share.is_empty() {
        let out = proc_cmd("net")
            .args(["view", &format!(r"\\{}", host), "/all"])
            .output().await
            .map_err(|e| format!("net view falló: {e}"))?;

        let stdout = String::from_utf8_lossy(&out.stdout);
        let base = url.trim_end_matches('/');
        let entries: Vec<FolderEntry> = stdout.lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() < 2 { return None; }
                let kind = parts.get(1)?;
                if !kind.eq_ignore_ascii_case("Disk") && !kind.eq_ignore_ascii_case("Disco") { return None; }
                let name = parts[0].to_string();
                Some(FolderEntry { path: format!("{}/{}", base, name), name, is_dir: true, size: String::new(), extension: String::new() })
            })
            .collect();

        return if entries.is_empty() {
            Err("No se encontraron recursos compartidos.".to_string())
        } else {
            Ok(entries)
        };
    }

    // Con share → leer directorio via UNC
    let unc = smb_to_unc(&host, &share, &subpath);
    let base = url.trim_end_matches('/');
    let mut dir = tokio::fs::read_dir(&unc).await
        .map_err(|e| format!("No se puede acceder a {unc}: {e}"))?;

    let mut entries = Vec::new();
    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }
        let Ok(meta) = entry.metadata().await else { continue };
        let is_dir = meta.is_dir();
        let ext = if is_dir { String::new() } else {
            std::path::Path::new(&name).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase()
        };
        if !is_dir && !is_media_ext(&ext) { continue; }
        entries.push(FolderEntry { path: format!("{}/{}", base, name), name, is_dir, size: String::new(), extension: ext });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

fn cache_base_dir() -> std::path::PathBuf {
    std::env::var("XDG_CACHE_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("HOME")
                .map(|h| std::path::PathBuf::from(h).join(".cache"))
                .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"))
        })
        .join("streamdeck")
}

pub fn smb_cache_dir() -> std::path::PathBuf {
    cache_base_dir().join("smb")
}

#[tauri::command]
pub async fn clear_smb_cache() -> Result<(), String> {
    let _ = tokio::fs::remove_dir_all(smb_cache_dir()).await;
    Ok(())
}

/// Returns total bytes used by ~/.cache/streamdeck
#[tauri::command]
pub async fn get_cache_size() -> Result<u64, String> {
    let root = cache_base_dir();
    if !root.exists() {
        return Ok(0);
    }
    let mut total: u64 = 0;
    let mut stack = vec![root];
    while let Some(dir) = stack.pop() {
        let mut rd = match tokio::fs::read_dir(&dir).await {
            Ok(rd) => rd,
            Err(_) => continue,
        };
        while let Ok(Some(entry)) = rd.next_entry().await {
            let meta = match entry.metadata().await {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    Ok(total)
}

/// Removes everything under ~/.cache/streamdeck
#[tauri::command]
pub async fn clear_cache() -> Result<(), String> {
    let root = cache_base_dir();
    if root.exists() {
        tokio::fs::remove_dir_all(&root).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Start downloading an SMB file to cache and return the local path once
/// enough data is available to start playback. The download continues in the
/// background so ffmpeg can read the growing file while it downloads.
#[tauri::command]
pub async fn fetch_smb_to_cache(url: String) -> Result<String, String> {
    #[cfg(windows)]
    return fetch_smb_to_cache_windows(&url).await;
    #[cfg(not(windows))]
    return fetch_smb_to_cache_linux(url).await;
}

/// Windows: accede al archivo directo via ruta UNC (mpv/ffmpeg las soportan nativamente)
#[cfg(windows)]
async fn fetch_smb_to_cache_windows(url: &str) -> Result<String, String> {
    let (user, pass, host, share, subpath) = parse_smb_url(url);
    if host.is_empty() || share.is_empty() || subpath.is_empty() {
        return Err("URL SMB inválida: se necesita smb://[user:pass@]host/share/archivo".to_string());
    }

    if !user.is_empty() || !pass.is_empty() {
        smb_authenticate_windows(&host, &user, &pass).await?;
    }

    let unc = smb_to_unc(&host, &share, &subpath);
    // mpv y ffmpeg soportan rutas UNC en Windows — no necesitamos copiar
    if !std::path::Path::new(&unc).exists() {
        return Err(format!("No se puede acceder a: {unc}"));
    }
    Ok(unc)
}

#[cfg(not(windows))]
async fn fetch_smb_to_cache_linux(url: String) -> Result<String, String> {
    let (user, pass, host, share, subpath) = parse_smb_url(&url);
    if host.is_empty() || share.is_empty() || subpath.is_empty() {
        return Err("URL SMB inválida: se necesita smb://[user:pass@]host/share/archivo".to_string());
    }

    let hash: u64 = url.bytes().fold(0u64, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u64));
    let ext = subpath.rsplit('.').next()
        .filter(|e| e.len() <= 5 && !e.contains('/'))
        .unwrap_or("mkv");
    let cache_dir = smb_cache_dir();
    let cache_path = cache_dir.join(format!("{:016x}.{}", hash, ext));
    let cache_path = cache_path.to_string_lossy().to_string();

    // Already fully downloaded — return instantly.
    if std::path::Path::new(&cache_path).exists() {
        return Ok(cache_path);
    }

    tokio::fs::create_dir_all(&cache_dir).await.map_err(|e| e.to_string())?;

    // Build smbclient "cd <dir>; get <file> <local>" command.
    // smbget doesn't support --option flags so we use smbclient instead.
    let (file_dir, fname) = match subpath.rfind('/') {
        Some(p) => (&subpath[..p], &subpath[p + 1..]),
        None => ("", subpath.as_str()),
    };
    let get_cmd = if file_dir.is_empty() {
        format!("get \"{}\" \"{}\"", fname.replace('"', "\\\""), cache_path)
    } else {
        let smb_dir = file_dir.replace('/', "\\").replace('"', "\\\"");
        format!("cd \"{}\"; get \"{}\" \"{}\"", smb_dir, fname.replace('"', "\\\""), cache_path)
    };

    let mut args: Vec<String> = vec![
        format!("//{}/{}", host, share),
        "-c".to_string(),
        get_cmd,
    ];
    args.extend(smb_auth_args(&user, &pass));

    // Verify the connection works before spawning the background task.
    // Run a quick "ls" first so we get a clear error if credentials are wrong.
    let mut check_args: Vec<String> = vec![
        format!("//{}/{}", host, share),
        "-c".to_string(),
        "ls".to_string(),
    ];
    check_args.extend(smb_auth_args(&user, &pass));
    let check = proc_cmd(smbclient_bin())
        .args(&check_args)
        .output()
        .await
        .map_err(|_| "smbclient no encontrado".to_string())?;
    if !check.status.success() {
        let stderr = String::from_utf8_lossy(&check.stderr);
        if stderr.contains("LOGON_FAILURE") || stderr.contains("WRONG_PASSWORD") {
            return Err("Credenciales incorrectas.".to_string());
        }
        return Err(format!("No se puede conectar al NAS: {}",
            stderr.lines().filter(|l| !l.contains("smb.conf") && !l.trim().is_empty())
                  .collect::<Vec<_>>().join(" ")));
    }

    // Start the actual download in the background.
    let cache_path_bg = cache_path.clone();
    tokio::spawn(async move {
        proc_cmd(smbclient_bin())
            .args(&args)
            .status()
            .await
            .ok();
        // If download failed/empty, remove the partial file.
        if let Ok(meta) = tokio::fs::metadata(&cache_path_bg).await {
            if meta.len() == 0 {
                let _ = tokio::fs::remove_file(&cache_path_bg).await;
            }
        }
    });

    // Wait until we have at least 10 MB — enough for ffprobe + ffmpeg to start.
    let min_bytes: u64 = 10 * 1024 * 1024;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
    loop {
        if tokio::time::Instant::now() > deadline {
            let _ = tokio::fs::remove_file(&cache_path).await;
            return Err("Timeout: el NAS tardó demasiado en enviar datos. Verifica la red.".to_string());
        }
        match tokio::fs::metadata(&cache_path).await {
            Ok(m) if m.len() >= min_bytes => break,
            _ => {}
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }

    Ok(cache_path)
}

fn folders_config_path() -> std::path::PathBuf {
    dirs_next::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
        .join("streamdeck")
        .join("folders.json")
}

#[tauri::command]
pub async fn get_saved_folders() -> Result<Vec<SavedFolder>, String> {
    let p = folders_config_path();
    if !p.exists() { return Ok(vec![]); }
    let data = tokio::fs::read_to_string(&p).await.map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_folder(name: String, path: String) -> Result<(), String> {
    let mut folders = get_saved_folders().await.unwrap_or_default();
    if !folders.iter().any(|f| f.path == path) {
        folders.push(SavedFolder { name, path });
    }
    write_folders(&folders).await
}

#[tauri::command]
pub async fn remove_folder(path: String) -> Result<(), String> {
    let mut folders = get_saved_folders().await.unwrap_or_default();
    folders.retain(|f| f.path != path);
    write_folders(&folders).await
}

async fn write_folders(folders: &[SavedFolder]) -> Result<(), String> {
    let p = folders_config_path();
    if let Some(parent) = p.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(folders).map_err(|e| e.to_string())?;
    tokio::fs::write(&p, data).await.map_err(|e| e.to_string())
}

// ── OpenSubtitles ─────────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct SubtitleResult {
    pub file_id: u64,
    pub file_name: String,
    pub language: String,
    pub release: String,
    pub download_count: u64,
}

#[tauri::command]
pub async fn search_subtitles(
    imdb_id: Option<String>,
    query: Option<String>,
    language: String,
    season: Option<u32>,
    episode_num: Option<u32>,
    api_key: String,
) -> Result<Vec<SubtitleResult>, String> {
    if api_key.trim().is_empty() {
        return Err("opensubtitles_no_key".to_string());
    }
    let client = reqwest::Client::new();
    let mut url = String::from("https://api.opensubtitles.com/api/v1/subtitles?order_by=download_count&order_direction=desc");
    url.push_str(&format!("&languages={}", urlencoding::encode(&language)));
    if let Some(id) = &imdb_id {
        let clean = id.trim_start_matches("tt");
        url.push_str(&format!("&imdb_id={}", clean));
    }
    if let Some(q) = &query {
        url.push_str(&format!("&query={}", urlencoding::encode(q)));
    }
    if let Some(s) = season {
        url.push_str(&format!("&season_number={}", s));
    }
    if let Some(e) = episode_num {
        url.push_str(&format!("&episode_number={}", e));
    }

    let res = client
        .get(&url)
        .header("Api-Key", &api_key)
        .header("User-Agent", "TheFoundry StreamDeck v1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("OpenSubtitles error {}: {}", status, body.chars().take(200).collect::<String>()));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let mut results: Vec<SubtitleResult> = vec![];
    if let Some(data) = json["data"].as_array() {
        for item in data.iter().take(15) {
            let attrs = &item["attributes"];
            let files = match attrs["files"].as_array() { Some(f) => f, None => continue };
            for file in files.iter().take(1) {
                let file_id = match file["file_id"].as_u64() { Some(id) if id > 0 => id, _ => continue };
                results.push(SubtitleResult {
                    file_id,
                    file_name: file["file_name"].as_str().unwrap_or("").to_string(),
                    language: attrs["language"].as_str().unwrap_or("").to_string(),
                    release: attrs["release"].as_str().unwrap_or(
                        file["file_name"].as_str().unwrap_or("Sin nombre")
                    ).to_string(),
                    download_count: attrs["download_count"].as_u64().unwrap_or(0),
                });
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn download_subtitle(file_id: u64, api_key: String) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("opensubtitles_no_key".to_string());
    }
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "file_id": file_id });
    let res = client
        .post("https://api.opensubtitles.com/api/v1/download")
        .header("Api-Key", &api_key)
        .header("User-Agent", "TheFoundry StreamDeck v1.0")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Error descargando subtítulo ({}): {}", status, text.chars().take(200).collect::<String>()));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let link = json["link"].as_str().ok_or("Sin enlace de descarga en la respuesta")?;

    let content = client
        .get(link)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    Ok(content)
}
