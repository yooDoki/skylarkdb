use std::collections::HashMap;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use sqlx::MySqlPool;

pub mod mysql;
pub mod redis;
pub mod export;
pub mod import;
pub mod sakila;

pub static MYSQL_CONNECTIONS: Lazy<Mutex<HashMap<String, MySqlPool>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// 连接配置里填写的默认数据库名（非空时，执行 SQL 前在同一连接上 `USE`，避免 1046 No database selected）
pub static MYSQL_DEFAULT_DATABASE: Lazy<Mutex<HashMap<String, Option<String>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Redis connection type
pub type RedisConnection = ::redis::Client;

pub static REDIS_CONNECTIONS: Lazy<Mutex<HashMap<String, RedisConnection>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Redis 当前选择的数据库索引（默认 0）
pub static REDIS_SELECTED_DATABASE: Lazy<Mutex<HashMap<String, i64>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
