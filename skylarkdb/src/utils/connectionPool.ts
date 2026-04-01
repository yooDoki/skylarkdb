/**
 * 数据库连接池管理器
 * 优化频繁连接/断开操作
 */

interface ConnectionPoolItem {
  id: string;
  connection: any; // 实际的数据库连接
  lastUsed: number;
  status: 'active' | 'idle' | 'closed';
}

interface ConnectionPoolOptions {
  maxConnections?: number;
  idleTimeout?: number; // 毫秒
  connectionTimeout?: number;
}

class DatabaseConnectionPool {
  private pool: Map<string, ConnectionPoolItem> = new Map();
  private options: Required<ConnectionPoolOptions>;
  private cleanupInterval: number | null = null;

  constructor(options: ConnectionPoolOptions = {}) {
    this.options = {
      maxConnections: options.maxConnections || 10,
      idleTimeout: options.idleTimeout || 5 * 60 * 1000, // 5分钟
      connectionTimeout: options.connectionTimeout || 30 * 1000, // 30秒
    };

    this.startCleanupInterval();
  }

  /**
   * 获取或创建连接
   */
  async getConnection(id: string, createConnection: () => Promise<any>): Promise<any> {
    const existing = this.pool.get(id);

    if (existing && existing.status === 'active') {
      // 更新最后使用时间
      existing.lastUsed = Date.now();
      return existing.connection;
    }

    if (existing && existing.status === 'idle') {
      // 重新激活空闲连接
      existing.status = 'active';
      existing.lastUsed = Date.now();
      return existing.connection;
    }

    // 检查连接数限制
    if (this.pool.size >= this.options.maxConnections) {
      this.evictOldestConnection();
    }

    // 创建新连接
    try {
      const connection = await Promise.race([
        createConnection(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), this.options.connectionTimeout)
        ),
      ]);

      this.pool.set(id, {
        id,
        connection,
        lastUsed: Date.now(),
        status: 'active',
      });

      return connection;
    } catch (error) {
      throw new Error(`Failed to create connection: ${error}`);
    }
  }

  /**
   * 释放连接（标记为空闲）
   */
  releaseConnection(id: string): void {
    const item = this.pool.get(id);
    if (item && item.status === 'active') {
      item.status = 'idle';
      item.lastUsed = Date.now();
    }
  }

  /**
   * 强制关闭连接
   */
  async closeConnection(id: string): Promise<void> {
    const item = this.pool.get(id);
    if (item) {
      try {
        if (typeof item.connection.close === 'function') {
          await item.connection.close();
        }
      } catch (error) {
        console.warn('Error closing connection:', error);
      } finally {
        item.status = 'closed';
        this.pool.delete(id);
      }
    }
  }

  /**
   * 清理空闲连接
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, item] of this.pool.entries()) {
      if (item.status === 'idle' && now - item.lastUsed > this.options.idleTimeout) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      await this.closeConnection(id);
    }
  }

  /**
   * 驱逐最老的连接
   */
  private evictOldestConnection(): void {
    let oldest: ConnectionPoolItem | null = null;
    let oldestId: string | null = null;

    for (const [id, item] of this.pool.entries()) {
      if (item.status === 'idle' && (!oldest || item.lastUsed < oldest.lastUsed)) {
        oldest = item;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.closeConnection(oldestId);
    }
  }

  /**
   * 启动定期清理
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections().catch(error => {
        console.error('Error during connection cleanup:', error);
      });
    }, this.options.idleTimeout / 2); // 每半个超时时间检查一次
  }

  /**
   * 获取池状态
   */
  getPoolStatus() {
    const stats = {
      total: this.pool.size,
      active: 0,
      idle: 0,
      closed: 0,
    };

    for (const item of this.pool.values()) {
      stats[item.status]++;
    }

    return stats;
  }

  /**
   * 销毁连接池
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const closePromises: Promise<void>[] = [];
    for (const id of this.pool.keys()) {
      closePromises.push(this.closeConnection(id));
    }

    await Promise.all(closePromises);
    this.pool.clear();
  }
}

// 全局连接池实例
export const connectionPool = new DatabaseConnectionPool({
  maxConnections: 15,
  idleTimeout: 10 * 60 * 1000, // 10分钟
  connectionTimeout: 30 * 1000, // 30秒
});

/**
 * 使用连接池的连接 Hook
 */
export const usePooledConnection = (connectionId: string | null) => {
  const [connection, setConnection] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getConnection = useCallback(
    async (createFn: () => Promise<any>) => {
      if (!connectionId) return null;

      setLoading(true);
      setError(null);

      try {
        const pooledConnection = await connectionPool.getConnection(connectionId, createFn);
        setConnection(pooledConnection);
        return pooledConnection;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [connectionId]
  );

  const releaseConnection = useCallback(() => {
    if (connectionId) {
      connectionPool.releaseConnection(connectionId);
    }
  }, [connectionId]);

  const closeConnection = useCallback(async () => {
    if (connectionId) {
      await connectionPool.closeConnection(connectionId);
      setConnection(null);
    }
  }, [connectionId]);

  return {
    connection,
    loading,
    error,
    getConnection,
    releaseConnection,
    closeConnection,
  };
};

// 导入 useState
import { useState, useCallback } from 'react';
