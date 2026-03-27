use crate::{
    database::{CONNECTION_CONFIGS, REDIS_CONNECTIONS, REDIS_SELECTED_DATABASE},
    secrets,
};
use crate::models::*;
use redis::AsyncCommands;
use redis::Client;

fn sanitize_connection_config(connection: &DatabaseConnection) -> DatabaseConnection {
    let mut sanitized = connection.clone();
    sanitized.password = None;
    sanitized
}

async fn ensure_connection_writable(connection_id: &str) -> Result<(), String> {
    let configs = CONNECTION_CONFIGS.lock().await;
    let connection = configs
        .get(connection_id)
        .ok_or("Connection not found")?;

    if connection.read_only {
        return Err("当前连接为只读模式，已禁止写入或删除操作".to_string());
    }

    Ok(())
}

async fn get_connection_for_db(
    connection_id: &str,
) -> Result<(redis::aio::MultiplexedConnection, i64), String> {
    let connections = REDIS_CONNECTIONS.lock().await;
    let client = connections
        .get(connection_id)
        .ok_or("Connection not found")?;

    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    let selected_db = REDIS_SELECTED_DATABASE.lock().await;
    let db_index = selected_db.get(connection_id).copied().unwrap_or(0);
    drop(selected_db);

    let _: () = redis::cmd("SELECT")
        .arg(db_index)
        .query_async(&mut con)
        .await
        .map_err(|e| format!("Failed to select database: {}", e))?;

    Ok((con, db_index))
}

