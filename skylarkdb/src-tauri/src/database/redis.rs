use crate::models::*;
use crate::{
    database::{CONNECTION_CONFIGS, REDIS_CONNECTIONS, REDIS_SELECTED_DATABASE},
    secrets,
};
use once_cell::sync::Lazy;
use redis::AsyncCommands;
use redis::Client;
use std::collections::HashMap;
use std::sync::Arc;

/// Cached multiplexed connections with their current DB index
/// Key: connection_id, Value: (connection, current_db_index)
static REDIS_ACTIVE_CONNECTIONS: Lazy<
    Arc<tokio::sync::Mutex<HashMap<String, (redis::aio::MultiplexedConnection, i64)>>>,
> = Lazy::new(|| Arc::new(tokio::sync::Mutex::new(HashMap::new())));

fn sanitize_connection_config(connection: &DatabaseConnection) -> DatabaseConnection {
    let mut sanitized = connection.clone();
    sanitized.password = None;
    sanitized
}

async fn ensure_connection_writable(connection_id: &str) -> Result<(), String> {
    let configs = CONNECTION_CONFIGS.lock().await;
    let connection = configs.get(connection_id).ok_or("Connection not found")?;

    if connection.read_only {
        return Err("当前连接为只读模式，已禁止写入或删除操作".to_string());
    }

    Ok(())
}

/// Get or create a cached multiplexed connection, only sending SELECT when DB index changes
async fn get_connection_for_db(
    connection_id: &str,
) -> Result<(redis::aio::MultiplexedConnection, i64), String> {
    let selected_db = {
        let sel = REDIS_SELECTED_DATABASE.lock().await;
        sel.get(connection_id).copied().unwrap_or(0)
    };

    // Check if we have a cached connection with the correct DB
    {
        let active = REDIS_ACTIVE_CONNECTIONS.lock().await;
        if let Some((con, current_db)) = active.get(connection_id) {
            if *current_db == selected_db {
                // Connection exists with correct DB - clone it (MultiplexedConnection is Clone-safe)
                return Ok((con.clone(), selected_db));
            }
        }
    }

    // Need to create new connection or change DB
    let client = {
        let connections = REDIS_CONNECTIONS.lock().await;
        connections
            .get(connection_id)
            .cloned()
            .ok_or("Connection not found")?
    };

    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    if selected_db != 0 {
        let _: () = redis::cmd("SELECT")
            .arg(selected_db)
            .query_async(&mut con)
            .await
            .map_err(|e| format!("Failed to select database: {}", e))?;
    }

    // Cache the connection
    {
        let mut active = REDIS_ACTIVE_CONNECTIONS.lock().await;
        active.insert(connection_id.to_string(), (con.clone(), selected_db));
    }

    Ok((con, selected_db))
}

