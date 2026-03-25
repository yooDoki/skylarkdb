mod commands;
mod database;
mod models;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::mysql::connect_mysql,
            commands::mysql::test_mysql_connection,
            commands::mysql::get_mysql_table_data,
            commands::mysql::disconnect_mysql,
            commands::mysql::get_mysql_tables,
            commands::mysql::get_mysql_columns,
            commands::mysql::execute_mysql_query,
            commands::redis::connect_redis,
            commands::redis::test_redis_connection,
            commands::redis::disconnect_redis,
            commands::redis::get_redis_keys,
            commands::redis::get_redis_value,
            commands::redis::delete_redis_key,
            commands::redis::get_redis_info,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
