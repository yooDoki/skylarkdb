use redis::Client;
use redis::AsyncCommands;
use crate::models::*;
use crate::database::REDIS_CONNECTIONS;

pub async fn connect(connection: &DatabaseConnection) -> Result<ConnectionResult, String> {
    let redis_url = if let Some(password) = &connection.password {
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
) -> Result<ConnectionResult, String> {
    let redis_url = if let Some(pwd) = password {
        format!("redis://:{}@{}:{}", pwd, host, port)
    } else {
        format!("redis://{}:{}", host, port)
    };

    match Client::open(redis_url) {
        Ok(client) => {
            match client.get_multiplexed_async_connection().await {
                Ok(_) => {
                    Ok(ConnectionResult {
                        success: true,
                        message: "Connection successful!".to_string(),
                    })
                }
                Err(e) => Err(format!("Connection failed: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to create client: {}", e)),
    }
}

pub async fn disconnect(connection_id: &str) -> Result<(), String> {
    let mut connections = REDIS_CONNECTIONS.lock().await;
    connections.remove(connection_id);
    Ok(())
}

pub async fn get_keys(connection_id: &str, pattern: &str) -> Result<Vec<RedisKey>, String> {
    let connections = REDIS_CONNECTIONS.lock().await;
    let client = connections.get(connection_id)
        .ok_or("Connection not found")?;
    
    let mut con = client.get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    // Use SCAN command instead of KEYS for better performance
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
    let connections = REDIS_CONNECTIONS.lock().await;
    let client = connections.get(connection_id)
        .ok_or("Connection not found")?;
    
    let mut con = client.get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    // Get the type of the key
    let key_type: String = redis::cmd("TYPE").arg(key).query_async(&mut con).await
        .unwrap_or_else(|_| "none".to_string());
    
    let value = match key_type.as_str() {
        "string" => {
            let value: Option<String> = con.get(key).await
                .map_err(|e| format!("Failed to get value: {}", e))?;
            value.unwrap_or_else(|| "nil".to_string())
        }
        "hash" => {
            let pairs: Vec<(String, String)> = con.hgetall(key).await
                .map_err(|e| format!("Failed to get hash: {}", e))?;
            let hash_map: std::collections::HashMap<String, String> = pairs.into_iter().collect();
            serde_json::to_string(&hash_map).map_err(|e| e.to_string())?
        }
        "list" => {
            let items: Vec<String> = con.lrange(key, 0, 99).await
                .map_err(|e| format!("Failed to get list: {}", e))?;
            serde_json::to_string(&items).map_err(|e| e.to_string())?
        }
        "set" => {
            let items: Vec<String> = con.smembers(key).await
                .map_err(|e| format!("Failed to get set: {}", e))?;
            serde_json::to_string(&items).map_err(|e| e.to_string())?
        }
        "zset" => {
            let items: Vec<(String, f64)> = con.zrangebyscore_withscores(key, "-inf", "+inf").await
                .map_err(|e| format!("Failed to get zset: {}", e))?;
            serde_json::to_string(&items).map_err(|e| e.to_string())?
        }
        _ => "Key not found or expired".to_string(),
    };

    Ok(value)
}

pub async fn delete_key(connection_id: &str, key: &str) -> Result<bool, String> {
    let connections = REDIS_CONNECTIONS.lock().await;
    let client = connections.get(connection_id)
        .ok_or("Connection not found")?;
    
    let mut con = client.get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    let result: i32 = con.del(key).await
        .map_err(|e| format!("Failed to delete key: {}", e))?;
    
    Ok(result > 0)
}

pub async fn get_info(connection_id: &str) -> Result<RedisInfo, String> {
    let connections = REDIS_CONNECTIONS.lock().await;
    let client = connections.get(connection_id)
        .ok_or("Connection not found")?;
    
    let mut con = client.get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    // Get INFO command output
    let info: String = redis::cmd("INFO").query_async(&mut con).await
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
                        if let Some(keys_part) = keys_part.split(',').find(|s| s.starts_with("keys=")) {
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
