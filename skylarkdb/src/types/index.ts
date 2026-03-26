export interface DatabaseConnection {
  id: string;
  name: string;
  type: 'mysql' | 'redis';
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MySQLTable {
  name: string;
  engine: string;
  rows: number;
  size: string;
  created: string;
}

export interface MySQLColumn {
  name: string;
  fullType: string;
  type: string;
  nullable: boolean;
  default: string | null;
  extra: string;
  isUnsigned: boolean;
  isBlob: boolean;
  isEnum: boolean;
  isJson: boolean;
  isBit: boolean;
  isGeometry: boolean;
  enumValues: string[] | null;
  maxLength: string | null;
}

export interface QueryResult {
  columns: string[];
  rows: any[];
  executionTime: number;
  affectedRows?: number;
}

export interface MySQLRoutineParam {
  ordinal: number;
  name: string | null;
  mode: string | null;
  /** 后端 camelCase: dataType */
  dataType: string;
}

export interface MySQLRoutine {
  schema: string;
  name: string;
  routineType: string;
  dataType?: string | null;
  definitionPreview?: string | null;
  parameters: MySQLRoutineParam[];
}

export interface TableData {
  columns: string[];
  rows: any[];
  totalCount: number;
  executionTime: number;
  /** 非 SELECT（如 UPDATE/DELETE）时由后端返回 */
  affectedRows?: number;
}

export interface RedisKey {
  key: string;
  type: string;
  ttl: number;
  size: number;
}

export interface RedisInfo {
  version: string;
  mode: string;
  os: string;
  used_memory: string;
  connected_clients: number;
  total_keys: number;
}

export interface ConnectionResult {
  success: boolean;
  message: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  connection: DatabaseConnection | null;
  status: ConnectionStatus;
  error: string | null;
}

// Import/Export types
export type ExportFormat = 'Json' | 'Sql' | 'Csv';
export type ImportFormat = 'Json' | 'Sql' | 'Csv';
export type OnConflictStrategy = 'Skip' | 'Update' | 'Error';

export interface ExportOptions {
  connectionId: string;
  database: string;
  tables: string[];
  format: ExportFormat;
  includeStructure: boolean;
  includeData: boolean;
  outputPath: string;
}

export interface ExportResult {
  success: boolean;
  message: string;
  filePath: string;
  exportedRows: number;
  exportedTables: number;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string;
  targetType: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  defaultValue?: string;
}

export interface TableMapping {
  sourceTable: string;
  targetTable: string;
  columnMappings: ColumnMapping[];
}

export interface ImportOptions {
  connectionId: string;
  database: string;
  filePath: string;
  format: ImportFormat;
  tableMapping: TableMapping[];
  onConflict: OnConflictStrategy;
}

export interface ImportError {
  table: string;
  row?: number;
  message: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  importedRows: number;
  importedTables: number;
  errors: ImportError[];
}

export interface SakilaInitOptions {
  mysqlVersion: string;
  dockerContainerName: string;
  hostPort: number;
  containerPort: number;
  rootPassword: string;
  databaseName: string;
}

export interface SakilaInitResult {
  success: boolean;
  message: string;
  containerId?: string;
  connectionString?: string;
}
