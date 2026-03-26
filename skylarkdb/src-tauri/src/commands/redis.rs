use tauri::command;
use crate::database::redis;
use crate::models::*;

#[command]
pub async fn connect_redis(connection: DatabaseConnection) -> Result<ConnectionResult, String> {
    redis::connect(&connection).await
}

#[command]
pub async fn test_redis_connection(
    host: String,
    port: u16,
    password: Option<String>,
) -> Result<ConnectionResult, String> {
    redis::test_connection(&host, port, &password).await
}

#[command]
pub async fn disconnect_redis(connection_id: String) -> Result<(), String> {
    redis::disconnect(&connection_id).await
}

#[command]
pub async fn get_redis_keys(connection_id: String, pattern: String) -> Result<Vec<RedisKey>, String> {
    redis::get_keys(&connection_id, &pattern).await
}

#[command]
pub async fn get_redis_value(connection_id: String, key: String) -> Result<String, String> {
    redis::get_value(&connection_id, &key).await
}

#[command]
pub async fn delete_redis_key(connection_id: String, key: String) -> Result<bool, String> {
    redis::delete_key(&connection_id, &key).await
}

#[command]
pub async fn get_redis_info(connection_id: String) -> Result<RedisInfo, String> {
    redis::get_info(&connection_id).await
}

#[command]
pub async fn get_redis_databases(connection_id: String) -> Result<Vec<RedisDatabase>, String> {
    redis::get_databases(&connection_id).await
}

#[command]
pub async fn select_redis_database(connection_id: String, db_index: i64) -> Result<(), String> {
    redis::select_database(&connection_id, db_index).await
}

#[command]
pub async fn get_selected_redis_database(connection_id: String) -> Result<i64, String> {
    Ok(redis::get_selected_database(&connection_id).await)
}
