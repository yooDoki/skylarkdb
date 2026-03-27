use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConnection {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub db_type: String,
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    #[serde(rename = "hasPassword", default)]
    pub has_password: bool,
    pub database: Option<String>,
    pub ssl: bool,
    #[serde(rename = "readOnly", default)]
    pub read_only: bool,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MySQLTable {
    pub schema: String,
    pub name: String,
    pub engine: String,
    pub rows: u64,
    pub size: String,
    pub created: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MySQLColumn {
    pub name: String,
    pub full_type: String,
    pub r#type: String,
    pub is_primary_key: bool,
    pub nullable: bool,
    pub default: Option<String>,
    pub extra: String,
    pub is_unsigned: bool,
    pub is_blob: bool,
    pub is_enum: bool,
    pub is_json: bool,
    pub is_bit: bool,
    pub is_geometry: bool,
    pub enum_values: Option<Vec<String>>,
    pub max_length: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub execution_time: f64,
    pub affected_rows: Option<u64>,
}

/// 存储过程 / 函数（information_schema.routines + parameters）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MySQLRoutine {
    pub schema: String,
    pub name: String,
    pub routine_type: String,
    /// FUNCTION 时返回类型
    pub data_type: Option<String>,
    pub definition_preview: Option<String>,
    pub parameters: Vec<MySQLRoutineParam>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MySQLRoutineParam {
    pub ordinal: i32,
    pub name: Option<String>,
    pub mode: Option<String>,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisKey {
    pub key: String,
    pub r#type: String,
    pub ttl: i64,
    pub size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisInfo {
    pub version: String,
    pub mode: String,
    pub os: String,
    pub used_memory: String,
    pub connected_clients: i32,
    pub total_keys: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisDatabase {
    pub index: i64,
    pub name: String,
    pub key_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableDataResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub total_count: i64,
    pub execution_time: f64,
}

/// Import/Export models

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub connection_id: String,
    pub database: String,
    pub tables: Vec<String>,
    pub format: ExportFormat,
    pub include_structure: bool,
    pub include_data: bool,
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    Json,
    Sql,
    Csv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub success: bool,
    pub message: String,
    pub file_path: String,
    pub exported_rows: u64,
    pub exported_tables: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOptions {
    pub connection_id: String,
    pub database: String,
    pub file_path: String,
    pub format: ImportFormat,
    pub table_mapping: Vec<TableMapping>,
    pub on_conflict: OnConflictStrategy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportFormat {
    Json,
    Sql,
    Csv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableMapping {
    pub source_table: String,
    pub target_table: String,
    pub column_mappings: Vec<ColumnMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnMapping {
    pub source_column: String,
    pub target_column: String,
    pub target_type: String,
    pub is_primary_key: bool,
    pub is_nullable: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OnConflictStrategy {
    Skip,
    Update,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTableColumn {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub auto_increment: bool,
    pub is_primary_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddColumnOptions {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub auto_increment: bool,
    pub first: bool,
    pub after_column: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub success: bool,
    pub message: String,
    pub imported_rows: u64,
    pub imported_tables: u64,
    pub errors: Vec<ImportError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportError {
    pub table: String,
    pub row: Option<u64>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SakilaInitOptions {
    pub mysql_version: String,
    pub docker_container_name: String,
    pub host_port: u16,
    pub container_port: u16,
    pub root_password: String,
    pub database_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SakilaInitResult {
    pub success: bool,
    pub message: String,
    pub container_id: Option<String>,
    pub connection_string: Option<String>,
}
