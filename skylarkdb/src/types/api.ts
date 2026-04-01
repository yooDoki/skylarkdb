/**
 * API 响应类型定义
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface DatabaseQuery {
  sql: string;
  params?: Record<string, unknown>;
  timeout?: number;
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  executionTime: number;
  fields?: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
}

export interface ConnectionResult {
  success: boolean;
  message?: string;
  connectionId?: string;
}

export interface RedisConnectionResult extends ConnectionResult {
  serverInfo?: {
    version: string;
    os: string;
    uptime: number;
    memory: {
      used: number;
      peak: number;
    };
  };
}

export interface MySQLConnectionResult extends ConnectionResult {
  databases?: string[];
  version?: string;
}

export interface UpdateInfo {
  version: string;
  body: string;
  date: string;
  downloadUrl: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateInfo?: UpdateInfo;
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  maxLength?: number;
}

export interface TableStructure {
  name: string;
  columns: TableColumn[];
  indexes: Array<{
    name: string;
    columns: string[];
    unique: boolean;
    primary: boolean;
  }>;
  foreignKeys: Array<{
    column: string;
    referencedTable: string;
    referencedColumn: string;
  }>;
}
