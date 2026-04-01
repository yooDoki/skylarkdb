import { invoke } from '@tauri-apps/api/core';
import {
  DatabaseConnection,
  ConnectionResult,
  QueryResult,
  TableData,
  RedisKey,
  RedisInfo,
  MySQLColumn,
  MySQLRoutine,
  CreateTableColumn,
  AddColumnOptions,
} from '@/types';

export async function testMySQLConnection(params: {
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  connectionId?: string;
  useStoredSecret?: boolean;
}): Promise<ConnectionResult> {
  return invoke<ConnectionResult>('test_mysql_connection', {
    host: params.host,
    port: params.port,
    username: params.username?.trim() === '' ? null : params.username || null,
    password: params.password?.trim() === '' ? null : params.password || null,
    database: params.database?.trim() === '' ? null : params.database || null,
    ssl: params.ssl || false,
    connectionId: params.connectionId ?? null,
    useStoredSecret: params.useStoredSecret ?? false,
  });
}

export async function testRedisConnection(params: {
  host: string;
  port: number;
  password?: string;
  connectionId?: string;
  useStoredSecret?: boolean;
}): Promise<ConnectionResult> {
  return invoke<ConnectionResult>('test_redis_connection', {
    host: params.host,
    port: params.port,
    password: params.password?.trim() === '' ? null : params.password || null,
    connectionId: params.connectionId ?? null,
    useStoredSecret: params.useStoredSecret ?? false,
  });
}

export async function connectMySQL(connection: DatabaseConnection): Promise<ConnectionResult> {
  return invoke<ConnectionResult>('connect_mysql', { connection });
}

export async function connectRedis(connection: DatabaseConnection): Promise<ConnectionResult> {
  return invoke<ConnectionResult>('connect_redis', { connection });
}

export async function saveConnectionPassword(
  connectionId: string,
  password: string
): Promise<void> {
  return invoke<void>('save_connection_password', { connectionId, password });
}

export async function deleteConnectionPassword(connectionId: string): Promise<void> {
  return invoke<void>('delete_connection_password', { connectionId });
}

export async function disconnectMySQL(connectionId: string): Promise<void> {
  return invoke<void>('disconnect_mysql', { connectionId });
}

export async function disconnectRedis(connectionId: string): Promise<void> {
  return invoke<void>('disconnect_redis', { connectionId });
}

export async function getMySQLDatabases(connectionId: string): Promise<string[]> {
  return invoke<string[]>('get_mysql_databases', { connectionId });
}

export async function createMySQLDatabase(
  connectionId: string,
  databaseName: string,
  options?: { charset?: string | null; collation?: string | null }
): Promise<void> {
  const charset = options?.charset?.trim();
  const collation = options?.collation?.trim();
  return invoke<void>('create_mysql_database', {
    connectionId,
    databaseName,
    charset: charset && charset.length > 0 ? charset : null,
    collation: collation && collation.length > 0 ? collation : null,
  });
}

export async function getMySQLTableData(
  connectionId: string,
  tableName: string,
  limit: number = 100,
  offset: number = 0,
  options?: {
    orderBy?: string | null;
    orderDesc?: boolean;
    filterColumn?: string | null;
    filterOp?: string | null;
    filterValue?: string | null;
  }
): Promise<TableData> {
  return invoke<TableData>('get_mysql_table_data', {
    connectionId,
    tableName,
    limit,
    offset,
    orderBy: options?.orderBy ?? null,
    orderDesc: options?.orderDesc ?? null,
    filterColumn: options?.filterColumn ?? null,
    filterOp: options?.filterOp ?? null,
    filterValue: options?.filterValue ?? null,
  });
}

export async function getMySQLTables(connectionId: string, database?: string): Promise<any[]> {
  return invoke<any[]>('get_mysql_tables', { connectionId, database: database ?? null });
}

export async function getMySQLColumns(
  connectionId: string,
  tableName: string
): Promise<MySQLColumn[]> {
  return invoke<MySQLColumn[]>('get_mysql_columns', { connectionId, tableName });
}

export async function executeMySQLQuery(
  connectionId: string,
  query: string,
  params?: string[] | null
): Promise<QueryResult> {
  return invoke<QueryResult>('execute_mysql_query', {
    connectionId,
    query,
    params: params ?? null,
  });
}

export async function getMySQLRoutines(connectionId: string): Promise<MySQLRoutine[]> {
  return invoke<MySQLRoutine[]>('get_mysql_routines', { connectionId });
}

export async function insertMySQLRecord(
  connectionId: string,
  tableName: string,
  data: Record<string, any>
): Promise<number> {
  return invoke<number>('insert_mysql_record', { connectionId, tableName, data });
}

