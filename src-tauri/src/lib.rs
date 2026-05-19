mod commands;
mod torrent_manager;

use commands::AppState;
use std::sync::Arc;
use tauri::Manager;
use torrent_manager::TorrentManager;

#[cfg(target_os = "linux")]
fn fix_gtk_pixbuf_env() {
    // Point GTK to the system pixbuf loaders cache so it never tries to write
    // a new one at startup. Without this, GTK crashes with ENOSPC (or SIGABRT)
    // on systems where the cache path is not writable or is on a tmpfs.
    if std::env::var("GDK_PIXBUF_MODULE_FILE").is_ok() {
        return;
    }
    let candidates = [
        "/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache",
        "/usr/lib64/gdk-pixbuf-2.0/2.10.0/loaders.cache",
        "/usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/2.10.0/loaders.cache",
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            std::env::set_var("GDK_PIXBUF_MODULE_FILE", path);
            return;
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    fix_gtk_pixbuf_env();

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

            // Guardar resource_dir para que ff_bin() / mpv_bin() encuentren los binarios del bundle
            if let Ok(dir) = app.path().resource_dir() {
                torrent_manager::RESOURCE_DIR.set(dir).ok();
            }

            // Clean SMB download cache left over from previous session
            let _ = std::fs::remove_dir_all(commands::smb_cache_dir());

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
            commands::get_youtube_stream_url,
            commands::search_subtitles,
            commands::download_subtitle,
            commands::clear_smb_cache,
            commands::get_cache_size,
            commands::clear_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
