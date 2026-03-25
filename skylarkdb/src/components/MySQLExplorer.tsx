import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { MySQLTable, MySQLColumn, TableData } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Database, Table2, Search, Play, RefreshCw, ChevronRight, ChevronDown,
  Key, Hash, Type, Calendar, Zap, FileCode, ChevronLeft, ArrowLeft,
  Loader2, Plus, Edit2, Trash2
} from 'lucide-react';
import { DataEditForm } from './DataEditForm';
import { cn } from '@/utils/cn';
import { getMySQLTableData, executeMySQLQuery, getMySQLTables } from '@/utils/api';

const DEFAULT_PAGE_SIZE = 50;

interface TableCache {
  data: TableData;
  timestamp: number;
}

export function MySQLExplorer() {
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

  // Form editing states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingRow, setEditingRow] = useState<Record<string, any> | undefined>(undefined);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

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

  const loadTableData = useCallback(async (tableName: string, page: number, signal?: AbortSignal) => {
    if (!activeConnection.connection?.id) return;

    const cacheKey = `${tableName}-${page}-${pageSize}`;
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
        pageSize,
        page * pageSize
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
    if (viewingTable && activeConnection.connection?.id) {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      loadTableData(viewingTable, currentPage, controller.signal);
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [viewingTable, currentPage, activeConnection.connection?.id, loadTableData, pageSize]);

  const handleTableClick = useCallback((tableName: string) => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      setClickTimer(null);
    }

    const timer = setTimeout(() => {
      if (expandedTables.has(tableName)) {
        setExpandedTables(prev => {
          const next = new Set(prev);
          next.delete(tableName);
          return next;
        });
      } else {
        setExpandedTables(prev => new Set(prev).add(tableName));
        setSelectedTable(tableName);
        const mockColumns: Record<string, MySQLColumn[]> = {
          users: [
            { name: 'id', type: 'bigint(20)', nullable: false, default: null, extra: 'auto_increment' },
            { name: 'username', type: 'varchar(50)', nullable: false, default: null, extra: '' },
            { name: 'email', type: 'varchar(255)', nullable: false, default: null, extra: '' },
            { name: 'password_hash', type: 'varchar(255)', nullable: false, default: null, extra: '' },
            { name: 'created_at', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP', extra: '' },
            { name: 'updated_at', type: 'timestamp', nullable: true, default: null, extra: 'on update CURRENT_TIMESTAMP' },
          ],
          orders: [
            { name: 'id', type: 'bigint(20)', nullable: false, default: null, extra: 'auto_increment' },
            { name: 'user_id', type: 'bigint(20)', nullable: false, default: null, extra: '' },
            { name: 'total_amount', type: 'decimal(10,2)', nullable: false, default: '0.00', extra: '' },
            { name: 'status', type: 'varchar(20)', nullable: false, default: 'pending', extra: '' },
            { name: 'created_at', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP', extra: '' },
          ],
        };
        const columns = mockColumns[tableName] || [
          { name: 'id', type: 'bigint(20)', nullable: false, default: null, extra: 'auto_increment' },
          { name: 'name', type: 'varchar(255)', nullable: false, default: null, extra: '' },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP', extra: '' },
        ];
        setTableColumns(prev => new Map(prev).set(tableName, columns));
      }
    }, 200);

    setClickTimer(timer);
  }, [clickTimer, expandedTables]);

  const handleTableDoubleClick = useCallback((tableName: string) => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      setClickTimer(null);
    }

    setPendingTable(tableName);
    setViewingTable(tableName);
    setCurrentPage(0);
    // Don't clear tableData here, let the useEffect load new data
    setPendingTable(null);
  }, [clickTimer]);

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

  const handleExecuteQuery = useCallback(async () => {
    if (!query.trim() || !activeConnection.connection?.id) return;

    setLoading(true);
    try {
      const result = await executeMySQLQuery(activeConnection.connection.id, query);
      setTableData({
        columns: result.columns,
        rows: result.rows,
        totalCount: result.rows.length,
        executionTime: result.executionTime,
      });
      setViewingTable(null);
    } catch (error) {
      console.error('Query failed:', error);
    }
    setLoading(false);
  }, [query, activeConnection.connection?.id]);

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

  const handleFormSubmit = useCallback(async (data: Record<string, any>) => {
    if (!viewingTable || !activeConnection.connection?.id) return;

    try {
      // TODO: Implement actual API calls for insert/update
      console.log('Form submitted:', { mode: formMode, table: viewingTable, data });

      // For now, just reload the table data
      if (viewingTable) {
        await loadTableData(viewingTable, currentPage);
      }

      handleCloseForm();
    } catch (error) {
      console.error('Form submission failed:', error);
      throw error;
    }
  }, [viewingTable, activeConnection.connection?.id, formMode, currentPage, loadTableData, handleCloseForm]);

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
            <CardContent className="flex-1 overflow-hidden p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Loader2 className="h-8 w-8 text-mysql animate-spin" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : tableData && tableData.columns.length > 0 ? (
                <div className="h-full flex flex-col">
                  <div className="flex-1 min-h-0 overflow-auto">
                    <Table className="min-h-full">
                      <TableHeader className="bg-muted/50 sticky top-0 z-10">
                        <TableRow>
                          {tableData.columns.map((col) => (
                            <TableHead key={col} className="font-semibold text-xs whitespace-nowrap">
                              {col}
                            </TableHead>
                          ))}
                          <TableHead className="font-semibold text-xs whitespace-nowrap w-[100px] text-center">
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
          <>
            {/* Query Editor */}
            <Card className="shadow-card border-border/50 transition-all duration-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <FileCode className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-semibold">SQL 查询</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Zap className="h-3 w-3" />
                    <span>双击表名快速查看数据</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <textarea
                    placeholder="输入 SQL 查询语句..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleExecuteQuery();
                      }
                    }}
                    className="w-full min-h-[100px] p-3 rounded-lg border border-input bg-muted/30 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    spellCheck={false}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">MySQL 8.0</Badge>
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
              </CardContent>
            </Card>
          </>
        )}
      </div>

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