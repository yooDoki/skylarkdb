use std::collections::HashMap;

use sqlx::{Row, Column, mysql::{MySqlConnectOptions, MySqlPoolOptions, MySqlSslMode}};
use crate::models::*;
use crate::database::{MYSQL_CONNECTIONS, MYSQL_DEFAULT_DATABASE};

async fn set_default_database(connection_id: &str, database_name: &str) {
    let db = database_name.trim();
    if db.is_empty() {
        return;
    }
    let mut meta = MYSQL_DEFAULT_DATABASE.lock().await;
    meta.insert(connection_id.to_string(), Some(db.to_string()));
}

/// 解析表所在的 schema。优先使用 `preferred_schema`（若该库下确有此表），
/// 避免「侧栏按表名去重 + 缓存的默认库」指向错误库（同名表在不同 database）。
async fn resolve_table_schema(
    pool: &sqlx::MySqlPool,
    table_name: &str,
    preferred_schema: Option<&str>,
) -> Result<String, String> {
    if let Some(schema) = preferred_schema.map(str::trim).filter(|s| !s.is_empty()) {
        let row = sqlx::query_as::<_, (String,)>(
            "SELECT table_schema FROM information_schema.tables
             WHERE table_name = ? AND table_schema = ?
             AND table_type IN ('BASE TABLE', 'VIEW')
             LIMIT 1",
        )
        .bind(table_name)
        .bind(schema)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to resolve table schema: {}", e))?;
        if let Some((db,)) = row {
            return Ok(db);
        }
    }

    let row = sqlx::query_as::<_, (String,)>(
        "SELECT table_schema FROM information_schema.tables
         WHERE table_name = ?
         AND table_type IN ('BASE TABLE', 'VIEW')
         ORDER BY table_schema
         LIMIT 1",
    )
    .bind(table_name)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to resolve table schema: {}", e))?;

    row.map(|(db,)| db)
        .ok_or_else(|| format!("Table '{}' not found", table_name))
}

#[derive(Clone)]
struct ColumnMeta {
    data_type: String,
    is_blob: bool,
    is_json: bool,
    is_geometry: bool,
    is_bit: bool,
}

fn column_sortable(m: &ColumnMeta) -> bool {
    !(m.is_json || m.is_blob || m.is_geometry || m.is_bit)
}

fn column_filterable(m: &ColumnMeta) -> bool {
    !(m.is_json || m.is_blob || m.is_geometry || m.is_bit)
}

async fn load_column_meta(
    pool: &sqlx::MySqlPool,
    table_schema: &str,
    table_name: &str,
) -> Result<HashMap<String, ColumnMeta>, String> {
    let rows = sqlx::query_as::<_, (String, String)>(
        "SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ordinal_position",
    )
    .bind(table_schema)
    .bind(table_name)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load column metadata: {}", e))?;

    let mut map = HashMap::new();
    for (name, data_type) in rows {
        let dt = data_type.to_lowercase();
        let is_blob = matches!(
            dt.as_str(),
            "blob" | "tinyblob" | "mediumblob" | "longblob" | "binary" | "varbinary"
        );
        let is_json = dt == "json";
        let is_bit = dt == "bit";
        let is_geometry = matches!(
            dt.as_str(),
            "geometry"
                | "point"
                | "linestring"
                | "polygon"
                | "multipoint"
                | "multilinestring"
                | "multipolygon"
                | "geometrycollection"
        );
        map.insert(
            name,
            ColumnMeta {
                data_type: dt,
                is_blob,
                is_json,
                is_geometry,
                is_bit,
            },
        );
    }
    Ok(map)
}

fn escape_mysql_like_pattern(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '\\' | '%' | '_' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}

