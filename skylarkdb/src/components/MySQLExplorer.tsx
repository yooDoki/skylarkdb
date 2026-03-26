import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { MySQLTable, MySQLColumn, TableData, MySQLRoutine } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Database, Table2, Search, Play, RefreshCw, ChevronRight, ChevronDown,
  Key, Hash, Type, Calendar, FileCode, ChevronLeft, ArrowLeft,
  Loader2, Plus, Edit2, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown, Braces
} from 'lucide-react';
import { DataEditForm } from './DataEditForm';
import { SqlEditor } from './SqlEditor';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/utils/cn';
import {
  getMySQLTableData,
  executeMySQLQuery,
  getMySQLTables,
  getMySQLColumns,
  insertMySQLRecord,
  updateMySQLRecord,
  deleteMySQLRecord,
  getMySQLRoutines,
} from '@/utils/api';
import { countSqlPlaceholders } from '@/utils/sqlPlaceholders';
import {
  columnSupportsSort,
  columnSupportsFilter,
  FILTER_OP_LABELS,
  type TableDataFilterOp,
} from '@/utils/mysqlTable';

const DEFAULT_PAGE_SIZE = 50;

export interface MySQLExplorerProps {
  /** 由顶部栏「SQL」按钮控制，打开 SQL 查询对话框 */
  sqlWorkbenchOpen?: boolean;
  onSqlWorkbenchOpenChange?: (open: boolean) => void;
}

interface TableCache {
  data: TableData;
  timestamp: number;
}

