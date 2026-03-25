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
    pub database: Option<String>,
    pub ssl: bool,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MySQLTable {
    pub name: String,
    pub engine: String,
    pub rows: u64,
    pub size: String,
    pub created: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MySQLColumn {
    pub name: String,
    pub r#type: String,
    pub nullable: bool,
    pub default: Option<String>,
    pub extra: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub execution_time: f64,
    pub affected_rows: Option<u64>,
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
