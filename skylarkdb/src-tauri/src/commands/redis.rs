use crate::database::redis;
use crate::models::*;
use tauri::command;

#[command]
pub async fn connect_redis(connection: DatabaseConnection) -> Result<ConnectionResult, String> {
    redis::connect(&connection).await
}

#[command]
pub async fn test_redis_connection(
    host: String,
    port: u16,
    password: Option<String>,
    connection_id: Option<String>,
    use_stored_secret: Option<bool>,
) -> Result<ConnectionResult, String> {
    redis::test_connection(
        &host,
        port,
        &password,
        connection_id.as_deref(),
        use_stored_secret.unwrap_or(false),
    )
    .await
}

#[command]
pub async fn disconnect_redis(connection_id: String) -> Result<(), String> {
    redis::disconnect(&connection_id).await
}

#[command]
pub async fn get_redis_keys(
    connection_id: String,
    pattern: String,
) -> Result<Vec<RedisKey>, String> {
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

#[command]
pub async fn set_redis_key(
    connection_id: String,
    key: String,
    value: String,
    key_type: String,
    ttl: Option<i64>,
) -> Result<(), String> {
    redis::set_key(&connection_id, &key, &value, &key_type, ttl).await
}

#[command]
pub async fn set_redis_key_ttl(
    connection_id: String,
    key: String,
    ttl: i64,
) -> Result<(), String> {
    redis::set_ttl(&connection_id, &key, ttl).await
}

#[command]
pub async fn rename_redis_key(
    connection_id: String,
    old_key: String,
    new_key: String,
) -> Result<(), String> {
    redis::rename_key(&connection_id, &old_key, &new_key).await
}

#[command]
pub async fn export_redis_key(
    connection_id: String,
    key: String,
    format: String,
    output_path: String,
) -> Result<ExportResult, String> {
    redis::export_key(&connection_id, &key, &format, &output_path).await
}

#[command]
pub async fn import_redis_data(
    connection_id: String,
    file_path: String,
    format: String,
) -> Result<ImportResult, String> {
    redis::import_data(&connection_id, &file_path, &format).await
}