export async function updateMySQLRecord(
  connectionId: string,
  tableName: string,
  data: Record<string, any>,
  recordLocator: Record<string, any>
): Promise<number> {
  return invoke<number>('update_mysql_record', { connectionId, tableName, data, recordLocator });
}

export async function deleteMySQLRecord(
  connectionId: string,
  tableName: string,
  recordLocator: Record<string, any>
): Promise<number> {
  return invoke<number>('delete_mysql_record', { connectionId, tableName, recordLocator });
}

export async function createMySQLTable(
  connectionId: string,
  database: string,
  tableName: string,
  columns: CreateTableColumn[]
): Promise<void> {
  return invoke<void>('create_mysql_table', { connectionId, database, tableName, columns });
}

export async function dropMySQLTable(
  connectionId: string,
  database: string,
  tableName: string
): Promise<void> {
  return invoke<void>('drop_mysql_table', { connectionId, database, tableName });
}

export async function addMySQLColumn(
  connectionId: string,
  tableName: string,
  column: AddColumnOptions
): Promise<void> {
  return invoke<void>('add_mysql_column', { connectionId, tableName, column });
}

export async function dropMySQLColumn(
  connectionId: string,
  tableName: string,
  columnName: string
): Promise<void> {
  return invoke<void>('drop_mysql_column', { connectionId, tableName, columnName });
}

export async function setMySQLDefaultDatabase(
  connectionId: string,
  database: string
): Promise<void> {
  return invoke<void>('set_mysql_default_database', { connectionId, database });
}

// Redis API functions
export async function getRedisKeys(connectionId: string, pattern: string): Promise<RedisKey[]> {
  return invoke<RedisKey[]>('get_redis_keys', { connectionId, pattern });
}

export interface RedisDatabase {
  index: number;
  name: string;
  keyCount: number;
}

export async function getRedisDatabases(connectionId: string): Promise<RedisDatabase[]> {
  return invoke<RedisDatabase[]>('get_redis_databases', { connectionId });
}

export async function selectRedisDatabase(connectionId: string, dbIndex: number): Promise<void> {
  return invoke<void>('select_redis_database', { connectionId, dbIndex });
}

export async function getSelectedRedisDatabase(connectionId: string): Promise<number> {
  return invoke<number>('get_selected_redis_database', { connectionId });
}

export async function getRedisValue(connectionId: string, key: string): Promise<string> {
  return invoke<string>('get_redis_value', { connectionId, key });
}

export async function deleteRedisKey(connectionId: string, key: string): Promise<boolean> {
  return invoke<boolean>('delete_redis_key', { connectionId, key });
}

export async function getRedisInfo(connectionId: string): Promise<RedisInfo> {
  return invoke<RedisInfo>('get_redis_info', { connectionId });
}

export async function setRedisKey(
  connectionId: string,
  key: string,
  value: string,
  keyType: string,
  ttl?: number
): Promise<void> {
  return invoke<void>('set_redis_key', { connectionId, key, value, keyType, ttl });
}

export async function setRedisKeyTTL(
  connectionId: string,
  key: string,
  ttl: number
): Promise<void> {
  return invoke<void>('set_redis_key_ttl', { connectionId, key, ttl });
}

export async function renameRedisKey(
  connectionId: string,
  oldKey: string,
  newKey: string
): Promise<void> {
  return invoke<void>('rename_redis_key', { connectionId, oldKey, newKey });
}

export async function exportRedisKey(
  connectionId: string,
  key: string,
  format: 'json' | 'txt',
  outputPath: string
): Promise<ExportResult> {
  return invoke<ExportResult>('export_redis_key', { connectionId, key, format, outputPath });
}

export interface ExportResult {
  success: boolean;
  message: string;
  filePath: string;
  exportedRows: number;
  exportedTables: number;
}

export interface ImportOptions {
  connectionId: string;
  database: string;
  filePath: string;
  format: 'json' | 'sql' | 'csv';
  tableMapping: Array<{
    sourceTable: string;
    targetTable: string;
    columnMappings: Array<{
      sourceColumn: string;
      targetColumn: string;
    }>;
  }>;
  onConflict: 'ignore' | 'replace' | 'error';
}

export interface ImportResult {
  success: boolean;
  message: string;
  importedRows: number;
  importedTables: number;
}

export async function importMySQLData(options: ImportOptions): Promise<ImportResult> {
  return invoke<ImportResult>('import_mysql_data', { options });
}

export interface ImportRedisDataOptions {
  connectionId: string;
  filePath: string;
  format: 'json' | 'txt';
}

export async function importRedisData(options: ImportRedisDataOptions): Promise<ImportResult> {
  return invoke<ImportResult>('import_redis_data', { options });
}