/// `filter_op`: eq, ne, contains, starts_with, gt, lt, gte, lte, is_null, is_not_null
fn build_filter_sql(
    col_ident: &str,
    meta: &ColumnMeta,
    op: &str,
    raw_value: Option<&str>,
) -> Result<(String, Vec<String>), String> {
    let escaped = escape_mysql_ident(col_ident);
    let dt = meta.data_type.as_str();
    let text_like_like = matches!(
        dt,
        "varchar" | "char" | "text" | "tinytext" | "mediumtext" | "longtext" | "enum" | "set"
    );

    match op {
        "is_null" => Ok((format!("`{}` IS NULL", escaped), vec![])),
        "is_not_null" => Ok((format!("`{}` IS NOT NULL", escaped), vec![])),
        "eq" => {
            let v = raw_value
                .ok_or_else(|| "筛选「等于」需要提供值".to_string())?;
            Ok((format!("`{}` <=> ?", escaped), vec![v.to_string()]))
        }
        "ne" => {
            let v = raw_value
                .ok_or_else(|| "筛选「不等于」需要提供值".to_string())?;
            Ok((format!("NOT (`{}` <=> ?)", escaped), vec![v.to_string()]))
        }
        "contains" => {
            let v = raw_value
                .ok_or_else(|| "筛选「包含」需要提供值".to_string())?;
            let pat = format!("%{}%", escape_mysql_like_pattern(v));
            if text_like_like {
                Ok((format!("`{}` LIKE ?", escaped), vec![pat]))
            } else {
                Ok((format!("CAST(`{}` AS CHAR) LIKE ?", escaped), vec![pat]))
            }
        }
        "starts_with" => {
            let v = raw_value
                .ok_or_else(|| "筛选「开头是」需要提供值".to_string())?;
            let pat = format!("{}%", escape_mysql_like_pattern(v));
            if text_like_like {
                Ok((format!("`{}` LIKE ?", escaped), vec![pat]))
            } else {
                Ok((format!("CAST(`{}` AS CHAR) LIKE ?", escaped), vec![pat]))
            }
        }
        "gt" | "lt" | "gte" | "lte" => {
            let v = raw_value
                .ok_or_else(|| "筛选比较需要提供值".to_string())?;
            let cmp = match op {
                "gt" => ">",
                "lt" => "<",
                "gte" => ">=",
                "lte" => "<=",
                _ => unreachable!(),
            };
            Ok((format!("`{}` {} ?", escaped, cmp), vec![v.to_string()]))
        }
        _ => Err(format!("不支持的筛选操作: {}", op)),
    }
}

pub async fn connect(connection: &DatabaseConnection) -> Result<ConnectionResult, String> {
    let username = connection.username.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("root");
    let password = connection.password.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("");
    
    let mut opts = MySqlConnectOptions::new()
        .host(&connection.host)
        .port(connection.port)
        .username(username)
        .password(password)
        .statement_cache_capacity(0);

    if connection.ssl {
        opts = opts.ssl_mode(MySqlSslMode::Preferred);
    } else {
        opts = opts.ssl_mode(MySqlSslMode::Disabled);
    }

    if let Some(db) = &connection.database {
        if !db.trim().is_empty() {
            opts = opts.database(db);
        }
    }

    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .min_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(30))
        .idle_timeout(std::time::Duration::from_secs(600))
        .connect_with(opts)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    {
        let mut connections = MYSQL_CONNECTIONS.lock().await;
        connections.insert(connection.id.clone(), pool);
    }
    
    {
        let mut meta = MYSQL_DEFAULT_DATABASE.lock().await;
        meta.insert(
            connection.id.clone(),
            connection.database.clone()
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
        );
    }
    
    Ok(ConnectionResult {
        success: true,
        message: "Connected successfully".to_string(),
    })
}

pub async fn test_connection(
    host: &str,
    port: u16,
    username: &Option<String>,
    password: &Option<String>,
    database: &Option<String>,
    ssl: bool,
) -> Result<ConnectionResult, String> {
    let user = username.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("root");
    let pass = password.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("");
    
    let mut opts = MySqlConnectOptions::new()
        .host(host)
        .port(port)
        .username(user)
        .password(pass)
        .statement_cache_capacity(0);

    if ssl {
        opts = opts.ssl_mode(MySqlSslMode::Preferred);
    } else {
        opts = opts.ssl_mode(MySqlSslMode::Disabled);
    }

    if let Some(db) = database {
        if !db.trim().is_empty() {
            opts = opts.database(db);
        }
    }

    let pool = MySqlPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect_with(opts)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    pool.close().await;
    
    Ok(ConnectionResult {
        success: true,
        message: "Connection successful!".to_string(),
    })
}

pub async fn disconnect(connection_id: &str) -> Result<(), String> {
    let mut connections = MYSQL_CONNECTIONS.lock().await;
    if let Some(pool) = connections.remove(connection_id) {
        pool.close().await;
    }
    drop(connections);
    let mut meta = MYSQL_DEFAULT_DATABASE.lock().await;
    meta.remove(connection_id);
    Ok(())
}

