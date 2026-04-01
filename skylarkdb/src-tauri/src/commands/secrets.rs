use crate::secrets;
use tauri::command;

#[command]
pub async fn save_connection_password(connection_id: String, password: String) -> Result<(), String> {
    secrets::save_connection_password(&connection_id, &password).await
}

#[command]
pub async fn delete_connection_password(connection_id: String) -> Result<(), String> {
    secrets::delete_connection_password(&connection_id).await
}
