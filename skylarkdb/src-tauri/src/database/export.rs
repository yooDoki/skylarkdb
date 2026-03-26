use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use sqlx::{Row, MySqlPool, Column};
use crate::models::*;
use crate::database::mysql::escape_mysql_ident;

/// Escape a string for JSON
fn escape_json_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            c if c.is_control() => {
                result.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => result.push(c),
        }
    }
    result
}

/// Get table structure (CREATE TABLE statement)
pub async fn get_table_structure(
    pool: &MySqlPool,
    database: &str,
    table_name: &str,
) -> Result<String, String> {
    let row = sqlx::query("SHOW CREATE TABLE ?.?")
        .bind(database)
        .bind(table_name)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to get table structure: {}", e))?;
    
    let create_statement: String = row.get(1);
    Ok(create_statement)
}

/// Export table data to JSON format
pub async fn export_table_to_json(
    pool: &MySqlPool,
    database: &str,
    table_name: &str,
    output_path: &Path,
) -> Result<u64, String> {
    // Get all data from the table
    let query = format!(
        "SELECT * FROM `{}`.`{}`",
        escape_mysql_ident(database),
        escape_mysql_ident(table_name)
    );
    
    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch table data: {}", e))?;
    
    let row_count = rows.len() as u64;
    
    if rows.is_empty() {
        // Write empty array
        let file = File::create(output_path)
            .map_err(|e| format!("Failed to create output file: {}", e))?;
        let mut writer = BufWriter::new(file);
        writer.write_all(b"[]")
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        return Ok(0);
    }
    
    // Get column names
    let columns: Vec<String> = rows[0]
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();
    
    // Write JSON manually for better control
    let file = File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut writer = BufWriter::new(file);
    
    writer.write_all(b"[\n")
        .map_err(|e| format!("Failed to write to file: {}", e))?;
    
    for (i, row) in rows.iter().enumerate() {
        writer.write_all(b"  {")
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        
        for (j, col) in columns.iter().enumerate() {
            if j > 0 {
                writer.write_all(b", ")
                    .map_err(|e| format!("Failed to write to file: {}", e))?;
            }
            
            writer.write_all(b"\"")
                .map_err(|e| format!("Failed to write to file: {}", e))?;
            writer.write_all(col.as_bytes())
                .map_err(|e| format!("Failed to write to file: {}", e))?;
            writer.write_all(b"\": ")
                .map_err(|e| format!("Failed to write to file: {}", e))?;
            
            // Try to extract value as different types
            let value_str = extract_value_as_json_string(row, j);
            writer.write_all(value_str.as_bytes())
                .map_err(|e| format!("Failed to write to file: {}", e))?;
        }
        
        if i < rows.len() - 1 {
            writer.write_all(b"},\n")
                .map_err(|e| format!("Failed to write to file: {}", e))?;
        } else {
            writer.write_all(b"}\n")
                .map_err(|e| format!("Failed to write to file: {}", e))?;
        }
    }
    
    writer.write_all(b"]")
        .map_err(|e| format!("Failed to write to file: {}", e))?;
    writer.flush()
        .map_err(|e| format!("Failed to flush writer: {}", e))?;
    
    Ok(row_count)
}

/// Export table data to CSV format
pub async fn export_table_to_csv(
    pool: &MySqlPool,
    database: &str,
    table_name: &str,
    output_path: &Path,
) -> Result<u64, String> {
    let query = format!(
        "SELECT * FROM `{}`.`{}`",
        escape_mysql_ident(database),
        escape_mysql_ident(table_name)
    );
    
    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch table data: {}", e))?;
    
    let row_count = rows.len() as u64;
    
    let file = File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut writer = BufWriter::new(file);
    
    if rows.is_empty() {
        return Ok(0);
    }
    
    // Get column names and write header
    let columns: Vec<String> = rows[0]
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();
    
    // Write header
    writer.write_all(columns.join(",").as_bytes())
        .map_err(|e| format!("Failed to write header: {}", e))?;
    writer.write_all(b"\n")
        .map_err(|e| format!("Failed to write newline: {}", e))?;
    
    // Write data rows
    for row in &rows {
        let mut values = Vec::new();
        for (i, _) in columns.iter().enumerate() {
            let value = extract_value_as_csv_string(row, i);
            // Escape CSV: if value contains comma, quote, or newline, wrap in quotes
            if value.contains(',') || value.contains('"') || value.contains('\n') {
                values.push(format!("\"{}\"", value.replace('"', "\"\"")));
            } else {
                values.push(value);
            }
        }
        writer.write_all(values.join(",").as_bytes())
            .map_err(|e| format!("Failed to write row: {}", e))?;
        writer.write_all(b"\n")
            .map_err(|e| format!("Failed to write newline: {}", e))?;
    }
    
    writer.flush()
        .map_err(|e| format!("Failed to flush writer: {}", e))?;
    
    Ok(row_count)
}