pub async fn get_tables(connection_id: &str) -> Result<Vec<MySQLTable>, String> {
    let pool = {
        let connections = MYSQL_CONNECTIONS.lock().await;
        connections.get(connection_id).cloned().ok_or("Connection not found")?
    };

    let default_db = {
        let meta = MYSQL_DEFAULT_DATABASE.lock().await;
        meta.get(connection_id).cloned().flatten()
    };

    let rows = if let Some(db) = default_db {
        sqlx::query_as::<_, (String, Option<String>, Option<u64>, Option<String>)>(
            "SELECT table_name, engine, table_rows, 
             CONCAT(ROUND(data_length / 1024 / 1024, 2), ' MB') as size
             FROM information_schema.tables 
             WHERE table_schema = ?
             AND table_type = 'BASE TABLE'
             ORDER BY table_name"
        )
        .bind(&db)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to get tables: {}", e))?
    } else {
        sqlx::query_as::<_, (String, Option<String>, Option<u64>, Option<String>)>(
            "SELECT table_name, engine, table_rows, 
             CONCAT(ROUND(data_length / 1024 / 1024, 2), ' MB') as size
             FROM information_schema.tables 
             WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
             AND table_type = 'BASE TABLE'
             ORDER BY table_name"
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to get tables: {}", e))?
    };

    let tables: Vec<MySQLTable> = rows
        .into_iter()
        .map(|(name, engine, rows, size)| MySQLTable {
            name,
            engine: engine.unwrap_or_else(|| "UNKNOWN".to_string()),
            rows: rows.unwrap_or(0),
            size: size.unwrap_or_else(|| "0 MB".to_string()),
            created: String::new(),
        })
        .collect();

    Ok(tables)
}

pub async fn get_columns(connection_id: &str, table_name: &str) -> Result<Vec<MySQLColumn>, String> {
    let pool = {
        let connections = MYSQL_CONNECTIONS.lock().await;
        connections.get(connection_id).cloned().ok_or("Connection not found")?
    };

    let default_db = {
        let meta = MYSQL_DEFAULT_DATABASE.lock().await;
        meta.get(connection_id).cloned().flatten()
    };

    let database_name =
        resolve_table_schema(&pool, table_name, default_db.as_deref()).await?;

    set_default_database(connection_id, &database_name).await;

    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, String, Option<String>, Option<String>)>(
        "SELECT column_name, data_type, is_nullable, column_default, extra, column_type, character_set_name, collation_name
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ordinal_position"
    )
    .bind(&database_name)
    .bind(table_name)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to get columns: {}", e))?;

    let columns: Vec<MySQLColumn> = rows
        .into_iter()
        .map(|(name, data_type, nullable, default, extra, column_type, _charset, _collation)| {
            let full_type = column_type.clone();
            let type_lower = data_type.to_lowercase();
            let is_unsigned = full_type.to_lowercase().contains("unsigned");
            let is_blob = type_lower == "blob" || type_lower == "tinyblob" || type_lower == "mediumblob" || type_lower == "longblob" || type_lower == "binary" || type_lower == "varbinary";
            let is_enum = type_lower == "enum";
            let is_json = type_lower == "json";
            let is_bit = type_lower == "bit";
            let is_geometry = type_lower == "geometry" || type_lower == "point" || type_lower == "linestring" || type_lower == "polygon" || type_lower == "multipoint" || type_lower == "multilinestring" || type_lower == "multipolygon" || type_lower == "geometrycollection";

            let enum_values = if is_enum {
                parse_enum_values(&full_type)
            } else {
                None
            };

            let max_length = extract_max_length(&full_type);

            MySQLColumn {
                name,
                full_type,
                r#type: data_type,
                nullable: nullable == "YES",
                default,
                extra: extra.unwrap_or_default(),
                is_unsigned,
                is_blob,
                is_enum,
                is_json,
                is_bit,
                is_geometry,
                enum_values,
                max_length,
            }
        })
        .collect();

    Ok(columns)
}

fn extract_max_length(column_type: &str) -> Option<String> {
    let upper = column_type.to_uppercase();
    if let Some(start) = upper.find('(') {
        if let Some(end) = upper.find(')') {
            if end > start {
                return Some(column_type[start+1..end].to_string());
            }
        }
    }
    if upper.contains("INT") {
        return Some("4".to_string());
    }
    if upper.contains("BIGINT") {
        return Some("8".to_string());
    }
    if upper.contains("SMALLINT") {
        return Some("2".to_string());
    }
    if upper.contains("TINYINT") {
        return Some("1".to_string());
    }
    None
}

