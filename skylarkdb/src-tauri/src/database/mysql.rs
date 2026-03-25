use sqlx::{MySqlPool, Row, Column};
use crate::models::*;
use crate::database::MYSQL_CONNECTIONS;

pub async fn connect(connection: &DatabaseConnection) -> Result<ConnectionResult, String> {
    let database_url = if connection.database.as_ref().map_or(true, |d| d.is_empty()) {
        format!(
            "mysql://{}:{}@{}:{}/?ssl-mode={}",
            connection.username.as_deref().unwrap_or("root"),
            connection.password.as_deref().unwrap_or(""),
            connection.host,
            connection.port,
            if connection.ssl { "required" } else { "disabled" }
        )
    } else {
        format!(
            "mysql://{}:{}@{}:{}/{}?ssl-mode={}",
            connection.username.as_deref().unwrap_or("root"),
            connection.password.as_deref().unwrap_or(""),
            connection.host,
            connection.port,
            connection.database.as_deref().unwrap_or(""),
            if connection.ssl { "required" } else { "disabled" }
        )
    };

    match MySqlPool::connect(&database_url).await {
        Ok(pool) => {
            let mut connections = MYSQL_CONNECTIONS.lock().await;
            connections.insert(connection.id.clone(), pool);
            Ok(ConnectionResult {
                success: true,
                message: "Connected successfully".to_string(),
            })
        }
        Err(e) => Err(format!("Failed to connect: {}", e)),
    }
}

pub async fn test_connection(
    host: &str,
    port: u16,
    username: &Option<String>,
    password: &Option<String>,
    database: &Option<String>,
    ssl: bool,
) -> Result<ConnectionResult, String> {
    let database_url = format!(
        "mysql://{}:{}@{}:{}/{}?ssl-mode={}",
        username.as_deref().unwrap_or("root"),
        password.as_deref().unwrap_or(""),
        host,
        port,
        database.as_deref().unwrap_or(""),
        if ssl { "required" } else { "disabled" }
    );

    match MySqlPool::connect(&database_url).await {
        Ok(_pool) => {
            Ok(ConnectionResult {
                success: true,
                message: "Connection successful!".to_string(),
            })
        }
        Err(e) => Err(format!("Connection failed: {}", e)),
    }
}

pub async fn disconnect(connection_id: &str) -> Result<(), String> {
    let mut connections = MYSQL_CONNECTIONS.lock().await;
    connections.remove(connection_id);
    Ok(())
}

pub async fn get_tables(connection_id: &str) -> Result<Vec<MySQLTable>, String> {
    let connections = MYSQL_CONNECTIONS.lock().await;
    let pool = connections.get(connection_id)
        .ok_or("Connection not found")?;

    let rows = sqlx::query_as::<_, (String, String, u64, String)>(
        "SELECT DISTINCT table_name, engine, table_rows, 
         CONCAT(ROUND(data_length / 1024 / 1024, 2), ' MB') as size
         FROM information_schema.tables 
         WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
         AND table_type = 'BASE TABLE'
         ORDER BY table_name"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let tables: Vec<MySQLTable> = rows
        .into_iter()
        .map(|(name, engine, rows, size)| MySQLTable {
            name,
            engine,
            rows,
            size,
            created: String::new(),
        })
        .collect();

    Ok(tables)
}

pub async fn get_columns(connection_id: &str, table_name: &str) -> Result<Vec<MySQLColumn>, String> {
    let connections = MYSQL_CONNECTIONS.lock().await;
    let pool = connections.get(connection_id)
        .ok_or("Connection not found")?;

    // First, get the database name for this table
    let db_query = sqlx::query_as::<_, (String,)>(
        "SELECT table_schema FROM information_schema.tables 
         WHERE table_name = ? 
         LIMIT 1"
    )
    .bind(table_name)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to find table database: {}", e))?;

    let database_name = db_query.map(|(db,)| db)
        .ok_or_else(|| format!("Table '{}' not found", table_name))?;

    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, String)>(
        "SELECT column_name, data_type, is_nullable, column_default, extra
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ordinal_position"
    )
    .bind(database_name)
    .bind(table_name)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let columns: Vec<MySQLColumn> = rows
        .into_iter()
        .map(|(name, type_, nullable, default, extra)| MySQLColumn {
            name,
            r#type: type_,
            nullable: nullable == "YES",
            default,
            extra,
        })
        .collect();

    Ok(columns)
}

pub async fn get_table_data(
    connection_id: &str,
    table_name: &str,
    limit: u32,
    offset: u32,
) -> Result<TableDataResult, String> {
    let connections = MYSQL_CONNECTIONS.lock().await;
    let pool = connections.get(connection_id)
        .ok_or("Connection not found")?;

    let start = std::time::Instant::now();

    // First, get the database name for this table
    let db_query = sqlx::query_as::<_, (String,)>(
        "SELECT table_schema FROM information_schema.tables 
         WHERE table_name = ? 
         LIMIT 1"
    )
    .bind(table_name)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to find table database: {}", e))?;

    let database_name = db_query.map(|(db,)| db)
        .ok_or_else(|| format!("Table '{}' not found", table_name))?;

    // Now query the table data with the database name
    let count_query = format!("SELECT COUNT(*) as count FROM `{}`.`{}`", database_name, table_name);
    let count_row = sqlx::query(&count_query)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let total_count: i64 = count_row.get("count");

    let data_query = format!(
        "SELECT * FROM `{}`.`{}` LIMIT {} OFFSET {}",
        database_name, table_name, limit, offset
    );
    let result = sqlx::query(&data_query)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let execution_time = start.elapsed().as_secs_f64();

    let columns: Vec<String> = if result.is_empty() {
        sqlx::query(&format!("SHOW COLUMNS FROM `{}`", table_name))
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
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
                let value: serde_json::Value = if let Ok(v) = row.try_get::<String, _>(i) {
                    serde_json::Value::String(v)
                } else if let Ok(v) = row.try_get::<i64, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<u64, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<f64, _>(i) {
                    serde_json::Number::from_f64(v)
                        .map_or(serde_json::Value::Null, serde_json::Value::Number)
                } else if let Ok(v) = row.try_get::<bool, _>(i) {
                    serde_json::Value::Bool(v)
                } else {
                    serde_json::Value::Null
                };
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

pub async fn execute_query(connection_id: &str, query: &str) -> Result<QueryResult, String> {
    let connections = MYSQL_CONNECTIONS.lock().await;
    let pool = connections.get(connection_id)
        .ok_or("Connection not found")?;

    let start = std::time::Instant::now();
    
    let result = sqlx::query(query)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let execution_time = start.elapsed().as_secs_f64();

    if result.is_empty() {
        return Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            execution_time,
            affected_rows: Some(0),
        });
    }

    let columns: Vec<String> = result[0].columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();

    let rows: Vec<serde_json::Value> = result
        .iter()
        .map(|row| {
            let mut obj = serde_json::Map::new();
            for (i, col) in columns.iter().enumerate() {
                let value: serde_json::Value = if let Ok(v) = row.try_get::<String, _>(i) {
                    serde_json::Value::String(v)
                } else if let Ok(v) = row.try_get::<i64, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<f64, _>(i) {
                    serde_json::Number::from_f64(v)
                        .map_or(serde_json::Value::Null, serde_json::Value::Number)
                } else if let Ok(v) = row.try_get::<bool, _>(i) {
                    serde_json::Value::Bool(v)
                } else {
                    serde_json::Value::Null
                };
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
}
