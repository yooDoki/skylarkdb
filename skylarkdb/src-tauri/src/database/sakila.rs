use crate::models::*;
use std::process::Command;

/// Sakila database schema - compatible with MySQL 5.6+/5.7+
/// This is a simplified version that avoids FULLTEXT and SPATIAL indexes for compatibility
const SAKILA_SCHEMA: &str = include_str!("../../sakila/sakila-schema.sql");

/// Sakila database sample data
const SAKILA_DATA: &str = include_str!("../../sakila/sakila-data.sql");

/// Initialize Sakila database using Docker
pub fn init_sakila_with_docker(options: &SakilaInitOptions) -> Result<SakilaInitResult, String> {
    // Check if Docker is installed
    let docker_check = Command::new("docker").arg("--version").output();

    if docker_check.is_err() {
        return Err("Docker is not installed or not in PATH".to_string());
    }

    // Stop and remove existing container if it exists
    let _ = Command::new("docker")
        .args(&["stop", &options.docker_container_name])
        .output();

    let _ = Command::new("docker")
        .args(&["rm", &options.docker_container_name])
        .output();

    // Determine MySQL Docker image based on version
    let mysql_image = match options.mysql_version.as_str() {
        "5.6" => "mysql:5.6",
        "5.7" => "mysql:5.7",
        "8.0" => "mysql:8.0",
        "8" => "mysql:8.0",
        _ => "mysql:5.7", // Default to 5.7 for best compatibility
    };

    // Run Docker container
    let run_output = Command::new("docker")
        .args(&[
            "run",
            "-d",
            "--name",
            &options.docker_container_name,
            "-e",
            &format!("MYSQL_ROOT_PASSWORD={}", options.root_password),
            "-e",
            &format!("MYSQL_DATABASE={}", options.database_name),
            "-p",
            &format!("{}:{}", options.host_port, options.container_port),
            mysql_image,
        ])
        .output();

    match run_output {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Failed to start Docker container: {}", stderr));
            }

            let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();

            // Wait for MySQL to be ready (poll for ~30 seconds)
            wait_for_mysql_ready(&options.docker_container_name)?;

            // Initialize Sakila database
            init_sakila_database(options)?;

            let connection_string = format!(
                "mysql://root:{}@localhost:{}/{}",
                options.root_password, options.host_port, options.database_name
            );

            Ok(SakilaInitResult {
                success: true,
                message: format!(
                    "Sakila database initialized successfully in container '{}'",
                    options.docker_container_name
                ),
                container_id: Some(container_id),
                connection_string: Some(connection_string),
            })
        }
        Err(e) => Err(format!("Failed to run Docker container: {}", e)),
    }
}

/// Wait for MySQL to be ready inside the Docker container
fn wait_for_mysql_ready(container_name: &str) -> Result<(), String> {
    use std::thread;
    use std::time::Duration;

    let max_attempts = 30;
    let delay = Duration::from_secs(1);

    for attempt in 0..max_attempts {
        // Check if MySQL is ready by executing a simple query
        let output = Command::new("docker")
            .args(&[
                "exec",
                container_name,
                "mysqladmin",
                "ping",
                "-uroot",
                &format!(
                    "-p{}",
                    std::env::var("MYSQL_ROOT_PASSWORD").unwrap_or_default()
                ),
            ])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                // Additional wait for schema initialization
                thread::sleep(Duration::from_secs(2));
                return Ok(());
            }
        }

        thread::sleep(delay);

        if attempt % 5 == 0 {
            eprintln!(
                "Waiting for MySQL to be ready... (attempt {}/{})",
                attempt + 1,
                max_attempts
            );
        }
    }

    Err("MySQL did not become ready within the timeout period".to_string())
}

