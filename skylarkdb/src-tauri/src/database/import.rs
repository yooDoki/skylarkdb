use crate::database::mysql::escape_mysql_ident;
use crate::models::*;
use sqlx::{Executor, MySqlPool};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// Type mapping from generic types to MySQL types
pub fn map_type_to_mysql(source_type: &str, sample_value: Option<&str>) -> String {
    let source_lower = source_type.to_lowercase();

    // Check explicit type hints first
    match source_lower.as_str() {
        "text" | "longtext" | "mediumtext" | "tinytext" => return "TEXT".to_string(),
        "int" | "integer" => return "INT".to_string(),
        "bigint" => return "BIGINT".to_string(),
        "smallint" => return "SMALLINT".to_string(),
        "tinyint" => return "TINYINT".to_string(),
        "float" => return "FLOAT".to_string(),
        "double" => return "DOUBLE".to_string(),
        "decimal" | "numeric" => return "DECIMAL(10,2)".to_string(),
        "bool" | "boolean" => return "TINYINT(1)".to_string(),
        "date" => return "DATE".to_string(),
        "datetime" | "timestamp" => return "DATETIME".to_string(),
        "time" => return "TIME".to_string(),
        "json" => return "JSON".to_string(),
        "blob" | "binary" | "varbinary" => return "BLOB".to_string(),
        _ => {}
    }

    // Infer from sample value if type is generic
    if let Some(value) = sample_value {
        if value.is_empty() {
            return "VARCHAR(255)".to_string();
        }

        // Check for boolean
        if value == "true" || value == "false" {
            return "TINYINT(1)".to_string();
        }

        // Check for integer
        if let Ok(num) = value.parse::<i64>() {
            if num >= 0 && num <= 255 {
                return "TINYINT".to_string();
            } else if num >= -32768 && num <= 32767 {
                return "SMALLINT".to_string();
            } else if num >= -2147483648 && num <= 2147483647 {
                return "INT".to_string();
            } else {
                return "BIGINT".to_string();
            }
        }

        // Check for float
        if value.parse::<f64>().is_ok() {
            return "DOUBLE".to_string();
        }

        // Check for date
        if chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok() {
            return "DATE".to_string();
        }

        // Check for datetime
        if chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S").is_ok() {
            return "DATETIME".to_string();
        }

        // Check for JSON
        if (value.starts_with('{') && value.ends_with('}'))
            || (value.starts_with('[') && value.ends_with(']'))
        {
            if serde_json::from_str::<serde_json::Value>(value).is_ok() {
                return "JSON".to_string();
            }
        }

        // Default to VARCHAR with length based on content
        let len = value.len();
        if len <= 255 {
            return "VARCHAR(255)".to_string();
        } else if len <= 65535 {
            return "TEXT".to_string();
        } else {
            return "LONGTEXT".to_string();
        }
    }

    // Default fallback
    "VARCHAR(255)".to_string()
}

/// Parse JSON file and return table data
pub fn parse_json_file(file_path: &Path) -> Result<serde_json::Value, String> {
    let file = File::open(file_path).map_err(|e| format!("Failed to open file: {}", e))?;

    let reader = BufReader::new(file);
    let content: String = reader
        .lines()
        .collect::<Result<String, _>>()
        .map_err(|e| format!("Failed to read file: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Parse CSV file and return rows with headers
pub fn parse_csv_file(file_path: &Path) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let file = File::open(file_path).map_err(|e| format!("Failed to open file: {}", e))?;

    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // Parse header
    let header_line = lines
        .next()
        .ok_or("CSV file is empty")?
        .map_err(|e| format!("Failed to read header: {}", e))?;

    let headers = parse_csv_line(&header_line);

    // Parse data rows
    let mut rows = Vec::new();
    for line in lines {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if !line.trim().is_empty() {
            rows.push(parse_csv_line(&line));
        }
    }

    Ok((headers, rows))
}

/// Parse a single CSV line (handles quoted fields)
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' if in_quotes => {
                // Check for escaped quote
                if chars.peek() == Some(&'"') {
                    chars.next();
                    current_field.push('"');
                } else {
                    in_quotes = false;
                }
            }
            '"' => {
                in_quotes = true;
            }
            ',' if !in_quotes => {
                fields.push(current_field.clone());
                current_field.clear();
            }
            _ => {
                current_field.push(c);
            }
        }
    }

    fields.push(current_field);
    fields
}

