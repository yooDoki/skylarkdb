/**
 * 统计 SQL 中 `?` 占位符数量（忽略字符串、标识符反引号、行/块注释）。
 * 与后端 `count_sql_placeholders` 行为对齐。
 */
export function countSqlPlaceholders(sql: string): number {
  let count = 0;
  let i = 0;
  const b = sql;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < b.length) {
    const c = b[i];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && b[i + 1] === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (!inSingle && !inDouble && !inBacktick) {
      if (c === '-' && b[i + 1] === '-') {
        inLineComment = true;
        i += 2;
        continue;
      }
      if (c === '/' && b[i + 1] === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }
    }
    if (inBacktick) {
      if (c === '`') {
        if (b[i + 1] === '`') {
          i += 2;
        } else {
          inBacktick = false;
          i += 1;
        }
      } else {
        i += 1;
      }
      continue;
    }
    if (inSingle) {
      if (c === '\\' && i + 1 < b.length) {
        i += 2;
        continue;
      }
      if (c === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      if (c === '\\' && i + 1 < b.length) {
        i += 2;
        continue;
      }
      if (c === '"') inDouble = false;
      i += 1;
      continue;
    }
    switch (c) {
      case "'":
        inSingle = true;
        i += 1;
        break;
      case '"':
        inDouble = true;
        i += 1;
        break;
      case '`':
        inBacktick = true;
        i += 1;
        break;
      case '?':
        count += 1;
        i += 1;
        break;
      default:
        i += 1;
    }
  }
  return count;
}
