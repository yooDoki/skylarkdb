export type PasswordStorageStrategy = 'local' | 'system';

export interface DatabaseConnection {
  id: string;
  name: string;
  type: 'mysql' | 'redis';
  host: string;
  port: number;
  username?: string;
  password?: string;
  hasPassword?: boolean;
  passwordStorage?: PasswordStorageStrategy;
  database?: string;
  ssl?: boolean;
  readOnly?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MySQLTable {
  schema: string;
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
  isPrimaryKey: boolean;
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

export interface CreateTableColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue?: string;
  autoIncrement: boolean;
  isPrimaryKey: boolean;
}

export interface AddColumnOptions {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue?: string;
  autoIncrement: boolean;
  first?: boolean;
  afterColumn?: string;
}
