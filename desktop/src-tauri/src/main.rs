// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The editor finds the HTTP plugin as window.__TAURI__.http and uses it for the stage's
// requests (editor/src/lib/net.ts), so they're made natively and CORS doesn't apply.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running Stitch");
}
