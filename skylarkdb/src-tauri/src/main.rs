#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod models;

use tauri::Manager;
use tauri::LogicalSize;
use tauri::Size;

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
            commands::mysql::get_mysql_routines,
            commands::mysql::insert_mysql_record,
            commands::mysql::update_mysql_record,
            commands::mysql::delete_mysql_record,
            commands::mysql::export_mysql_data,
            commands::mysql::import_mysql_data,
            commands::mysql::get_mysql_type_mapping,
            commands::mysql::init_sakila_docker,
            commands::mysql::generate_sakila_docker_compose,
            commands::mysql::get_sakila_schema,
            commands::mysql::get_sakila_data,
            commands::redis::connect_redis,
            commands::redis::test_redis_connection,
            commands::redis::disconnect_redis,
            commands::redis::get_redis_keys,
            commands::redis::get_redis_value,
            commands::redis::delete_redis_key,
            commands::redis::get_redis_info,
            commands::redis::get_redis_databases,
            commands::redis::select_redis_database,
            commands::redis::get_selected_redis_database,
        ])
        .setup(|app| {
            // 双重兜底：即便配置未生效，也强制最小窗口尺寸，避免 UI 被拖到变形
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_min_size(Some(Size::Logical(LogicalSize::new(1024.0, 720.0))));
            }
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
