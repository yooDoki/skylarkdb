import { invoke } from '@tauri-apps/api/core';
import { DatabaseConnection, ConnectionResult, QueryResult, TableData, RedisKey, RedisInfo } from '@/types';

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
    username: params.username || null,
    password: params.password || null,
    database: params.database || null,
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
    password: params.password || null,
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
  offset: number = 0
): Promise<TableData> {
  return invoke<TableData>('get_mysql_table_data', {
    connectionId,
    tableName,
    limit,
    offset,
  });
}

export async function getMySQLTables(connectionId: string): Promise<any[]> {
  return invoke<any[]>('get_mysql_tables', { connectionId });
}

export async function getMySQLColumns(connectionId: string, tableName: string): Promise<any[]> {
  return invoke<any[]>('get_mysql_columns', { connectionId, tableName });
}

export async function executeMySQLQuery(connectionId: string, query: string): Promise<QueryResult> {
  return invoke<QueryResult>('execute_mysql_query', { connectionId, query });
}

// Redis API functions
export async function getRedisKeys(connectionId: string, pattern: string): Promise<RedisKey[]> {
  return invoke<RedisKey[]>('get_redis_keys', { connectionId, pattern });
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