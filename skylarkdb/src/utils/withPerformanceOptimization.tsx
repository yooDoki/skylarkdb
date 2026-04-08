/**
 * 性能优化高阶组件
 * 提供 React.memo、useMemo、useCallback 的自动优化
 */

import React, { memo, useMemo } from 'react';
import { usePerformanceMonitor } from './performance';

interface PerformanceOptions {
  /** 是否启用性能监控 */
  enableMonitoring?: boolean;
  /** 是否启用深度比较 */
  enableDeepCompare?: boolean;
  /** 自定义比较函数 */
  compareProps?: (prevProps: any, nextProps: any) => boolean;
}

/**
 * 性能优化 HOC
 */
export const withPerformanceOptimization = <P extends object>(
  Component: React.ComponentType<P>,
  options: PerformanceOptions = {}
) => {
  const { enableMonitoring = false, enableDeepCompare = false, compareProps } = options;

  const WrappedComponent = (props: P) => {
    // 记忆化 props 处理
    const memoizedProps = useMemo(() => props, [JSON.stringify(props)]);

    // 性能监控
    // eslint-disable-next-line react-hooks/rules-of-hooks
    if (enableMonitoring) {
      usePerformanceMonitor(Component.displayName || Component.name || 'UnknownComponent');
    }

    return React.createElement(Component, memoizedProps);
  };

  // 自定义比较函数
  if (compareProps) {
    WrappedComponent.displayName = `withPerformanceOptimization(${Component.displayName || Component.name || 'Component'})`;
    return memo(WrappedComponent, compareProps);
  }

  // 深度比较
  if (enableDeepCompare) {
    WrappedComponent.displayName = `withDeepCompare(${Component.displayName || Component.name || 'Component'})`;
    return memo(WrappedComponent, (prevProps, nextProps) => {
      return deepEqual(prevProps, nextProps);
    });
  }

  // 默认浅比较
  WrappedComponent.displayName = `withMemo(${Component.displayName || Component.name || 'Component'})`;
  return memo(WrappedComponent);
};

/**
 * 深度比较函数
 */
const deepEqual = (a: any, b: any): boolean => {
  if (a === b) return true;

  if (a == null || b == null) return a === b;

  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
};

/**
 * 优化的连接列表项比较函数
 */
export const connectionItemCompare = (prevProps: any, nextProps: any) => {
  const { connection: prevConnection, isActive: prevActive } = prevProps;
  const { connection: nextConnection, isActive: nextActive } = nextProps;

  return (
    prevConnection.id === nextConnection.id &&
    prevConnection.updatedAt === nextConnection.updatedAt &&
    prevActive === nextActive
  );
};

/**
 * 优化的表格数据比较函数
 */
export const tableDataCompare = (prevProps: any, nextProps: any) => {
  const { data: prevData, loading: prevLoading, columns: prevColumns } = prevProps;
  const { data: nextData, loading: nextLoading, columns: nextColumns } = nextProps;

  return (
    prevLoading === nextLoading &&
    prevData.length === nextData.length &&
    prevColumns.length === nextColumns.length &&
    prevData.every((row: any, index: number) =>
      Object.keys(row).every(key => row[key] === nextData[index][key])
    )
  );
};