pub async fn connect(connection: &DatabaseConnection) -> Result<ConnectionResult, String> {
    // 只有当密码存储策略为 system 时，才从钥匙串读取密码
    let password = if let Some(password) = connection
        .password
        .as_ref()
        .filter(|s| !s.trim().is_empty())
    {
        Some(password.clone())
    } else if connection.password_storage == Some("system".to_string()) && connection.has_password {
        Some(secrets::require_connection_password(&connection.id).await?)
    } else {
        None
    };

    let redis_url = if let Some(password) = password.as_ref().filter(|s| !s.trim().is_empty()) {
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
                    configs.insert(
                        connection.id.clone(),
                        sanitize_connection_config(connection),
                    );
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
    let effective_password =
        if let Some(password) = password.as_ref().filter(|s| !s.trim().is_empty()) {
            Some(password.clone())
        } else if use_stored_secret {
            if let Some(connection_id) = connection_id {
                Some(secrets::require_connection_password(connection_id).await?)
            } else {
                return Err("缺少连接 ID，无法读取系统钥匙串中的密码".to_string());
            }
        } else {
            None
        };

    let redis_url = if let Some(pwd) = effective_password.as_ref().filter(|s| !s.trim().is_empty())
    {
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
    drop(configs);
    // Clean up cached connection
    let mut active = REDIS_ACTIVE_CONNECTIONS.lock().await;
    active.remove(connection_id);
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
            .arg(500)
            .query_async(&mut con)
            .await
            .map_err(|e| format!("Failed to scan keys: {}", e))?;

        if key_batch.is_empty() {
            if next_cursor == 0 {
                break;
            }
            cursor = next_cursor;
            continue;
        }

        // Batch TYPE commands using pipeline for all keys in this batch
        let mut type_pipe = redis::pipe();
        for key in &key_batch {
            type_pipe.cmd("TYPE").arg(key.as_str());
        }
        let type_results: Vec<String> = type_pipe
            .query_async(&mut con)
            .await
            .map_err(|e| format!("Failed to batch get key types: {}", e))?;

        // Batch TTL commands using pipeline
        let mut ttl_pipe = redis::pipe();
        for key in &key_batch {
            ttl_pipe.cmd("TTL").arg(key.as_str());
        }
        let ttl_results: Vec<i64> = ttl_pipe
            .query_async(&mut con)
            .await
            .map_err(|e| format!("Failed to batch get TTLs: {}", e))?;

        // Batch size commands using pipeline
        let mut size_pipe = redis::pipe();
        for (i, key) in key_batch.iter().enumerate() {
            let key_type = type_results.get(i).map(|s| s.as_str()).unwrap_or("none");
            match key_type {
                "string" => {
                    size_pipe.cmd("STRLEN").arg(key.as_str());
                }
                "hash" => {
                    size_pipe.cmd("HLEN").arg(key.as_str());
                }
                "list" => {
                    size_pipe.cmd("LLEN").arg(key.as_str());
                }
                "set" => {
                    size_pipe.cmd("SCARD").arg(key.as_str());
                }
                "zset" => {
                    size_pipe.cmd("ZCARD").arg(key.as_str());
                }
                _ => {
                    size_pipe.cmd("STRLEN").arg(key.as_str());
                } // fallback
            }
        }
        let size_results: Vec<usize> = size_pipe
            .query_async(&mut con)
            .await
            .unwrap_or_else(|_| key_batch.iter().map(|_| 0usize).collect());

        // Collect results
        for (i, key) in key_batch.into_iter().enumerate() {
            let key_type = type_results
                .get(i)
                .cloned()
                .unwrap_or_else(|| "none".to_string());
            let ttl = ttl_results.get(i).copied().unwrap_or(-1);
            let raw_size = size_results.get(i).copied().unwrap_or(0);
            // For collection types, multiply count by approximate element size
            let size = match key_type.as_str() {
                "hash" | "list" | "set" | "zset" => raw_size * 64,
                _ => raw_size,
            };

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
    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

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
    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

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

    // Update cached connection with new DB
    {
        let mut active = REDIS_ACTIVE_CONNECTIONS.lock().await;
        active.insert(connection_id.to_string(), (con, db_index));
    }

    Ok(())
}

/// 获取当前选中的数据库索引
pub async fn get_selected_database(connection_id: &str) -> i64 {
    let selected_db = REDIS_SELECTED_DATABASE.lock().await;
    selected_db.get(connection_id).copied().unwrap_or(0)
}

/// 设置 key 的值
pub async fn set_key(
    connection_id: &str,
    key: &str,
    value: &str,
    key_type: &str,
    ttl: Option<i64>,
) -> Result<(), String> {
    ensure_connection_writable(connection_id).await?;
    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

    // 检查 key 是否存在及其类型
    let existing_type: String = redis::cmd("TYPE")
        .arg(key)
        .query_async(&mut con)
        .await
        .unwrap_or_else(|_| "none".to_string());

    // 如果 key 存在但类型不同，需要先删除
    // 注意：这是 Redis 的限制，不同类型无法直接转换
    if existing_type != "none" && existing_type != key_type {
        let _: () = con
            .del(key)
            .await
            .map_err(|e| format!("Failed to delete old key: {}", e))?;
    }

    // 根据类型设置值
    // 对于同名同类型的更新，使用原子操作
    match key_type {
        "string" => {
            // SET 命令是原子的
            let _: () = con
                .set(key, value)
                .await
                .map_err(|e| format!("Failed to set string: {}", e))?;
        }
        "hash" => {
            // value 应为 JSON 格式的 hash
            let hash_map: std::collections::HashMap<String, String> =
                serde_json::from_str(value).map_err(|e| format!("Invalid hash JSON: {}", e))?;

            // 如果类型相同且 key 存在，使用 HSET 进行原子更新
            // 如果类型不同或 key 不存在，先清空再设置
            if existing_type == "hash" {
                // 先删除所有字段
                let _: () = con
                    .del(key)
                    .await
                    .map_err(|e| format!("Failed to clear hash: {}", e))?;
            }

            // 使用 HMSET 批量设置（Redis 3.x+ 使用 HSET 支持多字段）
            if !hash_map.is_empty() {
                let mut cmd = redis::cmd("HSET");
                cmd.arg(key);
                for (field, val) in &hash_map {
                    cmd.arg(field).arg(val);
                }
                let _: () = cmd
                    .query_async(&mut con)
                    .await
                    .map_err(|e| format!("Failed to set hash fields: {}", e))?;
            }
        }
        "list" => {
            let items: Vec<String> =
                serde_json::from_str(value).map_err(|e| format!("Invalid list JSON: {}", e))?;

            // 如果类型相同且 key 存在，先清空列表
            if existing_type == "list" {
                let _: () = con
                    .del(key)
                    .await
                    .map_err(|e| format!("Failed to clear list: {}", e))?;
            }

            // 使用 RPUSH 批量添加
            if !items.is_empty() {
                let mut cmd = redis::cmd("RPUSH");
                cmd.arg(key);
                for item in &items {
                    cmd.arg(item);
                }
                let _: () = cmd
                    .query_async(&mut con)
                    .await
                    .map_err(|e| format!("Failed to push list items: {}", e))?;
            }
        }
        "set" => {
            let items: Vec<String> =
                serde_json::from_str(value).map_err(|e| format!("Invalid set JSON: {}", e))?;

            // 如果类型相同且 key 存在，使用 SADD 更新
            if existing_type == "set" {
                // 先删除旧集合
                let _: () = con
                    .del(key)
                    .await
                    .map_err(|e| format!("Failed to clear set: {}", e))?;
            }

            // 使用 SADD 批量添加
            if !items.is_empty() {
                let mut cmd = redis::cmd("SADD");
                cmd.arg(key);
                for item in &items {
                    cmd.arg(item);
                }
                let _: () = cmd
                    .query_async(&mut con)
                    .await
                    .map_err(|e| format!("Failed to add set members: {}", e))?;
            }
        }
        "zset" => {
            let items: Vec<(String, f64)> =
                serde_json::from_str(value).map_err(|e| format!("Invalid zset JSON: {}", e))?;

            // 如果类型相同且 key 存在，先清空
            if existing_type == "zset" {
                let _: () = con
                    .del(key)
                    .await
                    .map_err(|e| format!("Failed to clear zset: {}", e))?;
            }

            // 使用 ZADD 批量添加
            if !items.is_empty() {
                let mut cmd = redis::cmd("ZADD");
                cmd.arg(key);
                for (member, score) in &items {
                    cmd.arg(score).arg(member);
                }
                let _: () = cmd
                    .query_async(&mut con)
                    .await
                    .map_err(|e| format!("Failed to add zset members: {}", e))?;
            }
        }
        _ => return Err(format!("Unsupported key type: {}", key_type)),
    }

    // 设置 TTL
    if let Some(ttl_secs) = ttl {
        if ttl_secs > 0 {
            let _: () = con
                .expire(key, ttl_secs)
                .await
                .map_err(|e| format!("Failed to set TTL: {}", e))?;
        }
    }

    Ok(())
}

/// 设置 key 的 TTL
pub async fn set_ttl(connection_id: &str, key: &str, ttl: i64) -> Result<(), String> {
    ensure_connection_writable(connection_id).await?;
    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

    if ttl > 0 {
        let _: () = con
            .expire(key, ttl)
            .await
            .map_err(|e| format!("Failed to set TTL: {}", e))?;
    } else if ttl == -1 {
        // 移除 TTL，设为永久
        let _: () = con
            .persist(key)
            .await
            .map_err(|e| format!("Failed to persist key: {}", e))?;
    }

    Ok(())
}

/// 重命名 key
pub async fn rename_key(connection_id: &str, old_key: &str, new_key: &str) -> Result<(), String> {
    ensure_connection_writable(connection_id).await?;
    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

    let _: () = con
        .rename(old_key, new_key)
        .await
        .map_err(|e| format!("Failed to rename key: {}", e))?;

    Ok(())
}

/// 导出 Redis 键到文件
pub async fn export_key(
    connection_id: &str,
    key: &str,
    format: &str,
    output_path: &str,
) -> Result<ExportResult, String> {
    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

    // 获取键类型
    let key_type: String = redis::cmd("TYPE")
        .arg(key)
        .query_async(&mut con)
        .await
        .map_err(|e| format!("Failed to get key type: {}", e))?;

    if key_type == "none" {
        return Err(format!("Key '{}' does not exist", key));
    }

    // 获取键的值
    let value = get_value(connection_id, key).await?;

    // 根据格式写入文件
    match format {
        "json" => {
            use std::fs::File;
            use std::io::Write;

            let export_data = serde_json::json!({
                "key": key,
                "type": key_type,
                "value": value,
            });

            let json_content = serde_json::to_string_pretty(&export_data)
                .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

            let mut file =
                File::create(output_path).map_err(|e| format!("Failed to create file: {}", e))?;
            file.write_all(json_content.as_bytes())
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
        "txt" => {
            use std::fs::File;
            use std::io::Write;

            let content = format!("Key: {}\nType: {}\nValue:\n{}\n", key, key_type, value);

            let mut file =
                File::create(output_path).map_err(|e| format!("Failed to create file: {}", e))?;
            file.write_all(content.as_bytes())
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
        _ => return Err(format!("Unsupported export format: {}", format)),
    }

    Ok(ExportResult {
        success: true,
        message: format!("Successfully exported key '{}'", key),
        file_path: output_path.to_string(),
        exported_rows: 1,
        exported_tables: 1,
    })
}

/// 导入数据到 Redis
pub async fn import_data(
    connection_id: &str,
    file_path: &str,
    format: &str,
) -> Result<ImportResult, String> {
    use std::fs;

    let (mut con, _db_index) = get_connection_for_db(connection_id).await?;

    // 读取文件内容
    let file_content =
        fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let mut imported_keys = 0u64;
    let mut imported_values = 0u64;

    match format {
        "json" => {
            // JSON 格式：数组，每个元素包含 key, type, value
            let data: Vec<serde_json::Value> = serde_json::from_str(&file_content)
                .map_err(|e| format!("Invalid JSON format: {}", e))?;

            for item in data {
                let key = item
                    .get("key")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing 'key' field in JSON")?;

                let key_type = item
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("string");

                let value = item
                    .get("value")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing 'value' field in JSON")?;

                // 导入键值对
                match key_type {
                    "string" => {
                        let _: () = con
                            .set(key, value)
                            .await
                            .map_err(|e| format!("Failed to set string: {}", e))?;
                    }
                    "hash" => {
                        let hash_map: std::collections::HashMap<String, String> =
                            serde_json::from_str(value)
                                .map_err(|e| format!("Invalid hash JSON: {}", e))?;
                        for (field, val) in hash_map {
                            let _: () = con
                                .hset(key, field, val)
                                .await
                                .map_err(|e| format!("Failed to set hash field: {}", e))?;
                            imported_values += 1;
                        }
                    }
                    "list" => {
                        let items: Vec<String> = serde_json::from_str(value)
                            .map_err(|e| format!("Invalid list JSON: {}", e))?;
                        for item in items {
                            let _: () = con
                                .rpush(key, item)
                                .await
                                .map_err(|e| format!("Failed to push list item: {}", e))?;
                            imported_values += 1;
                        }
                    }
                    "set" => {
                        let items: Vec<String> = serde_json::from_str(value)
                            .map_err(|e| format!("Invalid set JSON: {}", e))?;
                        for item in items {
                            let _: () = con
                                .sadd(key, item)
                                .await
                                .map_err(|e| format!("Failed to add set member: {}", e))?;
                            imported_values += 1;
                        }
                    }
                    "zset" => {
                        let items: Vec<(String, f64)> = serde_json::from_str(value)
                            .map_err(|e| format!("Invalid zset JSON: {}", e))?;
                        for (member, score) in items {
                            let _: () = con
                                .zadd(key, score, member)
                                .await
                                .map_err(|e| format!("Failed to add zset member: {}", e))?;
                            imported_values += 1;
                        }
                    }
                    _ => continue,
                }
                imported_keys += 1;
            }
        }
        "txt" => {
            // TXT 格式：每行一个 key=value
            for line in file_content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }

                if let Some(eq_pos) = line.find('=') {
                    let key = line[..eq_pos].trim();
                    let value = line[eq_pos + 1..].trim();

                    if !key.is_empty() {
                        let _: () = con
                            .set(key, value)
                            .await
                            .map_err(|e| format!("Failed to set key '{}': {}", key, e))?;
                        imported_keys += 1;
                        imported_values += 1;
                    }
                }
            }
        }
        _ => return Err(format!("Unsupported import format: {}", format)),
    }

    Ok(ImportResult {
        success: true,
        message: format!("Successfully imported {} keys", imported_keys),
        imported_rows: imported_values,
        imported_tables: imported_keys,
        errors: vec![],
    })
}