fn parse_enum_values(column_type: &str) -> Option<Vec<String>> {
    let start = column_type.find("enum('")?;
    let content_start = start + 5;
    let end = column_type.rfind(')')?;
    if end <= content_start {
        return None;
    }
    let content = &column_type[content_start..end];
    let values: Vec<String> = content
        .split("','")
        .map(|s| s.replace('\'', "").trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if values.is_empty() {
        None
    } else {
        Some(values)
    }
}

pub async fn get_table_data(
    connection_id: &str,
    table_name: &str,
    limit: u32,
    offset: u32,
    order_by: Option<&str>,
    order_desc: bool,
    filter_column: Option<&str>,
    filter_op: Option<&str>,
    filter_value: Option<&str>,
) -> Result<TableDataResult, String> {
    let pool = {
        let connections = MYSQL_CONNECTIONS.lock().await;
        connections.get(connection_id).cloned().ok_or("Connection not found")?
    };

    let start = std::time::Instant::now();

    let default_db = {
        let meta = MYSQL_DEFAULT_DATABASE.lock().await;
        meta.get(connection_id).cloned().flatten()
    };

    let database_name =
        resolve_table_schema(&pool, table_name, default_db.as_deref()).await?;

    set_default_database(connection_id, &database_name).await;

    let col_meta = load_column_meta(&pool, &database_name, table_name).await?;

    let mut where_sql: Option<String> = None;
    let mut bind_params: Vec<String> = Vec::new();

    if let (Some(fc), Some(fo)) = (filter_column, filter_op) {
        let fc = fc.trim();
        if fc.is_empty() {
            return Err("筛选列名无效".to_string());
        }
        let col = col_meta
            .get(fc)
            .ok_or_else(|| format!("未知列: {}", fc))?;
        if !column_filterable(col) {
            return Err(format!(
                "列「{}」为 JSON/BLOB/GEOMETRY/BIT 等类型，不支持筛选",
                fc
            ));
        }
        let (w, mut binds) = build_filter_sql(fc, col, fo, filter_value)?;
        where_sql = Some(w);
        bind_params.append(&mut binds);
    }

    let mut order_sql: Option<String> = None;
    if let Some(ob) = order_by {
        let ob = ob.trim();
        if ob.is_empty() {
            return Err("排序列名无效".to_string());
        }
        let col = col_meta
            .get(ob)
            .ok_or_else(|| format!("未知列: {}", ob))?;
        if !column_sortable(col) {
            return Err(format!(
                "列「{}」为 JSON/BLOB/GEOMETRY/BIT 等类型，不支持排序",
                ob
            ));
        }
        let dir = if order_desc { "DESC" } else { "ASC" };
        order_sql = Some(format!(
            "ORDER BY `{}` {}",
            escape_mysql_ident(ob),
            dir
        ));
    }

    let mut count_query = format!(
        "SELECT COUNT(*) as count FROM `{}`.`{}`",
        database_name, table_name
    );
    if let Some(ref w) = where_sql {
        count_query.push_str(" WHERE ");
        count_query.push_str(w);
    }

    let mut count_q = sqlx::query(&count_query);
    for b in &bind_params {
        count_q = count_q.bind(b);
    }
    let count_row = count_q
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Failed to count rows: {}", e))?;
    let total_count: i64 = count_row.get("count");

    let mut data_query = format!("SELECT * FROM `{}`.`{}`", database_name, table_name);
    if let Some(ref w) = where_sql {
        data_query.push_str(" WHERE ");
        data_query.push_str(w);
    }
    if let Some(ref o) = order_sql {
        data_query.push(' ');
        data_query.push_str(o);
    }
    data_query.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));

    let mut data_q = sqlx::query(&data_query);
    for b in &bind_params {
        data_q = data_q.bind(b);
    }
    let result = data_q
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to fetch data: {}", e))?;

    let execution_time = start.elapsed().as_secs_f64();

    let columns: Vec<String> = if result.is_empty() {
        let cols_query = format!("SHOW COLUMNS FROM `{}`.`{}`", database_name, table_name);
        sqlx::query(&cols_query)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Failed to get columns: {}", e))?
            .iter()
            .map(|row| row.get::<String, _>("Field"))
            .collect()
    } else {
        result[0].columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect()
    };

    let rows: Vec<serde_json::Value> = result
        .iter()
        .map(|row| {
            let mut obj = serde_json::Map::new();
            for (i, col) in columns.iter().enumerate() {
                let value = extract_value(row, i);
                obj.insert(col.clone(), value);
            }
            serde_json::Value::Object(obj)
        })
        .collect();

    Ok(TableDataResult {
        columns,
        rows,
        total_count,
        execution_time,
    })
}

