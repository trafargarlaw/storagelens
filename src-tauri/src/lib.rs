mod commands;
mod models;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_volumes,
            commands::start_scan,
            commands::get_children,
            commands::get_node_path,
            commands::reveal_in_finder,
            commands::get_scan_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