/// Initialize Sakila database by running SQL scripts
fn init_sakila_database(options: &SakilaInitOptions) -> Result<(), String> {
    use std::fs::{self, File};
    use std::io::Write;

    // Create temporary directory for SQL files
    let temp_dir = std::env::temp_dir().join("skylarkdb_sakila");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp directory: {}", e))?;

    // Write schema SQL file
    let schema_path = temp_dir.join("sakila-schema.sql");
    let mut schema_file =
        File::create(&schema_path).map_err(|e| format!("Failed to create schema file: {}", e))?;
    schema_file
        .write_all(SAKILA_SCHEMA.as_bytes())
        .map_err(|e| format!("Failed to write schema: {}", e))?;

    // Write data SQL file
    let data_path = temp_dir.join("sakila-data.sql");
    let mut data_file =
        File::create(&data_path).map_err(|e| format!("Failed to create data file: {}", e))?;
    data_file
        .write_all(SAKILA_DATA.as_bytes())
        .map_err(|e| format!("Failed to write data: {}", e))?;

    // Copy SQL files to Docker container
    let copy_schema = Command::new("docker")
        .args(&[
            "cp",
            schema_path.to_str().unwrap(),
            &format!("{}:/tmp/", options.docker_container_name),
        ])
        .output();

    if let Err(e) = copy_schema {
        return Err(format!("Failed to copy schema to container: {}", e));
    }

    let copy_data = Command::new("docker")
        .args(&[
            "cp",
            data_path.to_str().unwrap(),
            &format!("{}:/tmp/", options.docker_container_name),
        ])
        .output();

    if let Err(e) = copy_data {
        return Err(format!("Failed to copy data to container: {}", e));
    }

    // Execute schema SQL
    let schema_output = Command::new("docker")
        .args(&[
            "exec",
            &options.docker_container_name,
            "mysql",
            "-uroot",
            &format!("-p{}", options.root_password),
            "-e",
            &format!("source /tmp/sakila-schema.sql"),
        ])
        .output();

    if let Ok(out) = schema_output {
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            eprintln!("Warning: Schema initialization had issues: {}", stderr);
            // Continue anyway, as some warnings are expected
        }
    }

    // Execute data SQL
    let data_output = Command::new("docker")
        .args(&[
            "exec",
            &options.docker_container_name,
            "mysql",
            "-uroot",
            &format!("-p{}", options.root_password),
            &options.database_name,
            "-e",
            &format!("source /tmp/sakila-data.sql"),
        ])
        .output();

    if let Ok(out) = data_output {
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            eprintln!("Warning: Data initialization had issues: {}", stderr);
        }
    }

    // Cleanup temp files
    let _ = fs::remove_dir_all(&temp_dir);

    Ok(())
}

/// Generate Docker Compose file for Sakila database
pub fn generate_docker_compose(options: &SakilaInitOptions) -> Result<String, String> {
    let mysql_image = match options.mysql_version.as_str() {
        "5.6" => "mysql:5.6",
        "5.7" => "mysql:5.7",
        "8.0" => "mysql:8.0",
        "8" => "mysql:8.0",
        _ => "mysql:5.7",
    };

    let compose = format!(
        r#"version: '3.8'

services:
  mysql:
    image: {}
    container_name: {}
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: {}
      MYSQL_DATABASE: {}
      MYSQL_INITDB_SKIP_TZINFO: "1"
    ports:
      - "{}:{}"
    volumes:
      - ./sakila-schema.sql:/docker-entrypoint-initdb.d/01-sakila-schema.sql
      - ./sakila-data.sql:/docker-entrypoint-initdb.d/02-sakila-data.sql
      - mysql_data:/var/lib/mysql
    command: >
      mysqld
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --innodb-flush-method=O_DIRECT
      --innodb-log-file-size=64M
      --max-connections=200

volumes:
  mysql_data:
"#,
        mysql_image,
        options.docker_container_name,
        options.root_password,
        options.database_name,
        options.host_port,
        options.container_port,
    );

    Ok(compose)
}