/// Export table to SQL INSERT statements
pub async fn export_table_to_sql(
    pool: &MySqlPool,
    database: &str,
    table_name: &str,
    output_path: &Path,
    include_structure: bool,
) -> Result<u64, String> {
    let file = File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut writer = BufWriter::new(file);

    // Write table structure if requested
    if include_structure {
        let create_stmt = get_table_structure(pool, database, table_name).await?;
        writer.write_all(b"-- Table structure for `")
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        writer.write_all(table_name.as_bytes())
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        writer.write_all(b"`\n")
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        writer.write_all(b"DROP TABLE IF EXISTS `")
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        writer.write_all(table_name.as_bytes())
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        writer.write_all(b"`;\n")
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        writer.write_all(create_stmt.as_bytes())
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        writer.write_all(b";\n\n")
            .map_err(|e| format!("Failed to write to file: {}", e))?;
    }
    
    // Get all data
    let query = format!(
        "SELECT * FROM `{}`.`{}`",
        escape_mysql_ident(database),
        escape_mysql_ident(table_name)
    );
    
    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch table data: {}", e))?;

    let row_count = rows.len() as u64;
    
    if !rows.is_empty() {
        // Write data
        writer.write_all(b"-- Data for `")
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        writer.write_all(table_name.as_bytes())
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        writer.write_all(b"`\n")
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        
        let columns: Vec<String> = rows[0]
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect();
        
        for row in &rows {
            writer.write_all(b"INSERT INTO `")
                .map_err(|e| format!("Failed to write to file: {}", e))?;
            writer.write_all(table_name.as_bytes())
                .map_err(|e| format!("Failed to write to file: {}", e))?;
            writer.write_all(b"` (")
                .map_err(|e| format!("Failed to write to file: {}", e))?;
            
            writer.write_all(columns.join(", ").as_bytes())
                .map_err(|e| format!("Failed to write to file: {}", e))?;
            writer.write_all(b") VALUES (")
                .map_err(|e| format!("Failed to write to file: {}", e))?;
            
            for (i, _) in columns.iter().enumerate() {
                if i > 0 {
                    writer.write_all(b", ")
                        .map_err(|e| format!("Failed to write to file: {}", e))?;
                }
                
                let value = extract_value_as_sql_string(row, i);
                writer.write_all(value.as_bytes())
                    .map_err(|e| format!("Failed to write to file: {}", e))?;
            }
            
            writer.write_all(b");\n")
                .map_err(|e| format!("Failed to write to file: {}", e))?;
        }
    }
    
    writer.flush()
        .map_err(|e| format!("Failed to flush writer: {}", e))?;
    
    Ok(row_count)
}

/// Extract value from row as JSON string
fn extract_value_as_json_string(row: &sqlx::mysql::MySqlRow, index: usize) -> String {
    // Try various types in order
    if let Ok(v) = row.try_get::<Option<String>, _>(index) {
        return match v {
            Some(s) => format!("\"{}\"", escape_json_string(&s)),
            None => "null".to_string(),
        };
    }
    
    if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
        return match v {
            Some(n) => n.to_string(),
            None => "null".to_string(),
        };
    }
    
    if let Ok(v) = row.try_get::<Option<u64>, _>(index) {
        return match v {
            Some(n) => n.to_string(),
            None => "null".to_string(),
        };
    }
    
    if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
        return match v {
            Some(n) => serde_json::Number::from_f64(n)
                .map_or("null".to_string(), |n| n.to_string()),
            None => "null".to_string(),
        };
    }
    
    if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
        return match v {
            Some(b) => b.to_string(),
            None => "null".to_string(),
        };
    }
    
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(index) {
        return match v {
            Some(bytes) => format!("\"{}\"", base64_encode(&bytes)),
            None => "null".to_string(),
        };
    }
    
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(index) {
        return match v {
            Some(dt) => format!("\"{}\"", dt.format("%Y-%m-%d %H:%M:%S").to_string()),
            None => "null".to_string(),
        };
    }
    
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(index) {
        return match v {
            Some(d) => format!("\"{}\"", d.format("%Y-%m-%d").to_string()),
            None => "null".to_string(),
        };
    }
    
    "null".to_string()
}