fn extract_value(row: &sqlx::mysql::MySqlRow, index: usize) -> serde_json::Value {
    if let Ok(v) = row.try_get::<String, _>(index) {
        if v.starts_with('{') || v.starts_with('[') {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&v) {
                return parsed;
            }
        }
        return serde_json::Value::String(v);
    } else if let Ok(v) = row.try_get::<i64, _>(index) {
        serde_json::Value::Number(v.into())
    } else if let Ok(v) = row.try_get::<u64, _>(index) {
        serde_json::Value::Number(v.into())
    } else if let Ok(v) = row.try_get::<i32, _>(index) {
        serde_json::Value::Number(v.into())
    } else if let Ok(v) = row.try_get::<u32, _>(index) {
        serde_json::Value::Number(v.into())
    } else if let Ok(v) = row.try_get::<i16, _>(index) {
        serde_json::Value::Number(v.into())
    } else if let Ok(v) = row.try_get::<u16, _>(index) {
        serde_json::Value::Number(v.into())
    } else if let Ok(v) = row.try_get::<i8, _>(index) {
        serde_json::Value::Number(v.into())
    } else if let Ok(v) = row.try_get::<u8, _>(index) {
        serde_json::Value::Number(v.into())
    } else if let Ok(v) = row.try_get::<f64, _>(index) {
        serde_json::Number::from_f64(v)
            .map_or(serde_json::Value::Null, serde_json::Value::Number)
    } else if let Ok(v) = row.try_get::<f32, _>(index) {
        serde_json::Number::from_f64(v as f64)
            .map_or(serde_json::Value::Null, serde_json::Value::Number)
    } else if let Ok(v) = row.try_get::<bool, _>(index) {
        serde_json::Value::Bool(v)
    } else if let Ok(v) = row.try_get::<Vec<u8>, _>(index) {
        serde_json::Value::String(base64_encode(&v))
    } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(index) {
        serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S").to_string())
    } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(index) {
        serde_json::Value::String(v.format("%Y-%m-%d").to_string())
    } else if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(index) {
        serde_json::Value::String(v.format("%H:%M:%S%.f").to_string())
    } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(index) {
        serde_json::Value::String(v.to_rfc3339())
    } else {
        serde_json::Value::Null
    }
}

fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let chunks = data.chunks(3);
    for chunk in chunks {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;
        result.push(ALPHABET[b0 >> 2] as char);
        result.push(ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)] as char);
        if chunk.len() > 1 {
            result.push(ALPHABET[((b1 & 0x0F) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(ALPHABET[b2 & 0x3F] as char);
        } else {
            result.push('=');
        }
    }
    result
}

pub async fn insert_record(
    connection_id: &str,
    table_name: &str,
    data: serde_json::Value,
) -> Result<u64, String> {
    let pool = {
        let connections = MYSQL_CONNECTIONS.lock().await;
        connections.get(connection_id).cloned().ok_or("Connection not found")?
    };

    let default_db = {
        let meta = MYSQL_DEFAULT_DATABASE.lock().await;
        meta.get(connection_id).cloned().flatten()
    };

    let database_name =
        resolve_table_schema(&pool, table_name, default_db.as_deref()).await?;

    set_default_database(connection_id, &database_name).await;

    let obj = data.as_object().ok_or("Invalid data format")?;
    let columns: Vec<&str> = obj.keys().map(|k| k.as_str()).collect();
    let placeholders: Vec<&str> = (0..columns.len()).map(|_| "?").collect();
    
    let query = format!(
        "INSERT INTO `{}`.`{}` ({}) VALUES ({})",
        database_name,
        table_name,
        columns.iter().map(|c| format!("`{}`", c)).collect::<Vec<_>>().join(", "),
        placeholders.join(", ")
    );

    let mut q = sqlx::query(&query);
    for col in &columns {
        let val = obj.get(*col).unwrap();
        q = bind_value(q, val);
    }

    let result = q.execute(&pool).await.map_err(|e| format!("Insert failed: {}", e))?;
    Ok(result.last_insert_id())
}

pub async fn update_record(
    connection_id: &str,
    table_name: &str,
    data: serde_json::Value,
    primary_key: &str,
    primary_value: serde_json::Value,
) -> Result<u64, String> {
    let pool = {
        let connections = MYSQL_CONNECTIONS.lock().await;
        connections.get(connection_id).cloned().ok_or("Connection not found")?
    };

    let default_db = {
        let meta = MYSQL_DEFAULT_DATABASE.lock().await;
        meta.get(connection_id).cloned().flatten()
    };

    let database_name =
        resolve_table_schema(&pool, table_name, default_db.as_deref()).await?;

    set_default_database(connection_id, &database_name).await;

    let obj = data.as_object().ok_or("Invalid data format")?;
    let set_clauses: Vec<String> = obj.keys()
        .filter(|k| *k != primary_key)
        .map(|k| format!("`{}` = ?", k))
        .collect();

    if set_clauses.is_empty() {
        return Ok(0);
    }

    let query = format!(
        "UPDATE `{}`.`{}` SET {} WHERE `{}` = ?",
        database_name,
        table_name,
        set_clauses.join(", "),
        primary_key
    );

    let mut q = sqlx::query(&query);
    
    for col in obj.keys().filter(|k| *k != primary_key) {
        let val = obj.get(col).unwrap();
        q = bind_value(q, val);
    }

    q = bind_value(q, &primary_value);

    let result = q.execute(&pool).await.map_err(|e| format!("Update failed: {}", e))?;
    Ok(result.rows_affected())
}

pub async fn delete_record(
    connection_id: &str,
    table_name: &str,
    primary_key: &str,
    primary_value: serde_json::Value,
) -> Result<u64, String> {
    let pool = {
        let connections = MYSQL_CONNECTIONS.lock().await;
        connections.get(connection_id).cloned().ok_or("Connection not found")?
    };

    let default_db = {
        let meta = MYSQL_DEFAULT_DATABASE.lock().await;
        meta.get(connection_id).cloned().flatten()
    };

    let database_name =
        resolve_table_schema(&pool, table_name, default_db.as_deref()).await?;

    set_default_database(connection_id, &database_name).await;

    let query = format!(
        "DELETE FROM `{}`.`{}` WHERE `{}` = ?",
        database_name,
        table_name,
        primary_key
    );

    let mut q = sqlx::query(&query);
    q = bind_value(q, &primary_value);

    let result = q.execute(&pool).await.map_err(|e| format!("Delete failed: {}", e))?;
    Ok(result.rows_affected())
}

fn bind_value<'a>(query: sqlx::query::Query<'a, sqlx::mysql::MySql, sqlx::mysql::MySqlArguments>, value: &serde_json::Value) -> sqlx::query::Query<'a, sqlx::mysql::MySql, sqlx::mysql::MySqlArguments> {
    if value.is_null() {
        query.bind(None::<String>)
    } else if let Some(s) = value.as_str() {
        if s.starts_with("BASE64:") {
            let data = &s[7..];
            if let Ok(bytes) = base64_decode(data) {
                query.bind(bytes)
            } else {
                query.bind(s.to_string())
            }
        } else {
            query.bind(s.to_string())
        }
    } else if let Some(i) = value.as_i64() {
        query.bind(i)
    } else if let Some(u) = value.as_u64() {
        query.bind(u)
    } else if let Some(f) = value.as_f64() {
        query.bind(f)
    } else if let Some(b) = value.as_bool() {
        query.bind(if b { 1 } else { 0 })
    } else {
        query.bind(value.to_string())
    }
}

fn base64_decode(input: &str) -> Result<Vec<u8>, ()> {
    const DECODE_TABLE: [i8; 128] = [
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 62, -1, -1, -1, 63,
        52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1,
        -1,  0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14,
        15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, -1,
        -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
        41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, -1, -1, -1, -1, -1,
    ];
    let input = input.as_bytes();
    let mut result = Vec::with_capacity(input.len() * 3 / 4);
    let mut i = 0;
    while i < input.len() {
        let mut buf = [0u8; 4];
        let mut buf_len = 0;
        while i < input.len() && buf_len < 4 {
            let c = input[i];
            if c == b'=' {
                break;
            }
            if c < 128 {
                let v = DECODE_TABLE[c as usize];
                if v >= 0 {
                    buf[buf_len] = v as u8;
                    buf_len += 1;
                }
            }
            i += 1;
        }
        if buf_len >= 2 {
            result.push((buf[0] << 2) | (buf[1] >> 4));
        }
        if buf_len >= 3 {
            result.push((buf[1] << 4) | (buf[2] >> 2));
        }
        if buf_len >= 4 {
            result.push((buf[2] << 6) | buf[3]);
        }
        i += 1;
    }
    Ok(result)
}

pub fn escape_mysql_ident(name: &str) -> String {
    name.replace('`', "``")
}

