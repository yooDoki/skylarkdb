import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { MySQLColumn, MySQLTable, TableData } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Database, Table2, Search, RefreshCw, ChevronRight, ChevronDown,
  ChevronLeft, ChevronsLeft, ChevronsRight, ArrowLeft, Loader2, Folder, FolderOpen,
  Plus, Trash2, KeyRound, Pencil, Save, X
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { getMySQLColumns, getMySQLTableData, getMySQLTables, getMySQLDatabases, setMySQLDefaultDatabase, updateMySQLRecord } from '@/utils/api';
import { CreateTableDialog } from '@/components/CreateTableDialog';
import { DeleteTableDialog } from '@/components/DeleteTableDialog';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

interface TableCache {
  data: TableData;
  timestamp: number;
}

type TableRow = Record<string, any>;

interface MySQLExplorerProps {
  onReconnect?: () => void;
}

export function MySQLExplorer({ onReconnect }: MySQLExplorerProps) {
  const { activeConnection, selectedDatabase, setSelectedDatabase } = useConnectionStore();
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<MySQLTable[]>([]);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [tableColumns, setTableColumns] = useState<Map<string, MySQLColumn[]>>(new Map());
  const [loadingColumns, setLoadingColumns] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [viewingTable, setViewingTable] = useState<string | null>(null);
  const [clickTimer, setClickTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [pendingTable, setPendingTable] = useState<string | null>(null);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [deleteTableName, setDeleteTableName] = useState<string | null>(null);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const tableCache = useRef<Map<string, TableCache>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  const CACHE_TIMEOUT = 5 * 60 * 1000;

  const loadDatabases = useCallback(async (connectionId: string) => {
    setLoadingDatabases(true);
    try {
      const dbs = await getMySQLDatabases(connectionId);
      setDatabases(dbs);
      if (dbs.length > 0 && !selectedDatabase) {
        const defaultDb = activeConnection.connection?.database;
        if (defaultDb && dbs.includes(defaultDb)) {
          setSelectedDatabase(defaultDb);
        }
      }
    } catch (error) {
      console.error('Failed to load databases:', error);
    } finally {
      setLoadingDatabases(false);
    }
  }, [selectedDatabase, activeConnection.connection?.database, setSelectedDatabase]);

  const loadTables = useCallback(async (connectionId: string, database: string) => {
    setLoadingTables(true);
    try {
      const tablesData = await getMySQLTables(connectionId, database);
      setTables(tablesData);
    } catch (error) {
      console.error('Failed to load tables:', error);
    } finally {
      setLoadingTables(false);
    }
  }, []);

  useEffect(() => {
    if (activeConnection.status === 'connected' && activeConnection.connection?.id) {
      loadDatabases(activeConnection.connection.id);
    } else if (!activeConnection.connection) {
      setDatabases([]);
      setTables([]);
      setTableColumns(new Map());
      setTableData(null);
      setViewingTable(null);
      setExpandedTables(new Set());
      setSelectedDatabase(null);
    }
  }, [activeConnection.status, activeConnection.connection?.id, loadDatabases]);

  useEffect(() => {
    if (activeConnection.status === 'connected' && selectedDatabase && activeConnection.connection?.id) {
      loadTables(activeConnection.connection.id, selectedDatabase);
      // Sync selected database to backend for SQL query execution
      setMySQLDefaultDatabase(activeConnection.connection.id, selectedDatabase).catch(err => {
        console.error('Failed to set default database:', err);
      });
    } else if (!selectedDatabase) {
      setTables([]);
      setTableColumns(new Map());
      setTableData(null);
      setViewingTable(null);
      setExpandedTables(new Set());
    }
  }, [activeConnection.status, selectedDatabase, activeConnection.connection?.id, loadTables]);

  const loadTableColumns = useCallback(async (tableName: string) => {
    const connectionId = activeConnection.connection?.id;
    if (!connectionId) return;
    if (tableColumns.has(tableName)) return;

    setLoadingColumns(prev => new Set(prev).add(tableName));
    try {
      const columns = await getMySQLColumns(connectionId, tableName);
      setTableColumns(prev => {
        const next = new Map(prev);
        next.set(tableName, columns);
        return next;
      });
    } catch (error) {
      console.error(`Failed to load columns for ${tableName}:`, error);
    } finally {
      setLoadingColumns(prev => {
        const next = new Set(prev);
        next.delete(tableName);
        return next;
      });
    }
  }, [activeConnection.connection?.id, tableColumns]);

  const handleCreateSuccess = useCallback(() => {
    if (activeConnection.connection?.id && selectedDatabase) {
      loadTables(activeConnection.connection.id, selectedDatabase);
    }
    tableCache.current.clear();
  }, [activeConnection.connection?.id, selectedDatabase, loadTables]);

  const handleDeleteSuccess = useCallback(() => {
    if (activeConnection.connection?.id && selectedDatabase) {
      loadTables(activeConnection.connection.id, selectedDatabase);
    }
    tableCache.current.clear();
    if (viewingTable === deleteTableName) {
      setViewingTable(null);
      setTableData(null);
    }
  }, [activeConnection.connection?.id, selectedDatabase, loadTables, viewingTable, deleteTableName]);

  const loadTableData = useCallback(async (
    tableName: string,
    page: number,
    signal?: AbortSignal,
    requestedPageSize?: number
  ) => {
    if (!activeConnection.connection?.id) return;

    const effectivePageSize = requestedPageSize ?? pageSize;
    const cacheKey = `${tableName}-${page}-${effectivePageSize}`;
    const cached = tableCache.current.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
      setTableData(cached.data);
      return;
    }

    setLoading(true);
    try {
      const data = await getMySQLTableData(
        activeConnection.connection.id,
        tableName,
        effectivePageSize,
        page * effectivePageSize
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
  }, [activeConnection.connection?.id, pageSize]);

  useEffect(() => {
    if (viewingTable && !tableColumns.has(viewingTable) && !loadingColumns.has(viewingTable)) {
      void loadTableColumns(viewingTable);
    }
  }, [viewingTable, tableColumns, loadingColumns, loadTableColumns]);

  useEffect(() => {
    setEditingRowKey(null);
    setEditingValues({});
    setSavingRowKey(null);
    setEditMessage(null);
  }, [viewingTable, currentPage]);

  const currentTableColumns = useMemo(() => (
    viewingTable ? tableColumns.get(viewingTable) ?? [] : []
  ), [tableColumns, viewingTable]);

  const primaryKeyColumns = useMemo(
    () => currentTableColumns.filter((column) => column.isPrimaryKey),
    [currentTableColumns]
  );

  const editablePrimaryKey = useMemo(
    () => primaryKeyColumns.length === 1 ? primaryKeyColumns[0] : null,
    [primaryKeyColumns]
  );

  const editableColumns = useMemo(
    () => currentTableColumns.filter((column) => !column.isPrimaryKey && !column.isBlob && !column.isBit && !column.isGeometry),
    [currentTableColumns]
  );

  const canInlineEdit = !!editablePrimaryKey && editableColumns.length > 0;

  const makeRowKey = useCallback((primaryValue: unknown) => {
    if (primaryValue === null || primaryValue === undefined) return null;
    if (typeof primaryValue === 'object') {
      return JSON.stringify(primaryValue);
    }
    return String(primaryValue);
  }, []);

  const serializeEditorValue = useCallback((value: unknown) => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }, []);

  const normalizeCompareValue = useCallback((value: unknown) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }, []);

  const parseEditedValue = useCallback((rawValue: string, column: MySQLColumn) => {
    const trimmed = rawValue.trim();

    if (trimmed.toUpperCase() === 'NULL') {
      if (!column.nullable) {
        throw new Error(`列「${column.name}」不允许为 NULL`);
      }
      return null;
    }

    if (column.isJson) {
      try {
        return JSON.parse(rawValue);
      } catch {
        throw new Error(`列「${column.name}」需要合法的 JSON`);
      }
    }

    const type = column.type.toLowerCase();
    const integerTypes = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint']);
    const decimalTypes = new Set(['decimal', 'numeric', 'float', 'double', 'real']);
    const boolLike = type === 'boolean' || type === 'bool' || (type === 'tinyint' && column.maxLength === '1');

    if (boolLike) {
      const boolValue = trimmed.toLowerCase();
      if (['1', 'true', 'yes', 'y', 'on'].includes(boolValue)) return true;
      if (['0', 'false', 'no', 'n', 'off'].includes(boolValue)) return false;
      throw new Error(`列「${column.name}」请输入 true/false 或 1/0`);
    }

    if (integerTypes.has(type)) {
      if (!/^[-+]?\d+$/.test(trimmed)) {
        throw new Error(`列「${column.name}」需要整数值`);
      }
      return Number(trimmed);
    }

    if (decimalTypes.has(type)) {
      if (!/^[-+]?\d+(\.\d+)?$/.test(trimmed)) {
        throw new Error(`列「${column.name}」需要数字值`);
      }
      return Number(trimmed);
    }

    return rawValue;
  }, []);

  const startEditingRow = useCallback((row: TableRow) => {
    if (!editablePrimaryKey) return;

    const rowKey = makeRowKey(row[editablePrimaryKey.name]);
    if (!rowKey) return;

    const nextValues: Record<string, string> = {};
    editableColumns.forEach((column) => {
      nextValues[column.name] = serializeEditorValue(row[column.name]);
    });

    setEditingRowKey(rowKey);
    setEditingValues(nextValues);
    setEditMessage(null);
  }, [editableColumns, editablePrimaryKey, makeRowKey, serializeEditorValue]);

  const cancelEditingRow = useCallback(() => {
    setEditingRowKey(null);
    setEditingValues({});
    setSavingRowKey(null);
    setEditMessage(null);
  }, []);

  const handleEditValueChange = useCallback((columnName: string, value: string) => {
    setEditingValues((prev) => ({ ...prev, [columnName]: value }));
  }, []);

  const saveEditingRow = useCallback(async (row: TableRow) => {
    if (!activeConnection.connection?.id || !viewingTable || !editablePrimaryKey) return;

    const primaryValue = row[editablePrimaryKey.name];
    const rowKey = makeRowKey(primaryValue);
    if (!rowKey) return;

    const nextChanges: Record<string, unknown> = {};

    try {
      editableColumns.forEach((column) => {
        const nextValue = parseEditedValue(editingValues[column.name] ?? serializeEditorValue(row[column.name]), column);
        if (normalizeCompareValue(nextValue) !== normalizeCompareValue(row[column.name])) {
          nextChanges[column.name] = nextValue;
        }
      });
    } catch (error) {
      setEditMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '输入值校验失败',
      });
      return;
    }

    if (Object.keys(nextChanges).length === 0) {
      setEditingRowKey(null);
      setEditingValues({});
      setEditMessage({
        type: 'success',
        text: '未检测到变更',
      });
      return;
    }

    setSavingRowKey(rowKey);
    setEditMessage(null);

    try {
      await updateMySQLRecord(
        activeConnection.connection.id,
        viewingTable,
        nextChanges,
        editablePrimaryKey.name,
        primaryValue
      );
      tableCache.current.clear();
      setEditingRowKey(null);
      setEditingValues({});
      setEditMessage({
        type: 'success',
        text: `已保存主键 ${editablePrimaryKey.name} = ${serializeEditorValue(primaryValue)} 的修改`,
      });

      const controller = new AbortController();
      abortControllerRef.current = controller;
      await loadTableData(viewingTable, currentPage, controller.signal);
    } catch (error) {
      setEditMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '保存失败',
      });
    } finally {
      setSavingRowKey(null);
    }
  }, [
    activeConnection.connection?.id,
    currentPage,
    editableColumns,
    editablePrimaryKey,
    editingValues,
    loadTableData,
    makeRowKey,
    normalizeCompareValue,
    parseEditedValue,
    serializeEditorValue,
    viewingTable,
  ]);

  const handleTableClick = useCallback((tableName: string) => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      setClickTimer(null);
    }

    const timer = setTimeout(() => {
      setExpandedTables(prev => {
        const newSet = new Set(prev);
        const willExpand = !newSet.has(tableName);
        if (!willExpand) {
          newSet.delete(tableName);
        } else {
          newSet.add(tableName);
          if (!tableColumns.has(tableName) && !loadingColumns.has(tableName)) {
            void loadTableColumns(tableName);
          }
        }
        return newSet;
      });
      setClickTimer(null);
    }, 250);

    setClickTimer(timer);
  }, [clickTimer, loadTableColumns, loadingColumns, tableColumns]);

  const handleTableDoubleClick = useCallback((tableName: string) => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      setClickTimer(null);
    }

    if (pendingTable) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setViewingTable(tableName);
    setPendingTable(tableName);
    setCurrentPage(0);
    loadTableData(tableName, 0, controller.signal);
  }, [clickTimer, pendingTable, loadTableData]);

  const handlePageChange = useCallback((newPage: number) => {
    if (!viewingTable) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setCurrentPage(newPage);
    loadTableData(viewingTable, newPage, controller.signal);
  }, [viewingTable, loadTableData]);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    if (!viewingTable) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPageSize(newPageSize);
    setCurrentPage(0);
    loadTableData(viewingTable, 0, controller.signal, newPageSize);
  }, [viewingTable, loadTableData]);

  const filteredTables = useMemo(() => {
    if (!searchTerm.trim()) return tables;
    const term = searchTerm.toLowerCase();
    return tables.filter(table => 
      table.name.toLowerCase().includes(term)
    );
  }, [tables, searchTerm]);

  const totalPages = Math.ceil((tableData?.totalCount || 0) / pageSize);

  const renderCellContent = (value: any) => {
    if (value === null || value === undefined) {
      return (
        <span className="inline-flex items-center rounded-md border border-dashed border-border/80 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          NULL
        </span>
      );
    }

    if (typeof value === 'object') {
      const serializedValue = JSON.stringify(value);
      return (
        <span className="inline-block min-w-max font-mono text-xs text-foreground/90" title={serializedValue}>
          {serializedValue}
        </span>
      );
    }

    const strValue = String(value);
    return (
      <span className="inline-block min-w-max font-mono text-xs text-foreground/90" title={strValue}>
        {strValue}
      </span>
    );
  };

  if (activeConnection.status !== 'connected') {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/60 bg-card/90 shadow-card backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 rounded-2xl bg-mysql/10 p-4">
              {activeConnection.status === 'connecting' ? (
                <Loader2 className="h-10 w-10 animate-spin text-mysql" />
              ) : (
                <Database className="h-10 w-10 text-mysql" />
              )}
            </div>
            <h3 className="text-lg font-semibold">
              {activeConnection.status === 'connecting' ? '正在连接数据库' : '数据库尚未连接'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {activeConnection.status === 'connecting'
                ? '正在恢复上次使用的连接，请稍候。如果长时间没有变化，可以手动重试。'
                : '连接建立后会自动恢复数据库和数据浏览状态。'}
            </p>
            {activeConnection.error && (
              <p className="mt-4 text-xs text-destructive">{activeConnection.error}</p>
            )}
            {onReconnect && activeConnection.status !== 'connecting' && (
              <Button className="mt-5" onClick={onReconnect}>
                重新连接
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!selectedDatabase) {
    return (
      <div className="h-full flex gap-4 p-4">
        <Card className="flex-1 border-border/60 bg-card/90 shadow-card backdrop-blur-sm">
          <CardHeader className="border-b border-border/60 bg-gradient-to-b from-background to-muted/10 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-mysql/10">
                <Database className="h-4 w-4 text-mysql" />
              </div>
              <CardTitle className="text-sm font-semibold">选择数据库</CardTitle>
              <Badge variant="secondary" className="ml-auto text-xs shadow-sm">
                {databases.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loadingDatabases ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : databases.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                暂无数据库
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {databases.map((db) => (
                  <button
                    key={db}
                    onClick={() => setSelectedDatabase(db)}
                    className="group flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/30 hover:shadow-md"
                  >
                    <div className="rounded-lg bg-mysql/10 p-1.5 transition-colors group-hover:bg-mysql/15">
                      <Folder className="h-4 w-4 text-mysql" />
                    </div>
                    <span className="text-sm font-medium truncate">{db}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex gap-4 overflow-hidden bg-gradient-to-b from-background to-muted/10 p-4">
      {/* Sidebar - Tables */}
      <Card className="w-72 min-h-0 flex-shrink-0 overflow-hidden border-border/60 bg-card/90 shadow-card backdrop-blur-sm">
        <CardHeader className="flex-shrink-0 space-y-3 border-b border-border/60 bg-gradient-to-b from-background to-muted/10 pb-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setSelectedDatabase(null);
                setTables([]);
                setViewingTable(null);
                setTableData(null);
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <div className="p-1.5 rounded-lg bg-mysql/10">
              <FolderOpen className="h-4 w-4 text-mysql" />
            </div>
            <CardTitle className="text-sm font-semibold truncate flex-1">
              {selectedDatabase}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {tables.length}
            </Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索表..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 rounded-lg border-border/60 bg-background/80 pl-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowCreateTable(true)}
              title="创建表"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                if (activeConnection.connection?.id && selectedDatabase) {
                  loadTables(activeConnection.connection.id, selectedDatabase);
                }
              }}
              title="刷新"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <div className="space-y-1">
            {loadingTables ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                暂无数据表
              </div>
            ) : (
              filteredTables.map((table) => (
                <div
                  key={`${table.schema}-${table.name}`}
                  className="transition-all duration-150"
                >
                  <button
                    onClick={() => handleTableClick(table.name)}
                    onDoubleClick={() => handleTableDoubleClick(table.name)}
                    className={cn(
                      "group w-full flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all",
                      viewingTable === table.name
                        ? "border-primary/25 bg-primary/[0.08] text-primary shadow-sm"
                        : "border-transparent hover:border-border/70 hover:bg-muted/60"
                    )}
                  >
                    {expandedTables.has(table.name) ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    )}
                    <Table2 className={cn(
                      "h-3.5 w-3.5 flex-shrink-0 transition-colors",
                      viewingTable === table.name ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                    <span className="text-xs truncate flex-1">{table.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 px-1.5 text-[10px] font-medium",
                        viewingTable === table.name
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "border-border/70 bg-background/70 text-muted-foreground"
                      )}
                    >
                      {table.rows}
                    </Badge>
                  </button>

                  {expandedTables.has(table.name) && (
                    <div className="mt-1 ml-5 rounded-xl border border-border/60 bg-muted/20 px-2.5 py-2">
                      {loadingColumns.has(table.name) ? (
                        <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          正在加载字段...
                        </div>
                      ) : (tableColumns.get(table.name)?.length ?? 0) > 0 ? (
                        <div className="space-y-1">
                          {tableColumns.get(table.name)!.map((column) => (
                            <div
                              key={`${table.name}-${column.name}`}
                              className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-background/70"
                            >
                              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-background text-muted-foreground">
                                {column.isPrimaryKey ? (
                                  <KeyRound className="h-3 w-3 text-amber-500" />
                                ) : column.extra.includes('auto_increment') ? (
                                  <KeyRound className="h-3 w-3" />
                                ) : (
                                  <span className="text-[10px] font-semibold">#</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[11px] font-medium text-foreground">{column.name}</span>
                                  {column.isPrimaryKey && (
                                    <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase border-amber-200 bg-amber-50 text-amber-700">
                                      PK
                                    </Badge>
                                  )}
                                  {!column.nullable && (
                                    <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                                      NN
                                    </Badge>
                                  )}
                                  {column.extra.includes('auto_increment') && (
                                    <Badge variant="secondary" className="h-4 px-1 text-[9px] uppercase">
                                      AI
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground">
                                  {column.fullType}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-1 py-2 text-xs text-muted-foreground">
                          暂无字段信息
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      {/* Main Content */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-4">
        {viewingTable && tableData ? (
          <>
            {/* Table Data View */}
            <Card className="flex flex-1 min-h-0 flex-col overflow-hidden border-border/60 bg-card/92 shadow-card backdrop-blur-sm transition-all duration-200">
              <CardHeader className="flex-shrink-0 border-b border-border/60 bg-gradient-to-b from-background via-background to-muted/10 pb-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-mysql/10">
                      <Table2 className="h-4 w-4 text-mysql" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-sm font-semibold">{viewingTable}</CardTitle>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {tableData && (
                          <>
                            <span>共 {tableData.totalCount.toLocaleString()} 条记录</span>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <span>{tableData.columns.length} 列</span>
                          </>
                        )}
                        {currentTableColumns.length > 0 && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            {canInlineEdit ? (
                              <span>支持行内编辑</span>
                            ) : editablePrimaryKey ? (
                              <span>没有可直接编辑的普通列</span>
                            ) : primaryKeyColumns.length > 1 ? (
                              <span>复合主键暂不支持行内编辑</span>
                            ) : (
                              <span>无主键，暂不支持行内编辑</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    {tableData && (
                      <div className="mr-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="font-mono shadow-sm">
                          {tableData.rows.length} 条/页
                        </Badge>
                        <span>执行时间: {tableData.executionTime.toFixed(3)}s</span>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        if (abortControllerRef.current) {
                          abortControllerRef.current.abort();
                        }
                        const controller = new AbortController();
                        abortControllerRef.current = controller;
                        loadTableData(viewingTable, currentPage, controller.signal);
                      }}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      刷新
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTableName(viewingTable)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      删除表
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 overflow-hidden flex flex-col p-0">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tableData.columns.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    暂无数据
                  </div>
                ) : (
                  <>
                    {(editMessage || currentTableColumns.length > 0 || loadingColumns.has(viewingTable)) && (
                      <div className="px-6 pt-4">
                        {editMessage && (
                          <div
                            className={cn(
                              "mb-3 rounded-lg border px-3 py-2 text-xs",
                              editMessage.type === 'success'
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-destructive/30 bg-destructive/5 text-destructive"
                            )}
                          >
                            {editMessage.text}
                          </div>
                        )}
                        {loadingColumns.has(viewingTable) ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            正在加载列信息...
                          </div>
                        ) : currentTableColumns.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="h-6 px-2.5">
                              {primaryKeyColumns.length > 0
                                ? `主键: ${primaryKeyColumns.map((column) => column.name).join(', ')}`
                                : '未检测到主键'}
                            </Badge>
                            {canInlineEdit ? (
                              <span>点击每行右侧“编辑”后可直接修改，输入 `NULL` 可置空。</span>
                            ) : editablePrimaryKey ? (
                              <span>当前表没有可安全编辑的普通列。</span>
                            ) : primaryKeyColumns.length > 1 ? (
                              <span>当前表为复合主键，暂未开放行内编辑。</span>
                            ) : (
                              <span>当前表没有主键，无法安全定位记录，暂未开放行内编辑。</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="min-h-0 flex-1 overflow-auto px-6 pb-4">
                      <div className="max-h-full overflow-auto rounded-xl border border-border/60 bg-background/95 shadow-inner">
                        <Table className="w-max min-w-full">
                          <TableHeader className="bg-background">
                            <TableRow>
                              {tableData.columns.map((col, idx) => (
                                <TableHead
                                  key={idx}
                                  className="sticky top-0 z-10 h-10 whitespace-nowrap border-b border-border/80 bg-background/95 text-xs font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/80"
                                >
                                  {col}
                                </TableHead>
                              ))}
                              {canInlineEdit && (
                                <TableHead className="sticky right-0 top-0 z-20 h-10 whitespace-nowrap border-b border-border/80 bg-background/95 text-xs font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/80">
                                  操作
                                </TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tableData.rows.map((row, rowIdx) => (
                              <TableRow key={rowIdx} className="odd:bg-muted/[0.18] hover:bg-primary/[0.05]">
                                {tableData.columns.map((col, cellIdx) => {
                                  const rowKey = canInlineEdit && editablePrimaryKey ? makeRowKey(row[editablePrimaryKey.name]) : null;
                                  const isEditingRow = !!rowKey && editingRowKey === rowKey;
                                  const columnMeta = currentTableColumns.find((column) => column.name === col);
                                  const canEditCell = isEditingRow && columnMeta && !columnMeta.isPrimaryKey && !columnMeta.isBlob && !columnMeta.isBit && !columnMeta.isGeometry;

                                  return (
                                    <TableCell key={cellIdx} className="min-w-[160px] whitespace-nowrap border-border/40 py-3 text-xs align-top">
                                      {canEditCell ? (
                                        <Input
                                          value={editingValues[col] ?? ''}
                                          onChange={(event) => handleEditValueChange(col, event.target.value)}
                                          className="h-8 min-w-[180px] rounded-md border-border/60 bg-background px-2 font-mono text-xs"
                                        />
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          {columnMeta?.isPrimaryKey && (
                                            <KeyRound className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                                          )}
                                          {renderCellContent(row[col])}
                                        </div>
                                      )}
                                    </TableCell>
                                  );
                                })}
                                {canInlineEdit && editablePrimaryKey && (
                                  <TableCell className="sticky right-0 z-10 border-l border-border/40 bg-background/95 py-2 text-xs backdrop-blur supports-[backdrop-filter]:bg-background/85">
                                    {(() => {
                                      const rowKey = makeRowKey(row[editablePrimaryKey.name]);
                                      const isEditingRow = !!rowKey && editingRowKey === rowKey;
                                      const isSavingRow = !!rowKey && savingRowKey === rowKey;

                                      if (!rowKey) {
                                        return <span className="text-muted-foreground">不可编辑</span>;
                                      }

                                      return isEditingRow ? (
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            disabled={isSavingRow}
                                            onClick={() => void saveEditingRow(row)}
                                          >
                                            {isSavingRow ? (
                                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                            ) : (
                                              <Save className="mr-1 h-3 w-3" />
                                            )}
                                            保存
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            disabled={isSavingRow}
                                            onClick={cancelEditingRow}
                                          >
                                            <X className="mr-1 h-3 w-3" />
                                            取消
                                          </Button>
                                        </div>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2 text-xs"
                                          disabled={savingRowKey !== null}
                                          onClick={() => startEditingRow(row)}
                                        >
                                          <Pencil className="mr-1 h-3 w-3" />
                                          编辑
                                        </Button>
                                      );
                                    })()}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Pagination */}
                    {tableData && (
                      <div className="flex flex-shrink-0 flex-col gap-3 border-t border-border/60 bg-background/80 px-6 pb-6 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            第 {currentPage + 1} / {Math.max(1, totalPages)} 页，共 {(tableData.totalCount || 0).toLocaleString()} 条
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">每页</span>
                            <Select
                              value={String(pageSize)}
                              onValueChange={(v) => handlePageSizeChange(Number(v))}
                            >
                              <SelectTrigger className="h-7 w-[80px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent side="top">
                                {PAGE_SIZE_OPTIONS.map((size) => (
                                  <SelectItem key={size} value={String(size)}>
                                    {size} 条
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 self-end lg:self-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={currentPage === 0}
                            onClick={() => handlePageChange(0)}
                          >
                            <ChevronsLeft className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={currentPage === 0}
                            onClick={() => handlePageChange(currentPage - 1)}
                          >
                            <ChevronLeft className="h-3 w-3" />
                          </Button>
                          <span className="text-xs text-muted-foreground mx-2">
                            {currentPage + 1} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={currentPage >= totalPages - 1}
                            onClick={() => handlePageChange(currentPage + 1)}
                          >
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={currentPage >= totalPages - 1}
                            onClick={() => handlePageChange(totalPages - 1)}
                          >
                            <ChevronsRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Table2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">双击表名查看数据</p>
            </div>
          </div>
        )}
      </div>

      <CreateTableDialog
        open={showCreateTable}
        onOpenChange={setShowCreateTable}
        onSuccess={handleCreateSuccess}
      />

      {deleteTableName && (
        <DeleteTableDialog
          open={!!deleteTableName}
          onOpenChange={(open) => !open && setDeleteTableName(null)}
          tableName={deleteTableName}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
