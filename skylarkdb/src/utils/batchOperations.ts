/**
 * MySQL 批量操作工具
 * 提供简化的批量删除功能
 */

export interface BatchOperations {
  selectedCount: number;
  toggleSelect: (key: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  isSelected: (key: string) => boolean;
  areAllSelected: (total: number) => boolean;
}

export const createBatchOperations = (
  selectedKeys: Set<string>,
  setSelectedKeys: (keys: Set<string>) => void
): BatchOperations => {
  return {
    get selectedCount() {
      return selectedKeys.size;
    },

    toggleSelect: (key: string) => {
      setSelectedKeys(
        new Set(
          selectedKeys.has(key) ? [...selectedKeys].filter(k => k !== key) : [...selectedKeys, key]
        )
      );
    },

    toggleSelectAll: () => {
      // 如果已全选则取消，否则全选逻辑由调用者实现
      setSelectedKeys(new Set());
    },

    clearSelection: () => {
      setSelectedKeys(new Set());
    },

    isSelected: (key: string) => selectedKeys.has(key),

    areAllSelected: (total: number) => total > 0 && selectedKeys.size === total,
  };
};

/**
 * 格式化批量操作确认消息
 */
export const formatBatchDeleteConfirm = (count: number): string => {
  return `确定要删除选中的 ${count} 条记录吗？\n\n⚠️ 警告：此操作不可恢复！`;
};

/**
 * 格式化批量操作成功消息
 */
export const formatBatchDeleteSuccess = (count: number): string => {
  return `成功删除 ${count} 条记录`;
};
