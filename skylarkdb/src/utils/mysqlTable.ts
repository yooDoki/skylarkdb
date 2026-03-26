import type { MySQLColumn } from '@/types';

type Col = MySQLColumn & Record<string, unknown>;

function flagOff(c: Col): boolean {
  return c.isBlob || c.isJson || c.isGeometry || c.isBit || c.isEnum;
}

/** 与后端一致：排除 JSON / BLOB / GEOMETRY / BIT / ENUM 等 */
export function columnSupportsSort(col: Col): boolean {
  if (flagOff(col)) return false;
  const t = (col.type || '').toLowerCase();
  const bad = [
    'json', 'blob', 'tinyblob', 'mediumblob', 'longblob',
    'binary', 'varbinary',
    'geometry', 'point', 'linestring', 'polygon',
    'multipoint', 'multilinestring', 'multipolygon', 'geometrycollection',
    'bit', 'enum', 'set',
  ];
  return !bad.some((u) => t === u || t.startsWith(`${u}(`));
}

export function columnSupportsFilter(col: Col): boolean {
  return columnSupportsSort(col);
}

export type TableDataFilterOp =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'starts_with'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'is_null'
  | 'is_not_null';

export const FILTER_OP_LABELS: Record<TableDataFilterOp, string> = {
  eq: '等于',
  ne: '不等于',
  contains: '包含',
  starts_with: '开头是',
  gt: '大于',
  lt: '小于',
  gte: '大于等于',
  lte: '小于等于',
  is_null: '为空',
  is_not_null: '非空',
};