export function MySQLExplorer({
  sqlWorkbenchOpen = false,
  onSqlWorkbenchOpenChange,
}: MySQLExplorerProps = {}) {
  const { activeConnection } = useConnectionStore();
  const [tables, setTables] = useState<MySQLTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableColumns, setTableColumns] = useState<Map<string, MySQLColumn[]>>(new Map());
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [viewingTable, setViewingTable] = useState<string | null>(null);
  const [clickTimer, setClickTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [pendingTable, setPendingTable] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryResultData, setQueryResultData] = useState<TableData | null>(null);
  const [mysqlRoutines, setMysqlRoutines] = useState<MySQLRoutine[]>([]);
  const [queryParams, setQueryParams] = useState<string[]>([]);

  // Form editing states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingRow, setEditingRow] = useState<Record<string, any> | undefined>(undefined);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);
  const [filterColumn, setFilterColumn] = useState('');
  const [filterOp, setFilterOp] = useState<TableDataFilterOp>('contains');
  const [filterValue, setFilterValue] = useState('');
  const [activeFilter, setActiveFilter] = useState<{
    column: string;
    op: TableDataFilterOp;
    value: string;
  } | null>(null);

  const tableCache = useRef<Map<string, TableCache>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  const CACHE_TIMEOUT = 5 * 60 * 1000;

  const loadTables = useCallback(async (connectionId: string) => {
    try {
      const tablesData = await getMySQLTables(connectionId);
      setTables(tablesData);
    } catch (error) {
      console.error('Failed to load tables:', error);
    }
  }, []);

  useEffect(() => {
    if (activeConnection.status === 'connected' && activeConnection.connection?.id) {
      loadTables(activeConnection.connection.id);
    } else if (activeConnection.status === 'disconnected') {
      setTables([]);
      setTableData(null);
      setViewingTable(null);
      setTableColumns(new Map());
    }
  }, [activeConnection.status, activeConnection.connection?.id, loadTables]);

  useEffect(() => {
    if (!viewingTable) return;
    setSortColumn(null);
    setSortDesc(false);
    setActiveFilter(null);
    setFilterColumn('');
    setFilterOp('contains');
    setFilterValue('');
    setCurrentPage(0);
    tableCache.current.clear();
  }, [viewingTable]);

  const loadTableData = useCallback(async (tableName: string, page: number, signal?: AbortSignal) => {
    if (!activeConnection.connection?.id) return;

    const filterKey = activeFilter
      ? `${activeFilter.column}:${activeFilter.op}:${activeFilter.value}`
      : '';
    const cacheKey = `${tableName}-${page}-${pageSize}-${sortColumn ?? ''}-${sortDesc}-${filterKey}`;

    const cached = tableCache.current.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
      setTableData(cached.data);
      return;
    }

    setLoading(true);
    try {
      const needsValue = !activeFilter || (activeFilter.op !== 'is_null' && activeFilter.op !== 'is_not_null');
      const data = await getMySQLTableData(
        activeConnection.connection.id,
        tableName,
        pageSize,
        page * pageSize,
        {
          orderBy: sortColumn ?? null,
          orderDesc: sortDesc,
          filterColumn: activeFilter?.column ?? null,
          filterOp: activeFilter?.op ?? null,
          filterValue: activeFilter && needsValue ? activeFilter.value : null,
        }
      );

      if (!signal?.aborted) {
        tableCache.current.set(cacheKey, { data, timestamp: Date.now() });
        setTableData(data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to load table data:', error);
      if (!signal?.aborted) {
        setTableData({
          columns: [],
          rows: [],
          totalCount: 0,
          executionTime: 0,
        });
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [activeConnection.connection?.id, pageSize, sortColumn, sortDesc, activeFilter]);

  useEffect(() => {
    if (viewingTable && activeConnection.connection?.id) {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      loadTableData(viewingTable, currentPage, controller.signal);
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [viewingTable, currentPage, activeConnection.connection?.id, loadTableData, pageSize, sortColumn, sortDesc, activeFilter]);

  const handleTableClick = useCallback(async (tableName: string) => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      setClickTimer(null);
    }

    const timer = setTimeout(async () => {
      if (expandedTables.has(tableName)) {
        setExpandedTables(prev => {
          const next = new Set(prev);
          next.delete(tableName);
          return next;
        });
      } else {
        setExpandedTables(prev => new Set(prev).add(tableName));
        setSelectedTable(tableName);
        
        try {
          if (!tableColumns.has(tableName) && activeConnection.connection?.id) {
            const columns = await getMySQLColumns(activeConnection.connection.id, tableName);
            setTableColumns(prev => new Map(prev).set(tableName, columns));
          }
        } catch (error) {
          console.error('Failed to load columns:', error);
        }
      }
    }, 200);

    setClickTimer(timer);
  }, [clickTimer, expandedTables, tableColumns, activeConnection.connection?.id]);

  const handleTableDoubleClick = useCallback(async (tableName: string) => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      setClickTimer(null);
    }

    setPendingTable(tableName);
    
    try {
      if (!tableColumns.has(tableName) && activeConnection.connection?.id) {
        const columns = await getMySQLColumns(activeConnection.connection.id, tableName);
        setTableColumns(prev => new Map(prev).set(tableName, columns));
      }
    } catch (error) {
      console.error('Failed to load columns:', error);
    }
    
    setViewingTable(tableName);
    setCurrentPage(0);
    // Don't clear tableData here, let the useEffect load new data
    setPendingTable(null);
  }, [clickTimer, tableColumns, activeConnection.connection?.id]);

  const handleCloseTableView = useCallback(() => {
    setViewingTable(null);
    setTableData(null);
    setCurrentPage(0);
  }, []);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);

  const handleNextPage = useCallback(() => {
    if (tableData && (currentPage + 1) * pageSize < tableData.totalCount) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, tableData, pageSize]);

  useEffect(() => {
    if (sqlWorkbenchOpen) {
    } else {
      setQueryResultData(null);
      setQueryError(null);
    }
  }, [sqlWorkbenchOpen]);

  useEffect(() => {
    const cid = activeConnection.connection?.id;
    if (!sqlWorkbenchOpen || !cid) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getMySQLRoutines(cid);
        if (!cancelled) setMysqlRoutines(list);
      } catch (e) {
        console.error('Failed to load routines:', e);
        if (!cancelled) setMysqlRoutines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sqlWorkbenchOpen, activeConnection.connection?.id]);

  const queryPlaceholderCount = useMemo(() => countSqlPlaceholders(query), [query]);

  useEffect(() => {
    const n = queryPlaceholderCount;
    setQueryParams((prev) => {
      if (prev.length === n) return prev;
      const next = prev.slice(0, n);
      while (next.length < n) next.push('');
      return next;
    });
  }, [queryPlaceholderCount]);

  const insertRoutineSnippet = useCallback((r: MySQLRoutine) => {
    const esc = (s: string) => s.replace(/`/g, '``');
    const sc = esc(r.schema);
    const nm = esc(r.name);
    const cnt = r.parameters.length;
    const ph = cnt > 0 ? Array(cnt).fill('?').join(', ') : '';
    const isProc = r.routineType.toUpperCase() === 'PROCEDURE';
    const sqlText = isProc
      ? `CALL \`${sc}\`.\`${nm}\`(${ph})`
      : `SELECT \`${sc}\`.\`${nm}\`(${ph}) AS _result`;
    setQuery(sqlText);
    setQueryParams(new Array(cnt).fill(''));
  }, []);

  const handleExecuteQuery = useCallback(async () => {
    if (!query.trim() || !activeConnection.connection?.id) return;

    const n = countSqlPlaceholders(query);
    if (n !== queryParams.length) {
      setQueryError(`占位符 ? 共 ${n} 个，当前参数 ${queryParams.length} 个，请对齐后再执行。`);
      return;
    }

    setLoading(true);
    setQueryError(null);
    try {
      const result = await executeMySQLQuery(
        activeConnection.connection.id,
        query,
        n === 0 ? null : queryParams.slice(0, n)
      );
      setQueryResultData({
        columns: result.columns,
        rows: result.rows,
        totalCount: result.rows.length,
        executionTime: result.executionTime,
        affectedRows: result.affectedRows,
      });
    } catch (error) {
      console.error('Query failed:', error);
      const msg = error instanceof Error ? error.message : String(error);
      setQueryError(msg);
      setQueryResultData(null);
    }
    setLoading(false);
  }, [query, queryParams, activeConnection.connection?.id]);

  const handleClearQueryResult = useCallback(() => {
    setQueryResultData(null);
    setQueryError(null);
  }, []);

  // Form editing handlers
  const handleOpenCreateForm = useCallback(() => {
    if (!viewingTable) return;
    setFormMode('create');
    setEditingRow(undefined);
    setIsFormOpen(true);
  }, [viewingTable]);

  const handleOpenEditForm = useCallback((row: Record<string, any>, index: number) => {
    if (!viewingTable) return;
    setFormMode('edit');
    setEditingRow(row);
    setSelectedRowIndex(index);
    setIsFormOpen(true);
  }, [viewingTable]);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingRow(undefined);
    setSelectedRowIndex(null);
  }, []);

  const handleDeleteRow = useCallback(async (row: Record<string, any>) => {
    if (!viewingTable || !activeConnection.connection?.id) return;

    if (!confirm('确定要删除这条记录吗？')) return;

    try {
      const columns = tableColumns.get(viewingTable);
      let primaryKey = 'id';
      
      if (columns) {
        const pkColumn = columns.find(col => 
          col.extra.includes('auto_increment') || col.name === 'id'
        );
        if (pkColumn) {
          primaryKey = pkColumn.name;
        }
      }

      await deleteMySQLRecord(
        activeConnection.connection.id,
        viewingTable,
        primaryKey,
        row[primaryKey]
      );

      await loadTableData(viewingTable, currentPage);
    } catch (error) {
      console.error('Delete failed:', error);
      alert('删除失败：' + error);
    }
  }, [viewingTable, activeConnection.connection?.id, tableColumns, currentPage, loadTableData]);

  const handleFormSubmit = useCallback(async (data: Record<string, any>) => {
    if (!viewingTable || !activeConnection.connection?.id) return;

    try {
      const columns = tableColumns.get(viewingTable);
      
      if (formMode === 'create') {
        const insertData: Record<string, any> = {};
        columns?.forEach(col => {
          if (!col.extra.includes('auto_increment')) {
            const value = data[col.name];
            if (value !== '' && value !== undefined && value !== null) {
              insertData[col.name] = value;
            } else if (col.nullable || col.default) {
            } else {
              insertData[col.name] = value;
            }
          }
        });
        
        await insertMySQLRecord(
          activeConnection.connection.id,
          viewingTable,
          insertData
        );
      } else {
        let primaryKey = 'id';
        
        if (columns) {
          const pkColumn = columns.find(col => 
            col.extra.includes('auto_increment') || col.name === 'id'
          );
          if (pkColumn) {
            primaryKey = pkColumn.name;
          }
        }

        const primaryValue = editingRow?.[primaryKey];
        
        await updateMySQLRecord(
          activeConnection.connection.id,
          viewingTable,
          data,
          primaryKey,
          primaryValue
        );
      }

      tableCache.current.clear();
      await loadTableData(viewingTable, currentPage);
      handleCloseForm();
    } catch (error) {
      console.error('Form submission failed:', error);
      alert('保存失败：' + error);
      throw error;
    }
  }, [viewingTable, activeConnection.connection?.id, formMode, editingRow, tableColumns, currentPage, loadTableData, handleCloseForm]);

  const getColumnIcon = useCallback((column: MySQLColumn) => {
    if (column.extra.includes('auto_increment') || column.name === 'id') {
      return <Key className="h-3 w-3 text-amber-500" />;
    }
    if (column.type.includes('int') || column.type.includes('decimal')) {
      return <Hash className="h-3 w-3 text-blue-500" />;
    }
    if (column.type.includes('timestamp') || column.type.includes('datetime')) {
      return <Calendar className="h-3 w-3 text-green-500" />;
    }
    return <Type className="h-3 w-3 text-muted-foreground" />;
  }, []);

  const getTypeColor = useCallback((type: string) => {
    if (type.includes('int') || type.includes('decimal') || type.includes('float')) {
      return 'text-blue-600 bg-blue-50';
    }
    if (type.includes('varchar') || type.includes('text')) {
      return 'text-purple-600 bg-purple-50';
    }
    if (type.includes('timestamp') || type.includes('datetime') || type.includes('date')) {
      return 'text-green-600 bg-green-50';
    }
    if (type.includes('boolean') || type.includes('tinyint(1)')) {
      return 'text-amber-600 bg-amber-50';
    }
    return 'text-muted-foreground bg-muted';
  }, []);

  const viewingColumns = useMemo(
    () => (viewingTable ? tableColumns.get(viewingTable) ?? [] : []),
    [viewingTable, tableColumns]
  );

  const filterableColumns = useMemo(
    () => viewingColumns.filter((c) => columnSupportsFilter(c as MySQLColumn & Record<string, unknown>)),
    [viewingColumns]
  );

  useEffect(() => {
    if (!viewingTable || filterableColumns.length === 0) return;
    setFilterColumn((prev) => {
      if (prev && filterableColumns.some((c) => c.name === prev)) return prev;
      return filterableColumns[0].name;
    });
  }, [viewingTable, filterableColumns]);

  const handleSortHeaderClick = useCallback(
    (col: string) => {
      const meta = viewingColumns.find((c) => c.name === col);
      if (!meta || !columnSupportsSort(meta as MySQLColumn & Record<string, unknown>)) return;
      tableCache.current.clear();
      setCurrentPage(0);
      if (sortColumn !== col) {
        setSortColumn(col);
        setSortDesc(false);
      } else if (!sortDesc) {
        setSortDesc(true);
      } else {
        setSortColumn(null);
        setSortDesc(false);
      }
    },
    [viewingColumns, sortColumn, sortDesc]
  );

  const applyTableFilter = useCallback(() => {
    const fc = filterColumn.trim();
    if (!fc) {
      alert('请选择要筛选的列');
      return;
    }
    const meta = viewingColumns.find((c) => c.name === fc);
    if (!meta || !columnSupportsFilter(meta as MySQLColumn & Record<string, unknown>)) {
      alert('该列不支持筛选');
      return;
    }
    if (filterOp !== 'is_null' && filterOp !== 'is_not_null' && !filterValue.trim()) {
      alert('请输入筛选值');
      return;
    }
    tableCache.current.clear();
    setActiveFilter({
      column: fc,
      op: filterOp,
      value: filterValue.trim(),
    });
    setCurrentPage(0);
  }, [filterColumn, filterOp, filterValue, viewingColumns]);

  const clearTableFilter = useCallback(() => {
    tableCache.current.clear();
    setActiveFilter(null);
    setFilterValue('');
    setCurrentPage(0);
  }, []);

  const filteredTables = useMemo(() => {
    const uniqueTables = Array.from(new Map(tables.map(t => [t.name, t])).values());
    return uniqueTables.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [tables, searchTerm]);

  const totalPages = useMemo(() =>
    tableData ? Math.ceil(tableData.totalCount / pageSize) : 0,
    [tableData, pageSize]
  );

  if (activeConnection.status !== 'connected') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center transition-opacity duration-300">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-mysql/20 blur-3xl rounded-full" />
            <Database className="h-20 w-20 mx-auto text-mysql/50 relative" />
          </div>
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">等待连接</h3>
          <p className="text-sm text-muted-foreground/70">请先连接 MySQL 数据库</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 p-4">
      {/* Sidebar - Tables */}
      <Card className="w-72 flex-shrink-0 shadow-card border-border/50 transition-all duration-200 flex flex-col">
        <CardHeader className="pb-3 space-y-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-mysql/10">
              <Database className="h-4 w-4 text-mysql" />
            </div>
            <CardTitle className="text-sm font-semibold">数据表</CardTitle>
            <Badge variant="secondary" className="ml-auto text-xs">
              {tables.length}
            </Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索表..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs rounded-lg"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="space-y-1 overflow-auto pr-1 flex-1 min-h-0">
            {filteredTables.map((table, index) => (
              <div
                key={table.name}
                className="transition-all duration-150"
                style={{ transitionDelay: `${index * 20}ms` }}
              >
                <button
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-all duration-150",
                    selectedTable === table.name
                      ? "bg-mysql/10 text-mysql border border-mysql/20"
                      : "hover:bg-muted/50 border border-transparent",
                    pendingTable === table.name && "opacity-50"
                  )}
                  onClick={() => handleTableClick(table.name)}
                  onDoubleClick={() => handleTableDoubleClick(table.name)}
                >
                  {expandedTables.has(table.name) ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150" />
                  )}
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left truncate font-medium">{table.name}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {table.rows.toLocaleString()}
                  </span>
                </button>
                {expandedTables.has(table.name) && tableColumns.get(table.name)?.length && (
                  <div className="ml-6 mt-1 space-y-0.5">
                    {tableColumns.get(table.name)?.map((col) => (
                      <div
                        key={col.name}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted/30 transition-colors"
                      >
                        {getColumnIcon(col)}
                        <span className="truncate font-medium">{col.name}</span>
                        <span className={cn(
                          "text-[10px] px-1 py-0.5 rounded ml-auto",
                          getTypeColor(col.type)
                        )}>
                          {col.type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {viewingTable ? (
          <Card className="flex-1 overflow-hidden shadow-card border-border/50 transition-all duration-200 flex flex-col">
            <CardHeader className="pb-3 border-b bg-muted/30 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCloseTableView}
                    className="h-8 w-8 hover:bg-muted transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="p-1.5 rounded-lg bg-mysql/10">
                    <Table2 className="h-4 w-4 text-mysql" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">{viewingTable}</CardTitle>
                    {tableData && (
                      <p className="text-xs text-muted-foreground">
                        共 {tableData.totalCount.toLocaleString()} 条记录
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {tableData && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-mono">
                        {tableData.rows.length} 条/页
                      </Badge>
                      <span>执行时间: {tableData.executionTime.toFixed(3)}s</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    onClick={handleOpenCreateForm}
                    className="h-8 bg-mysql hover:bg-mysql/90 text-white"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    新增
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => loadTableData(viewingTable, currentPage)}
                    disabled={loading}
                    className="h-8 w-8 hover:bg-muted transition-colors"
                  >
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {filterableColumns.length > 0 && (
              <div className="flex flex-wrap items-end gap-2 px-4 py-2 border-b bg-muted/20 flex-shrink-0">
                <div className="space-y-0.5 min-w-[140px]">
                  <span className="text-[10px] text-muted-foreground block">筛选列</span>
                  <select
                    value={filterColumn}
                    onChange={(e) => setFilterColumn(e.target.value)}
                    className="w-full h-8 text-xs px-2 rounded-md border border-input bg-background"
                  >
                    {filterableColumns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-0.5 min-w-[120px]">
                  <span className="text-[10px] text-muted-foreground block">条件</span>
                  <select
                    value={filterOp}
                    onChange={(e) => setFilterOp(e.target.value as TableDataFilterOp)}
                    className="w-full h-8 text-xs px-2 rounded-md border border-input bg-background"
                  >
                    {(Object.keys(FILTER_OP_LABELS) as TableDataFilterOp[]).map((op) => (
                      <option key={op} value={op}>
                        {FILTER_OP_LABELS[op]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-0.5 flex-1 min-w-[120px] max-w-[280px]">
                  <span className="text-[10px] text-muted-foreground block">值</span>
                  <Input
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyTableFilter()}
                    disabled={filterOp === 'is_null' || filterOp === 'is_not_null'}
                    className="h-8 text-xs"
                    placeholder={filterOp === 'is_null' || filterOp === 'is_not_null' ? '无需填写' : '输入后应用或回车'}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-mysql hover:bg-mysql/90 text-white"
                  onClick={applyTableFilter}
                >
                  应用筛选
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={clearTableFilter}
                  disabled={!activeFilter}
                >
                  清除
                </Button>
                {activeFilter && (
                  <Badge variant="secondary" className="text-[10px] max-w-[200px] truncate mb-0.5">
                    {activeFilter.column} · {FILTER_OP_LABELS[activeFilter.op]}
                    {activeFilter.op !== 'is_null' && activeFilter.op !== 'is_not_null'
                      ? ` "${activeFilter.value}"`
                      : ''}
                  </Badge>
                )}
              </div>
            )}
            <CardContent className="flex-1 overflow-hidden p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Loader2 className="h-8 w-8 text-mysql animate-spin" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : tableData && tableData.columns.length > 0 ? (
                <div className="h-full flex flex-col">
                  <div className="flex-1 min-h-0 overflow-auto relative">
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                        <TableRow>
                          {tableData.columns.map((col) => {
                            const colMeta = viewingColumns.find((c) => c.name === col);
                            const sortable = colMeta
                              ? columnSupportsSort(colMeta as MySQLColumn & Record<string, unknown>)
                              : false;
                            const isSorted = sortColumn === col;
                            return (
                              <TableHead key={col} className="text-xs whitespace-nowrap bg-inherit align-bottom">
                                <button
                                  type="button"
                                  disabled={!sortable}
                                  onClick={() => handleSortHeaderClick(col)}
                                  className={cn(
                                    'inline-flex items-center gap-1 font-semibold max-w-full text-left',
                                    sortable && 'cursor-pointer hover:text-mysql rounded px-0.5 -mx-0.5',
                                    !sortable && 'cursor-default'
                                  )}
                                >
                                  <span className="truncate">{col}</span>
                                  {sortable &&
                                    (isSorted ? (
                                      sortDesc ? (
                                        <ArrowDown className="h-3.5 w-3.5 shrink-0 text-mysql" />
                                      ) : (
                                        <ArrowUp className="h-3.5 w-3.5 shrink-0 text-mysql" />
                                      )
                                    ) : (
                                      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-35" />
                                    ))}
                                </button>
                              </TableHead>
                            );
                          })}
                          <TableHead className="font-semibold text-xs whitespace-nowrap w-[100px] text-center bg-inherit">
                            操作
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableData.rows.map((row, idx) => (
                          <TableRow
                            key={idx}
                            className={cn(
                              "transition-colors",
                              selectedRowIndex === idx ? "bg-mysql/10" : "hover:bg-muted/30"
                            )}
                          >
                            {tableData.columns.map((col) => (
                              <TableCell key={col} className="text-sm font-mono max-w-[200px] truncate">
                                {row[col] === null ? (
                                  <span className="text-muted-foreground italic">NULL</span>
                                ) : typeof row[col] === 'object' ? (
                                  JSON.stringify(row[col])
                                ) : (
                                  String(row[col])
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenEditForm(row, idx)}
                                  className="h-7 w-7 hover:bg-mysql/10 hover:text-mysql"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteRow(row)}
                                  className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 py-3 border-t bg-muted/30 px-4 flex-shrink-0">
                      <div className="flex items-center gap-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handlePrevPage}
                          disabled={currentPage === 0}
                          className="transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          上一页
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          第 {currentPage + 1} / {totalPages} 页
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleNextPage}
                          disabled={(currentPage + 1) * pageSize >= tableData.totalCount}
                          className="transition-colors"
                        >
                          下一页
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">每页显示:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(0);
                          }}
                          className="w-[100px] h-8 text-xs px-2 rounded-md border border-input bg-background"
                        >
                          <option value="10">10条</option>
                          <option value="20">20条</option>
                          <option value="50">50条</option>
                          <option value="100">100条</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  暂无数据
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 min-h-0 px-6 text-center">
            <div className="relative">
              <div className="absolute inset-0 bg-mysql/15 blur-2xl rounded-full scale-150" />
              <div className="relative p-5 rounded-2xl bg-mysql/10 border border-mysql/20">
                <Table2 className="h-12 w-12 text-mysql/80 mx-auto" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">双击左侧表名查看数据</p>
              <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                需要写 SQL 时，点击顶部栏的 <span className="font-mono text-mysql">SQL</span> 图标打开查询窗口
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={sqlWorkbenchOpen}
        onOpenChange={(open) => onSqlWorkbenchOpenChange?.(open)}
      >
        <DialogContent className="w-[min(96vw,920px)] max-w-none gap-0 p-0 flex flex-col max-h-[min(90vh,900px)]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/20">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileCode className="h-5 w-5 text-primary shrink-0" />
              SQL 查询
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-normal pt-1">
              ⌘/Ctrl + Enter 执行查询
            </p>
          </DialogHeader>
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Braces className="h-3.5 w-3.5" />
                存储过程 / 函数（information_schema）
                <Badge variant="secondary" className="text-[10px]">
                  {mysqlRoutines.length}
                </Badge>
              </div>
              {mysqlRoutines.length === 0 ? (
                <p className="text-xs text-muted-foreground">当前库无 Routine，或暂无权限读取 information_schema。</p>
              ) : (
                <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1">
                  {mysqlRoutines.map((r) => (
                    <div
                      key={`${r.schema}.${r.name}.${r.routineType}`}
                      className="flex flex-wrap items-center gap-2 text-xs rounded-md px-2 py-1.5 bg-background/80 border border-border/50"
                    >
                      <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                        {r.routineType === 'PROCEDURE' ? 'PROC' : 'FUNC'}
                      </Badge>
                      <span className="font-mono truncate max-w-[200px]" title={`${r.schema}.${r.name}`}>
                        {r.schema}.{r.name}
                      </span>
                      {r.parameters.length > 0 && (
                        <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
                          (
                          {r.parameters
                            .map((p) =>
                              [p.mode, p.name || `arg${p.ordinal}`, p.dataType].filter(Boolean).join(' ')
                            )
                            .join(', ')}
                          )
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-[10px] ml-auto shrink-0"
                        onClick={() => insertRoutineSnippet(r)}
                      >
                        插入
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <SqlEditor
              value={query}
              onChange={setQuery}
              onExecute={handleExecuteQuery}
              tables={tables}
              tableColumns={tableColumns}
              routines={mysqlRoutines}
            />
            {queryPlaceholderCount > 0 && (
              <div className="rounded-lg border border-mysql/25 bg-mysql/5 px-3 py-2 space-y-2">
                <p className="text-xs font-medium text-foreground">
                  参数绑定 <span className="text-muted-foreground font-normal">（{queryPlaceholderCount} 个 ?，服务端预编译绑定，防注入）</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: queryPlaceholderCount }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-muted-foreground w-6 shrink-0">{i + 1}</span>
                      <Input
                        value={queryParams[i] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setQueryParams((prev) => {
                            const next = [...prev];
                            next[i] = v;
                            return next;
                          });
                        }}
                        className="h-8 text-xs font-mono"
                        placeholder={`第 ${i + 1} 个参数`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {queryError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {queryError}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs font-mono">
                  MySQL 8.0
                </Badge>
                {selectedTable && (
                  <Badge variant="secondary" className="text-xs">
                    选中: {selectedTable}
                  </Badge>
                )}
              </div>
              <Button
                onClick={handleExecuteQuery}
                disabled={loading || !query.trim()}
                size="sm"
                className="bg-mysql hover:bg-mysql/90 transition-colors"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                执行查询
              </Button>
            </div>
            {queryResultData && (
              <Card className="flex flex-col min-h-0 overflow-hidden border-mysql/25 shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30 flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Table2 className="h-4 w-4 text-mysql shrink-0" />
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold">查询结果</CardTitle>
                        <p className="text-xs text-muted-foreground truncate">
                          {queryResultData.columns.length > 0
                            ? `${queryResultData.rows.length.toLocaleString()} 行 · ${queryResultData.executionTime.toFixed(3)}s`
                            : queryResultData.affectedRows !== undefined
                              ? `影响行数 ${queryResultData.affectedRows} · ${queryResultData.executionTime.toFixed(3)}s`
                              : `无结果集 · ${queryResultData.executionTime.toFixed(3)}s`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 text-muted-foreground"
                      onClick={handleClearQueryResult}
                    >
                      <X className="h-4 w-4 mr-1" />
                      清除
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0 max-h-[min(40vh,360px)] overflow-auto relative">
                  {queryResultData.columns.length > 0 ? (
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                        <TableRow>
                          {queryResultData.columns.map((col) => (
                            <TableHead key={col} className="font-semibold text-xs whitespace-nowrap bg-inherit">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {queryResultData.rows.map((row, idx) => (
                          <TableRow key={idx} className="hover:bg-muted/30">
                            {queryResultData.columns.map((col) => (
                              <TableCell key={col} className="text-sm font-mono max-w-[240px] truncate">
                                {row[col] === null || row[col] === undefined ? (
                                  <span className="text-muted-foreground italic">NULL</span>
                                ) : typeof row[col] === 'object' ? (
                                  JSON.stringify(row[col])
                                ) : (
                                  String(row[col])
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex items-center justify-center min-h-[100px] px-4 py-6 text-sm text-muted-foreground">
                      {queryResultData.affectedRows !== undefined
                        ? `语句已执行，影响 ${queryResultData.affectedRows} 行。`
                        : '无返回列（例如空结果集，或当前后端对非 SELECT 的支持有限）。'}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Data Edit Form Modal */}
      {viewingTable && tableColumns.has(viewingTable) && (
        <DataEditForm
          isOpen={isFormOpen}
          onClose={handleCloseForm}
          onSubmit={handleFormSubmit}
          columns={tableColumns.get(viewingTable) || []}
          initialData={editingRow}
          tableName={viewingTable}
          mode={formMode}
        />
      )}
    </div>
  );
}