/// 统计 SQL 中 `?` 占位符数量（忽略字符串与注释内的 `?`）。
fn count_sql_placeholders(sql: &str) -> usize {
    let mut count = 0usize;
    let mut i = 0usize;
    let b = sql.as_bytes();
    let mut in_single = false;
    let mut in_double = false;
    let mut in_backtick = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    while i < b.len() {
        if in_line_comment {
            if b[i] == b'\n' {
                in_line_comment = false;
            }
            i += 1;
            continue;
        }
        if in_block_comment {
            if b[i] == b'*' && i + 1 < b.len() && b[i + 1] == b'/' {
                in_block_comment = false;
                i += 2;
                continue;
            }
            i += 1;
            continue;
        }
        if !in_single && !in_double && !in_backtick {
            if b[i] == b'-' && i + 1 < b.len() && b[i + 1] == b'-' {
                in_line_comment = true;
                i += 2;
                continue;
            }
            if b[i] == b'/' && i + 1 < b.len() && b[i + 1] == b'*' {
                in_block_comment = true;
                i += 2;
                continue;
            }
        }
        if in_backtick {
            if b[i] == b'`' {
                if i + 1 < b.len() && b[i + 1] == b'`' {
                    i += 2;
                } else {
                    in_backtick = false;
                    i += 1;
                }
            } else {
                i += 1;
            }
            continue;
        }
        if in_single {
            if b[i] == b'\\' && i + 1 < b.len() {
                i += 2;
                continue;
            }
            if b[i] == b'\'' {
                in_single = false;
            }
            i += 1;
            continue;
        }
        if in_double {
            if b[i] == b'\\' && i + 1 < b.len() {
                i += 2;
                continue;
            }
            if b[i] == b'"' {
                in_double = false;
            }
            i += 1;
            continue;
        }
        match b[i] {
            b'\'' => {
                in_single = true;
                i += 1;
            }
            b'"' => {
                in_double = true;
                i += 1;
            }
            b'`' => {
                in_backtick = true;
                i += 1;
            }
            b'?' => {
                count += 1;
                i += 1;
            }
            _ => i += 1,
        }
    }
    count
}

fn mysql_query_returns_rows(trimmed: &str) -> bool {
    let upper = trimmed.to_uppercase();
    upper.starts_with("SELECT")
        || upper.starts_with("WITH")
        || upper.starts_with("SHOW")
        || upper.starts_with("DESCRIBE")
        || upper.starts_with("DESC ")
        || upper.starts_with("EXPLAIN")
        || upper.starts_with("CALL")
}

fn validate_mysql_query(query: &str) -> Result<(), String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("SQL 语句不能为空".to_string());
    }

    let upper = query.to_uppercase();

    if upper.contains("DROP DATABASE") || upper.contains("DROP SCHEMA") {
        return Err("不允许执行 DROP DATABASE / DROP SCHEMA，这是危险操作".to_string());
    }

    if upper.contains("RENAME DATABASE") || upper.contains("RENAME SCHEMA") {
        return Err("不允许执行 RENAME DATABASE / RENAME SCHEMA，MySQL 不支持此操作".to_string());
    }

    if upper.contains("ALTER DATABASE") {
        return Err("不允许执行 ALTER DATABASE，这是危险操作".to_string());
    }

    let stmt_count = upper.split(';').filter(|s| !s.trim().is_empty()).count();
    if stmt_count > 1 {
        return Err("不支持多语句执行，请只输入一条 SQL 语句".to_string());
    }

    if upper.contains("LOAD_FILE") {
        return Err("不允许执行 LOAD_FILE 函数，这是危险操作".to_string());
    }

    if upper.contains("INTO OUTFILE") || upper.contains("INTO DUMPFILE") {
        return Err("不允许执行 INTO OUTFILE / INTO DUMPFILE，这是危险操作".to_string());
    }

    if upper.contains("SHUTDOWN") {
        return Err("不允许执行 SHUTDOWN 命令".to_string());
    }

    if upper.contains("GRANT") || upper.contains("REVOKE") {
        return Err("不允许执行 GRANT / REVOKE 权限命令".to_string());
    }

    Ok(())
}

