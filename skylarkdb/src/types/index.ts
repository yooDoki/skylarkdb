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
  type: string;
  nullable: boolean;
  default: string | null;
  extra: string;
}

export interface QueryResult {
  columns: string[];
  rows: any[];
  executionTime: number;
  affectedRows?: number;
}

export interface TableData {
  columns: string[];
  rows: any[];
  totalCount: number;
  executionTime: number;
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
