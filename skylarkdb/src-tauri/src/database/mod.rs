use std::collections::HashMap;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use sqlx::MySqlPool;

pub mod mysql;
pub mod redis;

pub static MYSQL_CONNECTIONS: Lazy<Mutex<HashMap<String, MySqlPool>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Redis connection type
pub type RedisConnection = ::redis::Client;

pub static REDIS_CONNECTIONS: Lazy<Mutex<HashMap<String, RedisConnection>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