pub async fn execute_query(
    connection_id: &str,
    query: &str,
    params: Option<Vec<String>>,
) -> Result<QueryResult, String> {
    if let Err(e) = validate_mysql_query(query) {
        return Err(e);
    }

    let pool = {
        let connections = MYSQL_CONNECTIONS.lock().await;
        connections.get(connection_id).cloned().ok_or("Connection not found")?
    };

    let default_db = {
        let meta = MYSQL_DEFAULT_DATABASE.lock().await;
        meta.get(connection_id).cloned().flatten()
    };

    let ph = count_sql_placeholders(query);
    let param_slice: &[String] = match &params {
        Some(v) => v.as_slice(),
        None => &[] as &[String],
    };
    if ph != param_slice.len() {
        return Err(format!(
            "占位符 `?` 共 {} 个，当前提供 {} 个参数（请与下方参数框一致，或使用预编译绑定）",
            ph,
            param_slice.len()
        ));
    }

    let start = std::time::Instant::now();

    if let Some(ref db) = default_db {
        sqlx::query(&format!("USE `{}`", escape_mysql_ident(db)))
            .execute(&pool)
            .await
            .map_err(|e| {
                let msg = e.to_string();
                if msg.contains("1046") || msg.contains("3D000") {
                    format!(
                        "{} — 提示：请在连接里填写「数据库」名，或在 SQL 中使用 `库名.表名`。",
                        msg
                    )
                } else {
                    format!("USE 失败: {}", msg)
                }
            })?;
    }

    let mut q = sqlx::query(query);
    for p in param_slice {
        q = q.bind(p);
    }

    let trimmed = query.trim_start();
    let map_err = |e: sqlx::Error| {
        let msg = e.to_string();
        if msg.contains("1046") || msg.contains("3D000") {
            format!(
                "{} — 提示：请在连接里填写「数据库」名，或在 SQL 中使用 `库名.表名`。",
                msg
            )
        } else {
            msg
        }
    };

    if mysql_query_returns_rows(trimmed) {
        let result = q.fetch_all(&pool).await.map_err(map_err)?;
        let execution_time = start.elapsed().as_secs_f64();

        if result.is_empty() {
            return Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                execution_time,
                affected_rows: Some(0),
            });
        }

        let columns: Vec<String> = result[0]
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect();

        let rows: Vec<serde_json::Value> = result
            .iter()
            .map(|row| {
                let mut obj = serde_json::Map::new();
                for (i, col) in columns.iter().enumerate() {
                    let value = extract_value(row, i);
                    obj.insert(col.clone(), value);
                }
                serde_json::Value::Object(obj)
            })
            .collect();

        Ok(QueryResult {
            columns,
            rows,
            execution_time,
            affected_rows: None,
        })
    } else {
        let res = q.execute(&pool).await.map_err(map_err)?;
        let execution_time = start.elapsed().as_secs_f64();
        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            execution_time,
            affected_rows: Some(res.rows_affected()),
        })
    }
}

/// Get stored procedures and functions
pub async fn get_routines(
    connection_id: &str,
    routine_type: Option<&str>,
) -> Result<Vec<MySQLRoutine>, String> {
    let pool = {
        let connections = MYSQL_CONNECTIONS.lock().await;
        connections.get(connection_id).cloned().ok_or("Connection not found")?
    };

    let default_db = {
        let meta = MYSQL_DEFAULT_DATABASE.lock().await;
        meta.get(connection_id).cloned().flatten()
    };

    let db_filter = default_db
        .as_deref()
        .filter(|s| !s.is_empty())
        .ok_or("Please specify a database in the connection")?;

    let mut query = String::from(
        "SELECT routine_schema, routine_name, routine_type, data_type, routine_definition
         FROM information_schema.routines
         WHERE routine_schema = ?"
    );

    if let Some(rtype) = routine_type {
        if !rtype.is_empty() {
            query.push_str(" AND routine_type = ?");
        }
    }

    query.push_str(" ORDER BY routine_name");

    let mut q = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>)>(&query);
    q = q.bind(db_filter);
    if let Some(rtype) = routine_type {
        if !rtype.is_empty() {
            q = q.bind(rtype);
        }
    }

    let routines_rows = q.fetch_all(&pool).await.map_err(|e| format!("Failed to get routines: {}", e))?;

    let mut routines = Vec::new();
    for (schema, name, routine_type, data_type, definition) in routines_rows {
        // Get parameters for this routine
        let params_query = String::from(
            "SELECT ordinal_position, parameter_name, parameter_mode, data_type
             FROM information_schema.parameters
             WHERE specific_schema = ? AND specific_name = ?
             ORDER BY ordinal_position"
        );

        let params_rows = sqlx::query_as::<_, (i32, Option<String>, Option<String>, String)>(&params_query)
            .bind(&schema)
            .bind(&name)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

        let parameters = params_rows
            .into_iter()
            .map(|(ordinal, name, mode, data_type)| MySQLRoutineParam {
                ordinal,
                name,
                mode,
                data_type,
            })
            .collect();

        routines.push(MySQLRoutine {
            schema,
            name,
            routine_type,
            data_type,
            definition_preview: definition.map(|d| d.chars().take(100).collect()),
            parameters,
        });
    }

    Ok(routines)
}
