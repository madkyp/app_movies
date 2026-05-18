mod commands;
mod torrent_manager;

use commands::AppState;
use std::sync::Arc;
use tauri::Manager;
use torrent_manager::TorrentManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Silence librqbit's noisy peer-churn ERROR spans (normal BitTorrent behavior)
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "warn,librqbit=warn,librqbit_dht=warn,tracing::span=off");
    }

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Warn)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_shell::init())?;

            // Block on async TorrentManager init so we can call app.manage() synchronously
            let manager = tauri::async_runtime::block_on(TorrentManager::new())
                .unwrap_or_else(|e| {
                    log::error!("TorrentManager init failed: {e}");
                    panic!("Cannot start without torrent manager: {e}");
                });

            app.manage(AppState {
                torrent_manager: Arc::new(manager),
            });

            // On Windows, resolve bundled binary paths and expose via env vars
            // so ffmpeg/ffprobe/mpv helpers can find them without AppHandle access.
            #[cfg(target_os = "windows")]
            if let Ok(resource_dir) = app.path().resource_dir() {
                for bin in &["ffmpeg", "ffprobe", "mpv"] {
                    let path = resource_dir.join(format!("{}.exe", bin));
                    if path.exists() {
                        std::env::set_var(
                            format!("STREAMDECK_{}", bin.to_uppercase()),
                            path.to_string_lossy().as_ref(),
                        );
                    }
                }
            }

            log::info!("StreamDeck started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_torrent,
            commands::get_torrent_stats,
            commands::find_video_file,
            commands::stop_torrent,
            commands::search_yts,
            commands::search_eztv,
            commands::open_in_mpv,
            commands::browse_folder,
            commands::get_saved_folders,
            commands::save_folder,
            commands::remove_folder,
            commands::fetch_smb_to_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