/// Create table from column mappings
pub async fn create_table_from_mappings(
    pool: &MySqlPool,
    database: &str,
    table_name: &str,
    column_mappings: &[ColumnMapping],
    on_conflict: &OnConflictStrategy,
) -> Result<(), String> {
    // Check if table exists
    let check_query = format!(
        "SELECT COUNT(*) FROM information_schema.tables 
         WHERE table_schema = '{}' AND table_name = '{}'",
        escape_mysql_ident(database),
        escape_mysql_ident(table_name)
    );

    let exists: (i64,) = sqlx::query_as(&check_query)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to check table existence: {}", e))?;

    if exists.0 > 0 {
        match on_conflict {
            OnConflictStrategy::Skip => {
                return Ok(());
            }
            OnConflictStrategy::Update => {
                // Drop existing table
                let drop_query = format!(
                    "DROP TABLE `{}`.`{}`",
                    escape_mysql_ident(database),
                    escape_mysql_ident(table_name)
                );
                pool.execute(&*drop_query)
                    .await
                    .map_err(|e| format!("Failed to drop existing table: {}", e))?;
            }
            OnConflictStrategy::Error => {
                return Err(format!(
                    "Table '{}.{}' already exists",
                    database, table_name
                ));
            }
        }
    }

    // Build CREATE TABLE statement
    let mut create_sql = format!(
        "CREATE TABLE `{}`.`{}` (\n",
        escape_mysql_ident(database),
        escape_mysql_ident(table_name)
    );

    let mut column_defs = Vec::new();
    let mut primary_keys = Vec::new();

    for mapping in column_mappings {
        let mysql_type = map_type_to_mysql(&mapping.target_type, mapping.default_value.as_deref());

        let mut col_def = format!(
            "    `{}` {}",
            escape_mysql_ident(&mapping.target_column),
            mysql_type
        );

        if !mapping.is_nullable {
            col_def.push_str(" NOT NULL");
        }

        if let Some(ref default) = mapping.default_value {
            if mapping.target_type.to_lowercase() == "text"
                || mapping.target_type.to_lowercase() == "blob"
                || mapping.target_type.to_lowercase() == "json"
            {
                // TEXT and BLOB can't have default values in MySQL
            } else {
                col_def.push_str(&format!(" DEFAULT '{}'", escape_mysql_value(default)));
            }
        }

        if mapping.is_primary_key {
            primary_keys.push(format!("`{}`", escape_mysql_ident(&mapping.target_column)));
        }

        column_defs.push(col_def);
    }

    create_sql.push_str(&column_defs.join(",\n"));

    if !primary_keys.is_empty() {
        create_sql.push_str(",\n    PRIMARY KEY (");
        create_sql.push_str(&primary_keys.join(", "));
        create_sql.push(')');
    }

    create_sql.push_str("\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Execute CREATE TABLE
    pool.execute(&*create_sql)
        .await
        .map_err(|e| format!("Failed to create table: {}", e))?;

    Ok(())
}

/// Import JSON data into a table
pub async fn import_json_data(
    pool: &MySqlPool,
    database: &str,
    table_name: &str,
    column_mappings: &[ColumnMapping],
    json_data: serde_json::Value,
) -> Result<u64, String> {
    let array = json_data.as_array().ok_or("JSON data must be an array")?;

    let mut imported_rows = 0u64;

    for (row_idx, row) in array.iter().enumerate() {
        let obj = row
            .as_object()
            .ok_or_else(|| format!("Row {} is not an object", row_idx))?;

        let mut columns = Vec::new();
        let mut placeholders = Vec::new();
        let mut values = Vec::new();

        for mapping in column_mappings {
            if let Some(value) = obj.get(&mapping.source_column) {
                columns.push(format!("`{}`", escape_mysql_ident(&mapping.target_column)));
                placeholders.push("?".to_string());

                // Convert JSON value to SQL value
                let sql_value = json_to_sql_value(value, &mapping.target_type);
                values.push(sql_value);
            }
        }

        if columns.is_empty() {
            continue;
        }

        let insert_sql = format!(
            "INSERT INTO `{}`.`{}` ({}) VALUES ({})",
            escape_mysql_ident(database),
            escape_mysql_ident(table_name),
            columns.join(", "),
            placeholders.join(", ")
        );

        let mut query = sqlx::query(&insert_sql);
        for value in &values {
            query = bind_sql_value(query, value);
        }

        query
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to insert row {}: {}", row_idx, e))?;

        imported_rows += 1;
    }

    Ok(imported_rows)
}

/// Import CSV data into a table
pub async fn import_csv_data(
    pool: &MySqlPool,
    database: &str,
    table_name: &str,
    headers: &[String],
    rows: &[Vec<String>],
    column_mappings: &[ColumnMapping],
) -> Result<u64, String> {
    let mut imported_rows = 0u64;

    // Create column name to mapping lookup
    let mut column_lookup = std::collections::HashMap::new();
    for (i, header) in headers.iter().enumerate() {
        if let Some(mapping) = column_mappings.iter().find(|m| m.source_column == *header) {
            column_lookup.insert(i, mapping);
        }
    }

    for (row_idx, row) in rows.iter().enumerate() {
        let mut columns = Vec::new();
        let mut placeholders = Vec::new();
        let mut values = Vec::new();

        for (col_idx, value) in row.iter().enumerate() {
            if let Some(mapping) = column_lookup.get(&col_idx) {
                columns.push(format!("`{}`", escape_mysql_ident(&mapping.target_column)));
                placeholders.push("?".to_string());

                // Convert string value to SQL value based on target type
                let sql_value = string_to_sql_value(value, &mapping.target_type);
                values.push(sql_value);
            }
        }

        if columns.is_empty() {
            continue;
        }

        let insert_sql = format!(
            "INSERT INTO `{}`.`{}` ({}) VALUES ({})",
            escape_mysql_ident(database),
            escape_mysql_ident(table_name),
            columns.join(", "),
            placeholders.join(", ")
        );

        let mut query = sqlx::query(&insert_sql);
        for value in &values {
            query = bind_sql_value(query, value);
        }

        query
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to insert row {}: {}", row_idx, e))?;

        imported_rows += 1;
    }

    Ok(imported_rows)
}

/// Convert JSON value to SQL value string
fn json_to_sql_value(value: &serde_json::Value, target_type: &str) -> String {
    let type_lower = target_type.to_lowercase();

    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => {
            if type_lower.contains("int") || type_lower.contains("bool") {
                if *b { "1" } else { "0" }.to_string()
            } else {
                format!("'{}'", if *b { "true" } else { "false" })
            }
        }
        serde_json::Value::Number(n) => {
            if type_lower.contains("text")
                || type_lower.contains("char")
                || type_lower.contains("blob")
            {
                format!("'{}'", escape_mysql_value(&n.to_string()))
            } else {
                n.to_string()
            }
        }
        serde_json::Value::String(s) => {
            if type_lower.contains("int")
                || type_lower.contains("float")
                || type_lower.contains("double")
                || type_lower.contains("decimal")
            {
                s.parse::<f64>()
                    .map_or("NULL".to_string(), |n| n.to_string())
            } else if type_lower == "json" {
                // Validate JSON
                if serde_json::from_str::<serde_json::Value>(s).is_ok() {
                    format!("'{}'", escape_mysql_value(s))
                } else {
                    "NULL".to_string()
                }
            } else {
                format!("'{}'", escape_mysql_value(s))
            }
        }
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            if type_lower == "json" {
                format!("'{}'", escape_mysql_value(&value.to_string()))
            } else {
                "NULL".to_string()
            }
        }
    }
}

