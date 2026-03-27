use crate::database::{export, import, mysql, sakila};
use crate::models::*;
use tauri::command;

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
    order_by: Option<String>,
    order_desc: Option<bool>,
    filter_column: Option<String>,
    filter_op: Option<String>,
    filter_value: Option<String>,
) -> Result<TableDataResult, String> {
    mysql::get_table_data(
        &connection_id,
        &table_name,
        limit.unwrap_or(100),
        offset.unwrap_or(0),
        order_by.as_deref(),
        order_desc.unwrap_or(false),
        filter_column.as_deref(),
        filter_op.as_deref(),
        filter_value.as_deref(),
    )
    .await
}

#[command]
pub async fn disconnect_mysql(connection_id: String) -> Result<(), String> {
    mysql::disconnect(&connection_id).await
}

#[command]
pub async fn get_mysql_databases(connection_id: String) -> Result<Vec<String>, String> {
    mysql::get_databases(&connection_id).await
}

#[command]
pub async fn get_mysql_tables(
    connection_id: String,
    database: Option<String>,
) -> Result<Vec<MySQLTable>, String> {
    mysql::get_tables(&connection_id, database.as_deref()).await
}

#[command]
pub async fn get_mysql_columns(
    connection_id: String,
    table_name: String,
) -> Result<Vec<MySQLColumn>, String> {
    mysql::get_columns(&connection_id, &table_name).await
}

#[command]
pub async fn get_mysql_routines(
    connection_id: String,
    routine_type: Option<String>,
) -> Result<Vec<MySQLRoutine>, String> {
    mysql::get_routines(&connection_id, routine_type.as_deref()).await
}

#[command]
pub async fn execute_mysql_query(
    connection_id: String,
    query: String,
    params: Option<Vec<String>>,
) -> Result<QueryResult, String> {
    mysql::execute_query(&connection_id, &query, params).await
}

#[command]
pub async fn insert_mysql_record(
    connection_id: String,
    table_name: String,
    data: serde_json::Value,
) -> Result<u64, String> {
    mysql::insert_record(&connection_id, &table_name, data).await
}

#[command]
pub async fn update_mysql_record(
    connection_id: String,
    table_name: String,
    data: serde_json::Value,
    primary_key: String,
    primary_value: serde_json::Value,
) -> Result<u64, String> {
    mysql::update_record(
        &connection_id,
        &table_name,
        data,
        &primary_key,
        primary_value,
    )
    .await
}

#[command]
pub async fn delete_mysql_record(
    connection_id: String,
    table_name: String,
    primary_key: String,
    primary_value: serde_json::Value,
) -> Result<u64, String> {
    mysql::delete_record(&connection_id, &table_name, &primary_key, primary_value).await
}

#[command]
pub async fn create_mysql_table(
    connection_id: String,
    database: String,
    table_name: String,
    columns: Vec<CreateTableColumn>,
) -> Result<(), String> {
    mysql::create_table(&connection_id, &database, &table_name, &columns).await
}

#[command]
pub async fn drop_mysql_table(
    connection_id: String,
    database: String,
    table_name: String,
) -> Result<(), String> {
    mysql::drop_table(&connection_id, &database, &table_name).await
}

#[command]
pub async fn set_mysql_default_database(
    connection_id: String,
    database: String,
) -> Result<(), String> {
    mysql::set_default_database(&connection_id, &database).await;
    Ok(())
}

// Import/Export commands

#[command]
pub async fn export_mysql_data(options: ExportOptions) -> Result<ExportResult, String> {
    let pool = {
        let connections = crate::database::MYSQL_CONNECTIONS.lock().await;
        connections
            .get(&options.connection_id)
            .cloned()
            .ok_or("Connection not found")?
    };

    export::export_database(&pool, &options).await
}

#[command]
pub async fn import_mysql_data(options: ImportOptions) -> Result<ImportResult, String> {
    let pool = {
        let connections = crate::database::MYSQL_CONNECTIONS.lock().await;
        connections
            .get(&options.connection_id)
            .cloned()
            .ok_or("Connection not found")?
    };

    import::import_database(&pool, &options).await
}

#[command]
pub fn get_mysql_type_mapping(source_type: String, sample_value: Option<String>) -> String {
    import::map_type_to_mysql(&source_type, sample_value.as_deref())
}

// Sakila commands

#[command]
pub fn init_sakila_docker(options: SakilaInitOptions) -> Result<SakilaInitResult, String> {
    sakila::init_sakila_with_docker(&options)
}

#[command]
pub fn generate_sakila_docker_compose(options: SakilaInitOptions) -> Result<String, String> {
    sakila::generate_docker_compose(&options)
}

#[command]
pub fn get_sakila_schema() -> String {
    sakila::generate_sakila_schema()
}

#[command]
pub fn get_sakila_data() -> String {
    sakila::generate_sakila_data()
}