/// Extract value from row as CSV string
fn extract_value_as_csv_string(row: &sqlx::mysql::MySqlRow, index: usize) -> String {
    if let Ok(v) = row.try_get::<Option<String>, _>(index) {
        return v.unwrap_or_default();
    }
    
    if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
        return v.map_or(String::new(), |n| n.to_string());
    }
    
    if let Ok(v) = row.try_get::<Option<u64>, _>(index) {
        return v.map_or(String::new(), |n| n.to_string());
    }
    
    if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
        return v.map_or(String::new(), |n| n.to_string());
    }
    
    if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
        return v.map_or(String::new(), |b| b.to_string());
    }
    
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(index) {
        return v.map_or(String::new(), |dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());
    }
    
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(index) {
        return v.map_or(String::new(), |d| d.format("%Y-%m-%d").to_string());
    }
    
    String::new()
}

/// Extract value from row as SQL string (for INSERT statements)
fn extract_value_as_sql_string(row: &sqlx::mysql::MySqlRow, index: usize) -> String {
    if let Ok(v) = row.try_get::<Option<String>, _>(index) {
        return match v {
            Some(s) => format!("'{}'", escape_mysql_value(&s)),
            None => "NULL".to_string(),
        };
    }
    
    if let Ok(v) = row.try_get::<Option<i64>, _>(index) {
        return v.map_or("NULL".to_string(), |n| n.to_string());
    }
    
    if let Ok(v) = row.try_get::<Option<u64>, _>(index) {
        return v.map_or("NULL".to_string(), |n| n.to_string());
    }
    
    if let Ok(v) = row.try_get::<Option<f64>, _>(index) {
        return v.map_or("NULL".to_string(), |n| n.to_string());
    }
    
    if let Ok(v) = row.try_get::<Option<bool>, _>(index) {
        return v.map_or("NULL".to_string(), |b| if b { "1" } else { "0" }.to_string());
    }
    
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(index) {
        return match v {
            Some(bytes) => format!("X'{}'", hex::encode(&bytes)),
            None => "NULL".to_string(),
        };
    }
    
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(index) {
        return v.map_or("NULL".to_string(), |dt| format!("'{}'", dt.format("%Y-%m-%d %H:%M:%S")));
    }
    
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(index) {
        return v.map_or("NULL".to_string(), |d| format!("'{}'", d.format("%Y-%m-%d")));
    }
    
    "NULL".to_string()
}

/// Escape MySQL string value
fn escape_mysql_value(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\'' => result.push_str("\\'"),
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\0' => result.push_str("\\0"),
            '\x1a' => result.push_str("\\Z"),
            c => result.push(c),
        }
    }
    result
}

/// Base64 encode for binary data
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

/// Main export function
pub async fn export_database(
    pool: &MySqlPool,
    options: &ExportOptions,
) -> Result<ExportResult, String> {
    let mut total_rows = 0u64;
    let mut exported_tables = 0u64;
    
    // Create output directory if it doesn't exist
    let output_dir = Path::new(&options.output_path);
    if let Some(parent) = output_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }
    
    for table in &options.tables {
        let table_output_path = match options.format {
            ExportFormat::Json => {
                Path::new(&options.output_path).join(format!("{}.json", table))
            }
            ExportFormat::Csv => {
                Path::new(&options.output_path).join(format!("{}.csv", table))
            }
            ExportFormat::Sql => {
                Path::new(&options.output_path).join(format!("{}.sql", table))
            }
        };
        
        let rows = match options.format {
            ExportFormat::Json => {
                export_table_to_json(pool, &options.database, table, &table_output_path).await?
            }
            ExportFormat::Csv => {
                export_table_to_csv(pool, &options.database, table, &table_output_path).await?
            }
            ExportFormat::Sql => {
                export_table_to_sql(pool, &options.database, table, &table_output_path, options.include_structure).await?
            }
        };
        
        total_rows += rows;
        exported_tables += 1;
    }
    
    Ok(ExportResult {
        success: true,
        message: format!("Successfully exported {} tables with {} total rows", exported_tables, total_rows),
        file_path: options.output_path.clone(),
        exported_rows: total_rows,
        exported_tables,
    })
}
