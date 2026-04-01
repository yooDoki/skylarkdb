/**
 * 连接列表性能优化工具
 */

import { useMemo } from 'react';
import { DatabaseConnection } from '@/types';
import { useBatchUpdates } from './performance';

/**
 * 记忆化连接过滤和搜索
 */
export const useOptimizedConnections = (
  connections: DatabaseConnection[],
  searchTerm: string,
  filter: 'all' | 'mysql' | 'redis'
) => {
  return useMemo(() => {
    let filtered = connections;

    // 按类型过滤
    if (filter !== 'all') {
      filtered = filtered.filter(conn => conn.type === filter);
    }

    // 搜索过滤
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        conn =>
          conn.name.toLowerCase().includes(term) ||
          conn.host.toLowerCase().includes(term) ||
          conn.database?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [connections, searchTerm, filter]);
};

/**
 * 批量连接操作
 */
export const useBatchConnectionOperations = () => {
  const batchUpdate = useBatchUpdates();

  const batchDelete = (connectionIds: string[], deleteFn: (id: string) => void) => {
    batchUpdate(() => {
      connectionIds.forEach(id => deleteFn(id));
    });
  };

  const batchUpdateConnections = (
    updates: Array<{ id: string; data: Partial<DatabaseConnection> }>,
    updateFn: (id: string, data: Partial<DatabaseConnection>) => void
  ) => {
    batchUpdate(() => {
      updates.forEach(({ id, data }) => updateFn(id, data));
    });
  };

  return {
    batchDelete,
    batchUpdateConnections,
  };
};