/// Convert string value to SQL value
fn string_to_sql_value(value: &str, target_type: &str) -> String {
    let type_lower = target_type.to_lowercase();

    if value.is_empty() {
        return "NULL".to_string();
    }

    if type_lower.contains("int") {
        value
            .parse::<i64>()
            .map_or("NULL".to_string(), |n| n.to_string())
    } else if type_lower.contains("float")
        || type_lower.contains("double")
        || type_lower.contains("decimal")
    {
        value
            .parse::<f64>()
            .map_or("NULL".to_string(), |n| n.to_string())
    } else if type_lower == "bool" || type_lower.contains("tinyint(1)") {
        if value == "true" || value == "1" {
            "1".to_string()
        } else {
            "0".to_string()
        }
    } else if type_lower == "json" {
        if serde_json::from_str::<serde_json::Value>(value).is_ok() {
            format!("'{}'", escape_mysql_value(value))
        } else {
            "NULL".to_string()
        }
    } else {
        format!("'{}'", escape_mysql_value(value))
    }
}

/// Bind SQL value to query
fn bind_sql_value<'a>(
    mut query: sqlx::query::Query<'a, sqlx::MySql, sqlx::mysql::MySqlArguments>,
    value: &str,
) -> sqlx::query::Query<'a, sqlx::MySql, sqlx::mysql::MySqlArguments> {
    if value == "NULL" {
        query = query.bind(Option::<String>::None);
    } else if value.starts_with('\'') && value.ends_with('\'') {
        // String value
        let s = &value[1..value.len() - 1];
        query = query.bind(s.to_string());
    } else {
        // Try as number
        if let Ok(n) = value.parse::<i64>() {
            query = query.bind(n);
        } else if let Ok(n) = value.parse::<f64>() {
            query = query.bind(n);
        } else {
            query = query.bind(value.to_string());
        }
    }
    query
}