pub async fn connect(connection: &DatabaseConnection) -> Result<ConnectionResult, String> {
    let password = if let Some(password) = connection
        .password
        .as_ref()
        .filter(|s| !s.trim().is_empty())
    {
        Some(password.clone())
    } else if connection.has_password {
        Some(secrets::require_connection_password(&connection.id)?)
    } else {
        None
    };

    let redis_url = if let Some(password) = password
        .as_ref()
        .filter(|s| !s.trim().is_empty())
    {
        format!(
            "redis://:{}@{}:{}",
            password, connection.host, connection.port
        )
    } else {
        format!("redis://{}:{}", connection.host, connection.port)
    };

    match Client::open(redis_url) {
        Ok(client) => {
            match client.get_multiplexed_async_connection().await {
                Ok(_) => {
                    let mut connections = REDIS_CONNECTIONS.lock().await;
                    connections.insert(connection.id.clone(), client);
                    // 初始化选中的数据库为 0
                    let mut selected_db = REDIS_SELECTED_DATABASE.lock().await;
                    selected_db.insert(connection.id.clone(), 0);
                    drop(selected_db);
                    let mut configs = CONNECTION_CONFIGS.lock().await;
                    configs.insert(connection.id.clone(), sanitize_connection_config(connection));
                    Ok(ConnectionResult {
                        success: true,
                        message: "Connected successfully".to_string(),
                    })
                }
                Err(e) => Err(format!("Failed to connect: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to create client: {}", e)),
    }
}

pub async fn test_connection(
    host: &str,
    port: u16,
    password: &Option<String>,
    connection_id: Option<&str>,
    use_stored_secret: bool,
) -> Result<ConnectionResult, String> {
    let effective_password = if let Some(password) = password.as_ref().filter(|s| !s.trim().is_empty()) {
        Some(password.clone())
    } else if use_stored_secret {
        if let Some(connection_id) = connection_id {
            Some(secrets::require_connection_password(connection_id)?)
        } else {
            return Err("缺少连接 ID，无法读取系统钥匙串中的密码".to_string());
        }
    } else {
        None
    };

    let redis_url = if let Some(pwd) = effective_password.as_ref().filter(|s| !s.trim().is_empty()) {
        format!("redis://:{}@{}:{}", pwd, host, port)
    } else {
        format!("redis://{}:{}", host, port)
    };

    match Client::open(redis_url) {
        Ok(client) => match client.get_multiplexed_async_connection().await {
            Ok(_) => Ok(ConnectionResult {
                success: true,
                message: "Connection successful!".to_string(),
            }),
            Err(e) => Err(format!("Connection failed: {}", e)),
        },
        Err(e) => Err(format!("Failed to create client: {}", e)),
    }
}

pub async fn disconnect(connection_id: &str) -> Result<(), String> {
    let mut connections = REDIS_CONNECTIONS.lock().await;
    connections.remove(connection_id);
    drop(connections);
    let mut selected_db = REDIS_SELECTED_DATABASE.lock().await;
    selected_db.remove(connection_id);
    drop(selected_db);
    let mut configs = CONNECTION_CONFIGS.lock().await;
    configs.remove(connection_id);
    Ok(())
}

pub async fn get_keys(connection_id: &str, pattern: &str) -> Result<Vec<RedisKey>, String> {
    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

    let mut keys: Vec<RedisKey> = Vec::new();
    let mut cursor: u32 = 0;

    loop {
        let (next_cursor, key_batch): (u32, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(pattern)
            .arg("COUNT")
            .arg(100)
            .query_async(&mut con)
            .await
            .map_err(|e| format!("Failed to scan keys: {}", e))?;

        for key in key_batch {
            let key_type: String = con.get(&key).await.unwrap_or_else(|_| "none".to_string());
            let ttl: i64 = con.ttl(&key).await.unwrap_or(-1);
            let size = get_key_size(&mut con, &key, &key_type).await;

            keys.push(RedisKey {
                key,
                r#type: key_type,
                ttl,
                size,
            });
        }

        if next_cursor == 0 {
            break;
        }
        cursor = next_cursor;
    }

    Ok(keys)
}

async fn get_key_size(
    con: &mut redis::aio::MultiplexedConnection,
    key: &str,
    key_type: &str,
) -> usize {
    match key_type {
        "string" => {
            let value: Option<String> = con.get(key).await.ok();
            value.map(|v| v.len()).unwrap_or(0)
        }
        "hash" => {
            let len: usize = con.hlen(key).await.unwrap_or(0);
            len * 64 // Approximate size
        }
        "list" => {
            let len: usize = con.llen(key).await.unwrap_or(0);
            len * 64
        }
        "set" => {
            let len: usize = con.scard(key).await.unwrap_or(0);
            len * 64
        }
        "zset" => {
            let len: usize = con.zcard(key).await.unwrap_or(0);
            len * 64
        }
        _ => 0,
    }
}

pub async fn get_value(connection_id: &str, key: &str) -> Result<String, String> {
    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

    let key_type: String = redis::cmd("TYPE")
        .arg(key)
        .query_async(&mut con)
        .await
        .unwrap_or_else(|_| "none".to_string());

    let value = match key_type.as_str() {
        "string" => {
            let value: Option<String> = con
                .get(key)
                .await
                .map_err(|e| format!("Failed to get value: {}", e))?;
            value.unwrap_or_else(|| "nil".to_string())
        }
        "hash" => {
            let pairs: Vec<(String, String)> = con
                .hgetall(key)
                .await
                .map_err(|e| format!("Failed to get hash: {}", e))?;
            let hash_map: std::collections::HashMap<String, String> = pairs.into_iter().collect();
            serde_json::to_string(&hash_map).map_err(|e| e.to_string())?
        }
        "list" => {
            let items: Vec<String> = con
                .lrange(key, 0, 99)
                .await
                .map_err(|e| format!("Failed to get list: {}", e))?;
            serde_json::to_string(&items).map_err(|e| e.to_string())?
        }
        "set" => {
            let items: Vec<String> = con
                .smembers(key)
                .await
                .map_err(|e| format!("Failed to get set: {}", e))?;
            serde_json::to_string(&items).map_err(|e| e.to_string())?
        }
        "zset" => {
            let items: Vec<(String, f64)> = con
                .zrangebyscore_withscores(key, "-inf", "+inf")
                .await
                .map_err(|e| format!("Failed to get zset: {}", e))?;
            serde_json::to_string(&items).map_err(|e| e.to_string())?
        }
        _ => "Key not found or expired".to_string(),
    };

    Ok(value)
}

pub async fn delete_key(connection_id: &str, key: &str) -> Result<bool, String> {
    ensure_connection_writable(connection_id).await?;

    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

    let result: i32 = con
        .del(key)
        .await
        .map_err(|e| format!("Failed to delete key: {}", e))?;

    Ok(result > 0)
}

pub async fn get_info(connection_id: &str) -> Result<RedisInfo, String> {
    let connections = REDIS_CONNECTIONS.lock().await;
    let client = connections
        .get(connection_id)
        .ok_or("Connection not found")?;

    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    // Get INFO command output
    let info: String = redis::cmd("INFO")
        .query_async(&mut con)
        .await
        .map_err(|e| format!("Failed to get info: {}", e))?;

    // Parse INFO output
    let mut version = "Unknown".to_string();
    let mut os = "Unknown".to_string();
    let mut used_memory = "Unknown".to_string();
    let mut connected_clients: i32 = 0;

    for line in info.lines() {
        if line.starts_with('#') || line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() == 2 {
            let key = parts[0].trim();
            let value = parts[1].trim();

            match key {
                "redis_version" => version = value.to_string(),
                "os" => os = value.to_string(),
                "used_memory_human" => used_memory = value.to_string(),
                "connected_clients" => connected_clients = value.parse().unwrap_or(0),
                _ => {}
            }
        }
    }

    // Get total keys across all databases
    let db_sizes: Vec<i64> = redis::cmd("INFO")
        .arg("keyspace")
        .query_async(&mut con)
        .await
        .ok()
        .and_then(|info_str: String| {
            let mut sizes = Vec::new();
            for line in info_str.lines() {
                if line.starts_with("db") {
                    if let Some(keys_part) = line.split(':').nth(1) {
                        if let Some(keys_part) =
                            keys_part.split(',').find(|s| s.starts_with("keys="))
                        {
                            if let Some(keys_str) = keys_part.strip_prefix("keys=") {
                                if let Ok(size) = keys_str.parse::<i64>() {
                                    sizes.push(size);
                                }
                            }
                        }
                    }
                }
            }
            Some(sizes)
        })
        .unwrap_or_default();

    let total_keys = db_sizes.iter().sum();

    Ok(RedisInfo {
        version,
        mode: "standalone".to_string(),
        os,
        used_memory,
        connected_clients,
        total_keys,
    })
}

/// 获取所有数据库的信息
pub async fn get_databases(connection_id: &str) -> Result<Vec<RedisDatabase>, String> {
    let connections = REDIS_CONNECTIONS.lock().await;
    let client = connections
        .get(connection_id)
        .ok_or("Connection not found")?;

    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    let mut db_key_counts: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();

    let info: String = redis::cmd("INFO")
        .arg("keyspace")
        .query_async(&mut con)
        .await
        .map_err(|e| format!("Failed to get keyspace info: {}", e))?;

    for line in info.lines() {
        if line.starts_with("db") {
            if let Some((db_part, rest)) = line.split_once(':') {
                let index = db_part.trim_start_matches("db").parse::<i64>().unwrap_or(0);
                let mut key_count = 0i64;

                for part in rest.split(',') {
                    if let Some(keys_str) = part.strip_prefix("keys=") {
                        key_count = keys_str.parse::<i64>().unwrap_or(0);
                    }
                }

                db_key_counts.insert(index, key_count);
            }
        }
    }

    let mut databases = Vec::new();
    for i in 0..16 {
        databases.push(RedisDatabase {
            index: i,
            name: format!("DB {}", i),
            key_count: *db_key_counts.get(&i).unwrap_or(&0),
        });
    }

    Ok(databases)
}

/// 切换数据库
pub async fn select_database(connection_id: &str, db_index: i64) -> Result<(), String> {
    let connections = REDIS_CONNECTIONS.lock().await;
    let client = connections
        .get(connection_id)
        .ok_or("Connection not found")?;

    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    // 执行 SELECT 命令切换数据库
    let _: () = redis::cmd("SELECT")
        .arg(db_index)
        .query_async(&mut con)
        .await
        .map_err(|e| format!("Failed to select database: {}", e))?;

    // 更新选中的数据库索引
    drop(connections);
    let mut selected_db = REDIS_SELECTED_DATABASE.lock().await;
    selected_db.insert(connection_id.to_string(), db_index);

    Ok(())
}

/// 获取当前选中的数据库索引
pub async fn get_selected_database(connection_id: &str) -> i64 {
    let selected_db = REDIS_SELECTED_DATABASE.lock().await;
    selected_db.get(connection_id).copied().unwrap_or(0)
}