/// Generate Sakila schema SQL (MySQL 5.6+/5.7+ compatible)
/// This version removes FULLTEXT and SPATIAL indexes for better compatibility
pub fn generate_sakila_schema() -> String {
    // Simplified schema without FULLTEXT and SPATIAL indexes
    r#"-- Sakila Schema for MySQL 5.6+/5.7+
-- Compatible version without FULLTEXT and SPATIAL indexes

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- Drop existing database if exists
DROP DATABASE IF EXISTS `sakila`;
CREATE DATABASE `sakila` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sakila`;

-- Table structure for table `actor`
DROP TABLE IF EXISTS `actor`;
CREATE TABLE `actor` (
  `actor_id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(45) NOT NULL,
  `last_name` VARCHAR(45) NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`actor_id`),
  KEY `idx_actor_last_name` (`last_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `country`
DROP TABLE IF EXISTS `country`;
CREATE TABLE `country` (
  `country_id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `country` VARCHAR(50) NOT NULL,
  `last_update` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`country_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `city`
DROP TABLE IF EXISTS `city`;
CREATE TABLE `city` (
  `city_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `city` VARCHAR(50) NOT NULL,
  `country_id` SMALLINT UNSIGNED NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`city_id`),
  KEY `idx_fk_country_id` (`country_id`),
  CONSTRAINT `fk_city_country` FOREIGN KEY (`country_id`) REFERENCES `country` (`country_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `address`
DROP TABLE IF EXISTS `address`;
CREATE TABLE `address` (
  `address_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `address` VARCHAR(50) NOT NULL,
  `address2` VARCHAR(50) DEFAULT NULL,
  `district` VARCHAR(20) NOT NULL,
  `city_id` INT UNSIGNED NOT NULL,
  `postal_code` VARCHAR(10) DEFAULT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`address_id`),
  KEY `idx_fk_city_id` (`city_id`),
  CONSTRAINT `fk_address_city` FOREIGN KEY (`city_id`) REFERENCES `city` (`city_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `language`
DROP TABLE IF EXISTS `language`;
CREATE TABLE `language` (
  `language_id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` CHAR(20) NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`language_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `category`
DROP TABLE IF EXISTS `category`;
CREATE TABLE `category` (
  `category_id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(25) NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `customer`
DROP TABLE IF EXISTS `customer`;
CREATE TABLE `customer` (
  `customer_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `store_id` TINYINT UNSIGNED NOT NULL,
  `first_name` VARCHAR(45) NOT NULL,
  `last_name` VARCHAR(45) NOT NULL,
  `email` VARCHAR(50) DEFAULT NULL,
  `address_id` INT UNSIGNED NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `create_date` DATETIME NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`customer_id`),
  KEY `idx_fk_store_id` (`store_id`),
  KEY `idx_fk_address_id` (`address_id`),
  KEY `idx_last_name` (`last_name`),
  CONSTRAINT `fk_customer_address` FOREIGN KEY (`address_id`) REFERENCES `address` (`address_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `film`
DROP TABLE IF EXISTS `film`;
CREATE TABLE `film` (
  `film_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `release_year` YEAR DEFAULT NULL,
  `language_id` TINYINT UNSIGNED NOT NULL,
  `original_language_id` TINYINT UNSIGNED DEFAULT NULL,
  `rental_duration` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `rental_rate` DECIMAL(4,2) NOT NULL DEFAULT 4.99,
  `length` SMALLINT UNSIGNED DEFAULT NULL,
  `replacement_cost` DECIMAL(5,2) NOT NULL DEFAULT 19.99,
  `rating` ENUM('G','PG','PG-13','R','NC-17') DEFAULT 'G',
  `special_features` SET('Trailers','Commentaries','Deleted Scenes','Behind the Scenes') DEFAULT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`film_id`),
  KEY `idx_fk_language_id` (`language_id`),
  KEY `idx_fk_original_language_id` (`original_language_id`),
  CONSTRAINT `fk_film_language` FOREIGN KEY (`language_id`) REFERENCES `language` (`language_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_film_language_original` FOREIGN KEY (`original_language_id`) REFERENCES `language` (`language_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `film_actor`
DROP TABLE IF EXISTS `film_actor`;
CREATE TABLE `film_actor` (
  `actor_id` SMALLINT UNSIGNED NOT NULL,
  `film_id` INT UNSIGNED NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`actor_id`,`film_id`),
  KEY `idx_fk_film_id` (`film_id`),
  CONSTRAINT `fk_film_actor_actor` FOREIGN KEY (`actor_id`) REFERENCES `actor` (`actor_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_film_actor_film` FOREIGN KEY (`film_id`) REFERENCES `film` (`film_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `film_category`
DROP TABLE IF EXISTS `film_category`;
CREATE TABLE `film_category` (
  `film_id` INT UNSIGNED NOT NULL,
  `category_id` TINYINT UNSIGNED NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`film_id`,`category_id`),
  KEY `idx_fk_category_id` (`category_id`),
  CONSTRAINT `fk_film_category_film` FOREIGN KEY (`film_id`) REFERENCES `film` (`film_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_film_category_category` FOREIGN KEY (`category_id`) REFERENCES `category` (`category_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `inventory`
DROP TABLE IF EXISTS `inventory`;
CREATE TABLE `inventory` (
  `inventory_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `film_id` INT UNSIGNED NOT NULL,
  `store_id` TINYINT UNSIGNED NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`inventory_id`),
  KEY `idx_fk_film_id` (`film_id`),
  KEY `idx_store_id_film_id` (`store_id`,`film_id`),
  CONSTRAINT `fk_inventory_film` FOREIGN KEY (`film_id`) REFERENCES `film` (`film_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `staff`
DROP TABLE IF EXISTS `staff`;
CREATE TABLE `staff` (
  `staff_id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(45) NOT NULL,
  `last_name` VARCHAR(45) NOT NULL,
  `address_id` INT UNSIGNED NOT NULL,
  `picture` BLOB DEFAULT NULL,
  `email` VARCHAR(50) DEFAULT NULL,
  `store_id` TINYINT UNSIGNED NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `username` VARCHAR(16) NOT NULL,
  `password` VARCHAR(40) DEFAULT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`staff_id`),
  KEY `idx_fk_store_id` (`store_id`),
  KEY `idx_fk_address_id` (`address_id`),
  CONSTRAINT `fk_staff_address` FOREIGN KEY (`address_id`) REFERENCES `address` (`address_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `store`
DROP TABLE IF EXISTS `store`;
CREATE TABLE `store` (
  `store_id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `manager_staff_id` TINYINT UNSIGNED NOT NULL,
  `address_id` INT UNSIGNED NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`store_id`),
  KEY `idx_fk_manager_staff_id` (`manager_staff_id`),
  KEY `idx_fk_address_id` (`address_id`),
  CONSTRAINT `fk_store_staff` FOREIGN KEY (`manager_staff_id`) REFERENCES `staff` (`staff_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_store_address` FOREIGN KEY (`address_id`) REFERENCES `address` (`address_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add store_id to customer table (foreign key)
ALTER TABLE `customer`
  ADD CONSTRAINT `fk_customer_store` FOREIGN KEY (`store_id`) REFERENCES `store` (`store_id`) ON UPDATE CASCADE;

-- Add store_id to staff table (foreign key)
ALTER TABLE `staff`
  ADD CONSTRAINT `fk_staff_store` FOREIGN KEY (`store_id`) REFERENCES `store` (`store_id`) ON UPDATE CASCADE;

-- Add store_id to inventory table (foreign key)
ALTER TABLE `inventory`
  ADD CONSTRAINT `fk_inventory_store` FOREIGN KEY (`store_id`) REFERENCES `store` (`store_id`) ON UPDATE CASCADE;

-- Table structure for table `payment`
DROP TABLE IF EXISTS `payment`;
CREATE TABLE `payment` (
  `payment_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `staff_id` TINYINT UNSIGNED NOT NULL,
  `rental_id` INT DEFAULT NULL,
  `amount` DECIMAL(5,2) NOT NULL,
  `payment_date` DATETIME NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  KEY `idx_fk_customer_id` (`customer_id`),
  KEY `idx_fk_staff_id` (`staff_id`),
  KEY `idx_fk_rental_id` (`rental_id`),
  CONSTRAINT `fk_payment_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`customer_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_staff` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`staff_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table structure for table `rental`
DROP TABLE IF EXISTS `rental`;
CREATE TABLE `rental` (
  `rental_id` INT NOT NULL AUTO_INCREMENT,
  `rental_date` DATETIME NOT NULL,
  `inventory_id` INT UNSIGNED NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  `return_date` DATETIME DEFAULT NULL,
  `staff_id` TINYINT UNSIGNED NOT NULL,
  `last_update` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`rental_id`),
  UNIQUE KEY `idx_rental_date` (`rental_date`,`inventory_id`,`customer_id`),
  KEY `idx_fk_inventory_id` (`inventory_id`),
  KEY `idx_fk_customer_id` (`customer_id`),
  KEY `idx_fk_staff_id` (`staff_id`),
  CONSTRAINT `fk_rental_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`inventory_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_rental_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`customer_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_rental_staff` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`staff_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add rental_id to payment table (foreign key)
ALTER TABLE `payment`
  ADD CONSTRAINT `fk_payment_rental` FOREIGN KEY (`rental_id`) REFERENCES `rental` (`rental_id`) ON UPDATE CASCADE;

-- Create views

-- Film list view
DROP VIEW IF EXISTS `film_list`;
CREATE VIEW `film_list` AS
SELECT 
    f.film_id AS ID,
    f.title AS title,
    c.name AS category,
    f.rental_rate AS price,
    f.length AS length,
    f.rating AS rating,
    GROUP_CONCAT(CONCAT(a.first_name, ' ', a.last_name) SEPARATOR ', ') AS actors
FROM film f
LEFT JOIN film_category fc ON f.film_id = fc.film_id
LEFT JOIN category c ON fc.category_id = c.category_id
LEFT JOIN film_actor fa ON f.film_id = fa.film_id
LEFT JOIN actor a ON fa.actor_id = a.actor_id
GROUP BY f.film_id, f.title, c.name, f.rental_rate, f.length, f.rating;

-- Actor info view
DROP VIEW IF EXISTS `actor_info`;
CREATE VIEW `actor_info` AS
SELECT 
    a.actor_id AS actor_id,
    a.first_name AS first_name,
    a.last_name AS last_name,
    GROUP_CONCAT(DISTINCT CONCAT(c.name, ': ', 
        (SELECT GROUP_CONCAT(f.title ORDER BY f.title SEPARATOR ', ')
         FROM film f, film_category fc, film_actor fa
         WHERE f.film_id = fc.film_id AND fc.film_id = fa.film_id AND fa.actor_id = a.actor_id AND fc.category_id = c.category_id)
    ) ORDER BY c.name SEPARATOR '; ') AS film_info
FROM actor a
LEFT JOIN film_actor fa ON a.actor_id = fa.actor_id
LEFT JOIN film_category fc ON fa.film_id = fc.film_id
LEFT JOIN category c ON fc.category_id = c.category_id
GROUP BY a.actor_id, a.first_name, a.last_name;

SET FOREIGN_KEY_CHECKS=1;
"#.to_string()
}

/// Generate sample Sakila data
pub fn generate_sakila_data() -> String {
    r#"-- Sakila Sample Data for MySQL 5.6+/5.7+

USE `sakila`;

-- Insert countries
INSERT INTO `country` (`country_id`, `country`, `last_update`) VALUES
(1, 'Afghanistan', NOW()),
(2, 'Algeria', NOW()),
(3, 'American Samoa', NOW()),
(4, 'Angola', NOW()),
(5, 'Anguilla', NOW()),
(6, 'Argentina', NOW()),
(7, 'Armenia', NOW()),
(8, 'Australia', NOW()),
(9, 'Austria', NOW()),
(10, 'Azerbaijan', NOW()),
(11, 'Bahrain', NOW()),
(12, 'Bangladesh', NOW()),
(13, 'Belarus', NOW()),
(14, 'Belgium', NOW()),
(15, 'Belize', NOW()),
(16, 'Benin', NOW()),
(17, 'Bermuda', NOW()),
(18, 'Bolivia', NOW()),
(19, 'Botswana', NOW()),
(20, 'Brazil', NOW()),
(21, 'Brunei', NOW()),
(22, 'Bulgaria', NOW()),
(23, 'Burkina Faso', NOW()),
(24, 'Burundi', NOW()),
(25, 'Cambodia', NOW()),
(26, 'Cameroon', NOW()),
(27, 'Canada', NOW()),
(28, 'Cape Verde', NOW()),
(29, 'Cayman Islands', NOW()),
(30, 'Central African Republic', NOW()),
(31, 'Chad', NOW()),
(32, 'Chile', NOW()),
(33, 'China', NOW()),
(34, 'Colombia', NOW()),
(35, 'Comoros', NOW()),
(36, 'Congo', NOW()),
(37, 'Costa Rica', NOW()),
(38, 'Croatia', NOW()),
(39, 'Cuba', NOW()),
(40, 'Cyprus', NOW()),
(41, 'Czech Republic', NOW()),
(42, 'Denmark', NOW()),
(43, 'Djibouti', NOW()),
(44, 'Dominican Republic', NOW()),
(45, 'Ecuador', NOW()),
(46, 'Egypt', NOW()),
(47, 'El Salvador', NOW()),
(48, 'Equatorial Guinea', NOW()),
(49, 'Eritrea', NOW()),
(50, 'Estonia', NOW()),
(51, 'Ethiopia', NOW()),
(52, 'Falkland Islands', NOW()),
(53, 'Faroe Islands', NOW()),
(54, 'Fiji', NOW()),
(55, 'Finland', NOW()),
(56, 'France', NOW()),
(57, 'French Guiana', NOW()),
(58, 'French Polynesia', NOW()),
(59, 'Gabon', NOW()),
(60, 'Gambia', NOW()),
(61, 'Georgia', NOW()),
(62, 'Germany', NOW()),
(63, 'Ghana', NOW()),
(64, 'Gibraltar', NOW()),
(65, 'Greece', NOW()),
(66, 'Greenland', NOW()),
(67, 'Guatemala', NOW()),
(68, 'Guinea', NOW()),
(69, 'Guinea-Bissau', NOW()),
(70, 'Guyana', NOW()),
(71, 'Haiti', NOW()),
(72, 'Honduras', NOW()),
(73, 'Hong Kong', NOW()),
(74, 'Hungary', NOW()),
(75, 'Iceland', NOW()),
(76, 'India', NOW()),
(77, 'Indonesia', NOW()),
(78, 'Iran', NOW()),
(79, 'Iraq', NOW()),
(80, 'Ireland', NOW()),
(81, 'Israel', NOW()),
(82, 'Italy', NOW()),
(83, 'Jamaica', NOW()),
(84, 'Japan', NOW()),
(85, 'Jordan', NOW()),
(86, 'Kazakhstan', NOW()),
(87, 'Kenya', NOW()),
(88, 'Kuwait', NOW()),
(89, 'Kyrgyzstan', NOW()),
(90, 'Laos', NOW()),
(91, 'Latvia', NOW()),
(92, 'Lebanon', NOW()),
(93, 'Lesotho', NOW()),
(94, 'Liberia', NOW()),
(95, 'Libya', NOW()),
(96, 'Liechtenstein', NOW()),
(97, 'Lithuania', NOW()),
(98, 'Luxembourg', NOW()),
(99, 'Macau', NOW()),
(100, 'Madagascar', NOW()),
(101, 'Malawi', NOW()),
(102, 'Malaysia', NOW()),
(103, 'Maldives', NOW()),
(104, 'Mali', NOW()),
(105, 'Malta', NOW()),
(106, 'Marshall Islands', NOW()),
(107, 'Mauritania', NOW()),
(108, 'Mauritius', NOW()),
(109, 'Mexico', NOW()),
(110, 'Micronesia', NOW()),
(111, 'Moldova', NOW()),
(112, 'Monaco', NOW()),
(113, 'Mongolia', NOW()),
(114, 'Montenegro', NOW()),
(115, 'Morocco', NOW()),
(116, 'Mozambique', NOW()),
(117, 'Myanmar', NOW()),
(118, 'Namibia', NOW()),
(119, 'Nauru', NOW()),
(120, 'Nepal', NOW()),
(121, 'Netherlands', NOW()),
(122, 'New Caledonia', NOW()),
(123, 'New Zealand', NOW()),
(124, 'Nicaragua', NOW()),
(125, 'Niger', NOW()),
(126, 'Nigeria', NOW()),
(127, 'North Korea', NOW()),
(128, 'Norway', NOW()),
(129, 'Oman', NOW()),
(130, 'Pakistan', NOW()),
(131, 'Palau', NOW()),
(132, 'Palestine', NOW()),
(133, 'Panama', NOW()),
(134, 'Papua New Guinea', NOW()),
(135, 'Paraguay', NOW()),
(136, 'Peru', NOW()),
(137, 'Philippines', NOW()),
(138, 'Poland', NOW()),
(139, 'Portugal', NOW()),
(140, 'Puerto Rico', NOW()),
(141, 'Qatar', NOW()),
(142, 'Romania', NOW()),
(143, 'Russia', NOW()),
(144, 'Rwanda', NOW()),
(145, 'Saint Kitts and Nevis', NOW()),
(146, 'Saint Lucia', NOW()),
(147, 'Saint Vincent and the Grenadines', NOW()),
(148, 'Samoa', NOW()),
(149, 'San Marino', NOW()),
(150, 'Sao Tome and Principe', NOW()),
(151, 'Saudi Arabia', NOW()),
(152, 'Senegal', NOW()),
(153, 'Serbia', NOW()),
(154, 'Seychelles', NOW()),
(155, 'Sierra Leone', NOW()),
(156, 'Singapore', NOW()),
(157, 'Slovakia', NOW()),
(158, 'Slovenia', NOW()),
(159, 'Solomon Islands', NOW()),
(160, 'Somalia', NOW()),
(161, 'South Africa', NOW()),
(162, 'South Korea', NOW()),
(163, 'Spain', NOW()),
(164, 'Sri Lanka', NOW()),
(165, 'Sudan', NOW()),
(166, 'Suriname', NOW()),
(167, 'Swaziland', NOW()),
(168, 'Sweden', NOW()),
(169, 'Switzerland', NOW()),
(170, 'Syria', NOW()),
(171, 'Taiwan', NOW()),
(172, 'Tajikistan', NOW()),
(173, 'Tanzania', NOW()),
(174, 'Thailand', NOW()),
(175, 'Togo', NOW()),
(176, 'Tonga', NOW()),
(177, 'Trinidad and Tobago', NOW()),
(178, 'Tunisia', NOW()),
(179, 'Turkey', NOW()),
(180, 'Turkmenistan', NOW()),
(181, 'Uganda', NOW()),
(182, 'Ukraine', NOW()),
(183, 'United Arab Emirates', NOW()),
(184, 'United Kingdom', NOW()),
(185, 'United States', NOW()),
(186, 'Uruguay', NOW()),
(187, 'Uzbekistan', NOW()),
(188, 'Vanuatu', NOW()),
(189, 'Vatican City', NOW()),
(190, 'Venezuela', NOW()),
(191, 'Vietnam', NOW()),
(192, 'Wallis and Futuna', NOW()),
(193, 'Yemen', NOW()),
(194, 'Zambia', NOW()),
(195, 'Zimbabwe', NOW());

-- Insert languages
INSERT INTO `language` (`language_id`, `name`, `last_update`) VALUES
(1, 'English', NOW()),
(2, 'Italian', NOW()),
(3, 'Japanese', NOW()),
(4, 'Mandarin', NOW()),
(5, 'French', NOW()),
(6, 'German', NOW());

-- Insert categories
INSERT INTO `category` (`category_id`, `name`, `last_update`) VALUES
(1, 'Action', NOW()),
(2, 'Animation', NOW()),
(3, 'Children', NOW()),
(4, 'Classics', NOW()),
(5, 'Comedy', NOW()),
(6, 'Documentary', NOW()),
(7, 'Drama', NOW()),
(8, 'Family', NOW()),
(9, 'Foreign', NOW()),
(10, 'Games', NOW()),
(11, 'Horror', NOW()),
(12, 'Music', NOW()),
(13, 'New', NOW()),
(14, 'Sci-Fi', NOW()),
(15, 'Sports', NOW()),
(16, 'Thriller', NOW()),
(17, 'Travel', NOW());

-- Insert actors (sample)
INSERT INTO `actor` (`actor_id`, `first_name`, `last_name`, `last_update`) VALUES
(1, 'PENELOPE', 'GUINESS', NOW()),
(2, 'NICK', 'WAHLBERG', NOW()),
(3, 'ED', 'CHASE', NOW()),
(4, 'JENNIFER', 'DAVIS', NOW()),
(5, 'JOHNNY', 'LOLLOBRIGIDA', NOW()),
(6, 'BETTE', 'NICHOLSON', NOW()),
(7, 'GRACE', 'MOSTEL', NOW()),
(8, 'MATTHEW', 'JOHANSSON', NOW()),
(9, 'JOE', 'SWANK', NOW()),
(10, 'CHRISTIAN', 'GABLE', NOW());

-- Insert films (sample)
INSERT INTO `film` (`film_id`, `title`, `description`, `release_year`, `language_id`, `rental_duration`, `rental_rate`, `length`, `replacement_cost`, `rating`, `special_features`, `last_update`) VALUES
(1, 'ACADEMY DINOSAUR', 'A Epic Drama of a Feminist And a Mad Scientist who must Battle a Teacher in The Canadian Rockies', 2006, 1, 6, 0.99, 86, 20.99, 'PG', 'Deleted Scenes,Behind the Scenes', NOW()),
(2, 'ACE GOLDFINGER', 'A Astounding Epistle of a Database Administrator And a Explorer who must Find a Car in Ancient China', 2006, 1, 3, 4.99, 48, 12.99, 'G', 'Trailers,Deleted Scenes', NOW()),
(3, 'ADAPTATION HOLES', 'A Astounding Reflection of a Lumberjack And a Car who must Reach a Feminist in Old India', 2006, 1, 7, 2.99, 50, 18.99, 'NC-17', 'Trailers,Deleted Scenes', NOW()),
(4, 'AFFAIR PREJUDICE', 'A Fanciful Documentary of a Frisbee And a Lumberjack who must Chase a Monkey in A Shark Tank', 2006, 1, 5, 2.99, 117, 26.99, 'G', 'Commentaries,Behind the Scenes', NOW()),
(5, 'AFRICAN EGG', 'A Fast-Paced Documentary of a Pastry Chef And a Dentist who must Pursue a Forensic Psychologist in The Gulf of Mexico', 2006, 1, 6, 2.99, 130, 20.99, 'G', 'Commentaries,Behind the Scenes', NOW());

-- Insert film_category associations
INSERT INTO `film_category` (`film_id`, `category_id`, `last_update`) VALUES
(1, 6, NOW()),
(2, 11, NOW()),
(3, 7, NOW()),
(4, 7, NOW()),
(5, 7, NOW());

-- Insert film_actor associations
INSERT INTO `film_actor` (`actor_id`, `film_id`, `last_update`) VALUES
(1, 1, NOW()),
(2, 1, NOW()),
(3, 2, NOW()),
(4, 3, NOW()),
(5, 4, NOW());

-- Insert stores
INSERT INTO `store` (`store_id`, `manager_staff_id`, `address_id`, `last_update`) VALUES
(1, 1, 1, NOW()),
(2, 2, 2, NOW());

-- Insert staff
INSERT INTO `staff` (`staff_id`, `first_name`, `last_name`, `address_id`, `email`, `store_id`, `active`, `username`, `password`, `last_update`) VALUES
(1, 'Mike', 'Hillyer', 1, 'Mike.Hillyer@sakilastaff.com', 1, 1, 'Mike', '8cb2237d0679ca88db6464eac60da96345513964', NOW()),
(2, 'Jon', 'Stephens', 2, 'Jon.Stephens@sakilastaff.com', 2, 1, 'Jon', '8cb2237d0679ca88db6464eac60da96345513964', NOW());
"#.to_string()
}
