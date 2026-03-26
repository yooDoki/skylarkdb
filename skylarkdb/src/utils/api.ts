import { invoke } from '@tauri-apps/api/core';
import {
  DatabaseConnection,
  ConnectionResult,
  QueryResult,
  TableData,
  RedisKey,
  RedisInfo,
  MySQLRoutine,
} from '@/types';

export async function testMySQLConnection(params: {
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
}): Promise<ConnectionResult> {
  return invoke<ConnectionResult>('test_mysql_connection', {
    host: params.host,
    port: params.port,
    username: params.username?.trim() === '' ? null : params.username || null,
    password: params.password?.trim() === '' ? null : params.password || null,
    database: params.database?.trim() === '' ? null : params.database || null,
    ssl: params.ssl || false,
  });
}

export async function testRedisConnection(params: {
  host: string;
  port: number;
  password?: string;
}): Promise<ConnectionResult> {
  return invoke<ConnectionResult>('test_redis_connection', {
    host: params.host,
    port: params.port,
    password: params.password?.trim() === '' ? null : params.password || null,
  });
}

export async function connectMySQL(connection: DatabaseConnection): Promise<ConnectionResult> {
  return invoke<ConnectionResult>('connect_mysql', { connection });
}

export async function connectRedis(connection: DatabaseConnection): Promise<ConnectionResult> {
  return invoke<ConnectionResult>('connect_redis', { connection });
}

export async function disconnectMySQL(connectionId: string): Promise<void> {
  return invoke<void>('disconnect_mysql', { connectionId });
}

export async function disconnectRedis(connectionId: string): Promise<void> {
  return invoke<void>('disconnect_redis', { connectionId });
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

export async function getMySQLTables(connectionId: string): Promise<any[]> {
  return invoke<any[]>('get_mysql_tables', { connectionId });
}

export async function getMySQLColumns(connectionId: string, tableName: string): Promise<any[]> {
  return invoke<any[]>('get_mysql_columns', { connectionId, tableName });
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
  primaryKey: string,
  primaryValue: any
): Promise<number> {
  return invoke<number>('update_mysql_record', { connectionId, tableName, data, primaryKey, primaryValue });
}

export async function deleteMySQLRecord(
  connectionId: string,
  tableName: string,
  primaryKey: string,
  primaryValue: any
): Promise<number> {
  return invoke<number>('delete_mysql_record', { connectionId, tableName, primaryKey, primaryValue });
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