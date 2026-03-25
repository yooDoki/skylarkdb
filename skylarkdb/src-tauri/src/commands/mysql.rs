use tauri::command;
use crate::database::mysql;
use crate::models::*;

#[command]
pub async fn connect_mysql(connection: DatabaseConnection) -> Result<ConnectionResult, String> {
    mysql::connect(&connection).await
}

#[command]
pub async fn test_mysql_connection(
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
    database: Option<String>,
    ssl: bool,
) -> Result<ConnectionResult, String> {
    mysql::test_connection(&host, port, &username, &password, &database, ssl).await
}

#[command]
pub async fn get_mysql_table_data(
    connection_id: String,
    table_name: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<TableDataResult, String> {
    mysql::get_table_data(&connection_id, &table_name, limit.unwrap_or(100), offset.unwrap_or(0)).await
}

#[command]
pub async fn disconnect_mysql(connection_id: String) -> Result<(), String> {
    mysql::disconnect(&connection_id).await
}

#[command]
pub async fn get_mysql_tables(connection_id: String) -> Result<Vec<MySQLTable>, String> {
    mysql::get_tables(&connection_id).await
}

#[command]
pub async fn get_mysql_columns(connection_id: String, table_name: String) -> Result<Vec<MySQLColumn>, String> {
    mysql::get_columns(&connection_id, &table_name).await
}

#[command]
pub async fn execute_mysql_query(connection_id: String, query: String) -> Result<QueryResult, String> {
    mysql::execute_query(&connection_id, &query).await
}
