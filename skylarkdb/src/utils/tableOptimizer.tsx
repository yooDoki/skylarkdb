/**
 * 表格数据渲染性能优化
 */

import React, { memo, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/utils/cn';

interface OptimizedTableProps<T> {
  data: T[];
  columns: Array<{
    key: string;
    title: string;
    render?: (value: any, row: T) => React.ReactNode;
    className?: string;
  }>;
  className?: string;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string | number;
}

/**
 * 优化的表格行组件
 */
const OptimizedTableRow = memo(
  <T,>({
    row,
    columns,
    onRowClick,
    keyExtractor,
  }: {
    row: T;
    columns: OptimizedTableProps<T>['columns'];
    onRowClick?: (row: T) => void;
    keyExtractor: (row: T) => string | number;
  }) => {
    const handleClick = useCallback(() => {
      onRowClick?.(row);
    }, [row, onRowClick]);

    return (
      <TableRow
        key={keyExtractor(row)}
        className={cn(
          'hover:bg-muted/50 cursor-pointer transition-colors',
          onRowClick && 'hover:bg-muted'
        )}
        onClick={handleClick}
      >
        {columns.map(column => (
          <TableCell key={column.key} className={cn('py-2', column.className)}>
            {column.render
              ? column.render((row as any)[column.key], row)
              : String((row as any)[column.key] ?? '')}
          </TableCell>
        ))}
      </TableRow>
    );
  }
) as <T>(props: {
  row: T;
  columns: OptimizedTableProps<T>['columns'];
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string | number;
}) => JSX.Element;

/**
 * 优化的表格组件
 */
export function OptimizedTable<T>({
  data,
  columns,
  className,
  loading = false,
  emptyMessage = '暂无数据',
  onRowClick,
  keyExtractor,
}: OptimizedTableProps<T>) {
  // 记忆化列定义
  const memoizedColumns = useMemo(
    () => columns,
    [JSON.stringify(columns.map(c => ({ key: c.key, title: c.title, className: c.className })))]
  );

  // 记忆化行数据
  const memoizedData = useMemo(() => data, [JSON.stringify(data)]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (data.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className={cn('rounded-md border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {memoizedColumns.map(column => (
              <TableHead key={column.key} className={cn('font-medium', column.className)}>
                {column.title}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {memoizedData.map(row => (
            <OptimizedTableRow
              key={keyExtractor(row)}
              row={row}
              columns={memoizedColumns}
              onRowClick={onRowClick}
              keyExtractor={keyExtractor}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * 虚拟滚动表格 - 用于大数据量场景
 */
export function VirtualizedTable<T>({
  data,
  columns,
  className,
  itemHeight = 40,
  containerHeight = 400,
  onRowClick,
}: {
  data: T[];
  columns: Array<{
    key: string;
    title: string;
    render?: (value: any, row: T) => React.ReactNode;
    className?: string;
  }>;
  className?: string;
  itemHeight?: number;
  containerHeight?: number;
  onRowClick?: (row: T) => void;
}) {
  const startIndex = Math.floor(0 / itemHeight);
  const endIndex = Math.min(Math.floor(containerHeight / itemHeight) + startIndex + 1, data.length);

  const visibleItems = data.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return (
    <div
      className={cn('border rounded-md overflow-hidden', className)}
      style={{ height: containerHeight }}
    >
      <div style={{ height: data.length * itemHeight, paddingTop: offsetY }}>
        {visibleItems.map((row, index) => (
          <div
            key={startIndex + index}
            className="flex items-center border-b hover:bg-muted/50 cursor-pointer transition-colors"
            style={{ height: itemHeight }}
            onClick={() => onRowClick?.(row)}
          >
            {columns.map(column => (
              <div key={column.key} className={cn('px-4 flex-1 truncate', column.className)}>
                {column.render
                  ? column.render((row as any)[column.key], row)
                  : String((row as any)[column.key] ?? '')}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