/// Escape MySQL value for SQL statements
fn escape_mysql_value(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 2);
    for c in s.chars() {
        match c {
            '\'' => result.push_str("\\'"),
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\0' => result.push_str("\\0"),
            c => result.push(c),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn create_temp_json(content: &str) -> NamedTempFile {
        let mut f = NamedTempFile::new().unwrap();
        write!(f, "{}", content).unwrap();
        f
    }

    fn create_temp_csv(content: &str) -> NamedTempFile {
        let mut f = NamedTempFile::new().unwrap();
        write!(f, "{}", content).unwrap();
        f
    }

    #[test]
    fn test_parse_json_array() {
        let json = r#"[{"id":1,"name":"test"},{"id":2,"name":"test2"}]"#;
        let f = create_temp_json(json);
        let result = parse_json_file(f.path());
        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(data.as_array().is_some());
        assert_eq!(data.as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_parse_json_object() {
        let json = r#"{"users":[{"id":1,"name":"test"}]}"#;
        let f = create_temp_json(json);
        let result = parse_json_file(f.path());
        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(data.as_object().is_some());
    }

    #[test]
    fn test_parse_invalid_json() {
        let json = r#"{invalid json"#;
        let f = create_temp_json(json);
        let result = parse_json_file(f.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_csv_basic() {
        let csv = "id,name,email\n1,test,test@example.com\n2,test2,test2@example.com\n";
        let f = create_temp_csv(csv);
        let result = parse_csv_file(f.path());
        assert!(result.is_ok());
        let (headers, rows) = result.unwrap();
        assert_eq!(headers.len(), 3);
        assert_eq!(headers[0], "id");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].len(), 3);
        assert_eq!(rows[0][1], "test");
    }

    #[test]
    fn test_parse_csv_with_quotes() {
        let csv = "name,description\n\"Zhang San\",\"Hello, World\"\n\"Li Si\",\"Test \\\"quote\\\"\"\n";
        let f = create_temp_csv(csv);
        let result = parse_csv_file(f.path());
        assert!(result.is_ok());
        let (_headers, rows) = result.unwrap();
        assert_eq!(rows.len(), 2);
        // First row: name with comma in description
        assert_eq!(rows[0][0], "Zhang San");
        assert_eq!(rows[0][1], "Hello, World");
    }

    #[test]
    fn test_map_type_integer() {
        assert_eq!(map_type_to_mysql("int", None), "INT");
        assert_eq!(map_type_to_mysql("integer", None), "INT");
        assert_eq!(map_type_to_mysql("bigint", None), "BIGINT");
    }

    #[test]
    fn test_map_type_infer_from_value() {
        assert_eq!(map_type_to_mysql("", Some("42")), "TINYINT");
        assert_eq!(map_type_to_mysql("", Some("30000")), "SMALLINT");
        assert_eq!(map_type_to_mysql("", Some("1000000")), "INT");
        assert_eq!(map_type_to_mysql("", Some("3.14")), "DOUBLE");
        assert_eq!(map_type_to_mysql("", Some("2026-01-15")), "DATE");
        assert_eq!(map_type_to_mysql("", Some("2026-01-15 10:30:00")), "DATETIME");
        assert_eq!(map_type_to_mysql("", Some("{\"key\": \"val\"}")), "JSON");
    }

    #[test]
    fn test_escape_mysql_value() {
        assert_eq!(escape_mysql_value("hello"), "hello");
        assert_eq!(escape_mysql_value("it's"), "it\\'s");
        assert_eq!(escape_mysql_value("line1\nline2"), "line1\\nline2");
        assert_eq!(escape_mysql_value(""), "");
    }
}

/// Main import function
pub async fn import_database(
    pool: &MySqlPool,
    options: &ImportOptions,
) -> Result<ImportResult, String> {
    let mut total_rows = 0u64;
    let mut imported_tables = 0u64;
    let mut errors = Vec::new();

    let file_path = Path::new(&options.file_path);

    match options.format {
        ImportFormat::Json => {
            // Parse JSON file
            let json_data = parse_json_file(file_path)?;

            // For JSON, we expect either a single array or an object with table names as keys
            if let Some(_array) = json_data.as_array() {
                // Single table import - use first table mapping
                if let Some(mapping) = options.table_mapping.first() {
                    // Create table
                    let create_result = create_table_from_mappings(
                        pool,
                        &options.database,
                        &mapping.target_table,
                        &mapping.column_mappings,
                        &options.on_conflict,
                    )
                    .await;

                    if let Err(e) = create_result {
                        errors.push(ImportError {
                            table: mapping.target_table.clone(),
                            row: None,
                            message: e,
                        });
                    } else {
                        // Import data
                        match import_json_data(
                            pool,
                            &options.database,
                            &mapping.target_table,
                            &mapping.column_mappings,
                            json_data,
                        )
                        .await
                        {
                            Ok(rows) => {
                                total_rows += rows;
                                imported_tables += 1;
                            }
                            Err(e) => {
                                errors.push(ImportError {
                                    table: mapping.target_table.clone(),
                                    row: None,
                                    message: e,
                                });
                            }
                        }
                    }
                }
            } else if let Some(obj) = json_data.as_object() {
                // Multi-table import
                for mapping in &options.table_mapping {
                    if let Some(table_data) = obj.get(&mapping.source_table) {
                        // Create table
                        let create_result = create_table_from_mappings(
                            pool,
                            &options.database,
                            &mapping.target_table,
                            &mapping.column_mappings,
                            &options.on_conflict,
                        )
                        .await;

                        if let Err(e) = create_result {
                            errors.push(ImportError {
                                table: mapping.target_table.clone(),
                                row: None,
                                message: e,
                            });
                            continue;
                        }

                        // Import data
                        match import_json_data(
                            pool,
                            &options.database,
                            &mapping.target_table,
                            &mapping.column_mappings,
                            table_data.clone(),
                        )
                        .await
                        {
                            Ok(rows) => {
                                total_rows += rows;
                                imported_tables += 1;
                            }
                            Err(e) => {
                                errors.push(ImportError {
                                    table: mapping.target_table.clone(),
                                    row: None,
                                    message: e,
                                });
                            }
                        }
                    }
                }
            }
        }

        ImportFormat::Csv => {
            // Parse CSV file
            let (headers, rows) = parse_csv_file(file_path)?;

            // Use first table mapping for CSV
            if let Some(mapping) = options.table_mapping.first() {
                // Create table
                let create_result = create_table_from_mappings(
                    pool,
                    &options.database,
                    &mapping.target_table,
                    &mapping.column_mappings,
                    &options.on_conflict,
                )
                .await;

                if let Err(e) = create_result {
                    errors.push(ImportError {
                        table: mapping.target_table.clone(),
                        row: None,
                        message: e.clone(),
                    });
                    return Ok(ImportResult {
                        success: false,
                        message: format!("Failed to create table: {}", e),
                        imported_rows: 0,
                        imported_tables: 0,
                        errors,
                    });
                }

                // Import data
                match import_csv_data(
                    pool,
                    &options.database,
                    &mapping.target_table,
                    &headers,
                    &rows,
                    &mapping.column_mappings,
                )
                .await
                {
                    Ok(rows_count) => {
                        total_rows = rows_count;
                        imported_tables = 1;
                    }
                    Err(e) => {
                        errors.push(ImportError {
                            table: mapping.target_table.clone(),
                            row: None,
                            message: e,
                        });
                    }
                }
            }
        }

        ImportFormat::Sql => {
            // For SQL format, we execute the SQL file directly
            let file =
                File::open(file_path).map_err(|e| format!("Failed to open SQL file: {}", e))?;

            let reader = BufReader::new(file);
            let mut sql_content = String::new();

            for line in reader.lines() {
                let line = line.map_err(|e| format!("Failed to read SQL file: {}", e))?;
                sql_content.push_str(&line);
                sql_content.push('\n');
            }

            // Split by semicolons and execute each statement
            let statements: Vec<&str> = sql_content
                .split(';')
                .filter(|s| !s.trim().is_empty())
                .collect();

            for statement in statements {
                if statement.trim().is_empty() {
                    continue;
                }

                // Replace database name placeholder if needed
                let statement = statement.replace("__DATABASE__", &options.database);

                if let Err(e) = pool.execute(&*statement).await {
                    errors.push(ImportError {
                        table: "unknown".to_string(),
                        row: None,
                        message: format!("SQL execution error: {}", e),
                    });
                } else {
                    imported_tables += 1;
                }
            }
        }
    }

    let success = errors.is_empty();
    let message = if success {
        format!(
            "Successfully imported {} tables with {} total rows",
            imported_tables, total_rows
        )
    } else {
        format!(
            "Import completed with errors: {} tables, {} rows imported",
            imported_tables, total_rows
        )
    };

    Ok(ImportResult {
        success,
        message,
        imported_rows: total_rows,
        imported_tables,
        errors,
    })
}
