import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { useQueryStore, QueryHistoryItem } from '@/stores/queryStore';
import { MySQLTable, MySQLColumn, TableData, MySQLRoutine } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SqlEditor } from '@/components/SqlEditor';
import {
  Play,
  RefreshCw,
  Clock,
  Download,
  History,
  Plus,
  X,
  FileCode,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  Database,
  FolderPlus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { logError } from '@/utils/errorHandler';
import {
  executeMySQLQuery,
  getMySQLTables,
  getMySQLColumns,
  getMySQLRoutines,
  getMySQLDatabases,
  setMySQLDefaultDatabase,
} from '@/utils/api';
import { CreateDatabaseDialog } from '@/components/CreateDatabaseDialog';

export function SqlQueryPanel() {
  const { activeConnection, selectedDatabase, setSelectedDatabase } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;
  const {
    tabs,
    activeTabId,
    globalHistory,
    addTab,
    closeTab,
    setActiveTabId,
    updateTab,
    addToHistory,
    clearHistory,
  } = useQueryStore();

  const [showHistory, setShowHistory] = useState(false);
  const [databases, setDatabases] = useState<string[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [tables, setTables] = useState<MySQLTable[]>([]);
  const [tableColumns, setTableColumns] = useState<Map<string, MySQLColumn[]>>(new Map());
  const [routines, setRoutines] = useState<MySQLRoutine[]>([]);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showCreateDatabase, setShowCreateDatabase] = useState(false);

  const loadingRef = useRef(false);
  const currentDatabase = selectedDatabase || activeConnection.connection?.database || null;

  const loadDatabases = useCallback(async () => {
    const connectionId = activeConnection.connection?.id;
    if (!connectionId) return;

    setLoadingDatabases(true);
    try {
      const dbs = await getMySQLDatabases(connectionId);
      setDatabases(dbs);

      if (!currentDatabase && dbs.length === 1) {
        setSelectedDatabase(dbs[0]);
      }
    } catch (error) {
      logError('SQL Panel - Load Databases', error);
      setDatabases([]);
    } finally {
      setLoadingDatabases(false);
    }
  }, [activeConnection.connection?.id, currentDatabase, setSelectedDatabase]);

  const loadSchema = useCallback(async () => {
    const connectionId = activeConnection.connection?.id;
    if (!connectionId) return;

    if (!currentDatabase) {
      setTables([]);
      setTableColumns(new Map());
      setRoutines([]);
      return;
    }

    try {
      await setMySQLDefaultDatabase(connectionId, currentDatabase);

      const [tablesData, routinesData] = await Promise.all([
        getMySQLTables(connectionId, currentDatabase),
        getMySQLRoutines(connectionId),
      ]);
      setTables(tablesData);
      setRoutines(routinesData);

      const columnsMap = new Map<string, MySQLColumn[]>();
      for (const table of tablesData) {
        try {
          const cols = await getMySQLColumns(connectionId, table.name);
          columnsMap.set(table.name, cols);
        } catch (e) {
          logError('SQL Panel - Load Table Columns', e, { tableName: table.name });
        }
      }
      setTableColumns(columnsMap);
    } catch (error) {
      logError('SQL Panel - Load Schema', error);
    }
  }, [activeConnection.connection?.id, currentDatabase]);

  useEffect(() => {
    if (activeConnection.status === 'connected' && activeConnection.connection?.id) {
      loadDatabases();
      loadSchema();
    } else {
      setDatabases([]);
      setTables([]);
      setTableColumns(new Map());
      setRoutines([]);
    }
  }, [activeConnection.status, activeConnection.connection?.id, loadDatabases, loadSchema]);

  const activeTab = useMemo(() => {
    return tabs.find(t => t.id === activeTabId) || tabs[0];
  }, [tabs, activeTabId]);

  const executeQuery = useCallback(async () => {
    if (
      !activeConnection.connection?.id ||
      !activeTab ||
      !activeTab.query.trim() ||
      loadingRef.current
    )
      return;

    loadingRef.current = true;
    updateTab(activeTab.id, { isExecuting: true, error: null });

    try {
      if (currentDatabase) {
        await setMySQLDefaultDatabase(activeConnection.connection.id, currentDatabase);
      }

      const result = await executeMySQLQuery(activeConnection.connection.id, activeTab.query);

      const tableData: TableData = {
        columns: result.columns,
        rows: result.rows,
        totalCount: result.rows.length,
        executionTime: result.executionTime,
        affectedRows: result.affectedRows,
      };

      updateTab(activeTab.id, {
        result: tableData,
        isExecuting: false,
      });

      const historyItem: QueryHistoryItem = {
        query: activeTab.query,
        timestamp: Date.now(),
        executionTime: result.executionTime,
        rowCount: result.rows.length,
      };

      addToHistory(historyItem);
      setSortColumn(null);
      setSortDirection('asc');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      updateTab(activeTab.id, {
        error: errorMsg,
        isExecuting: false,
        result: null,
      });
    } finally {
      loadingRef.current = false;
    }
  }, [activeConnection.connection?.id, activeTab, updateTab, addToHistory, currentDatabase]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        executeQuery();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        addTab();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTab) closeTab(activeTab.id);
      }
    },
    [executeQuery, addTab, closeTab, activeTab]
  );

  const sortedRows = useMemo(() => {
    if (!activeTab?.result?.rows || !sortColumn) return activeTab?.result?.rows || [];

    return [...activeTab.result.rows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let cmp = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [activeTab?.result?.rows, sortColumn, sortDirection]);

  const handleSort = useCallback(
    (column: string) => {
      if (sortColumn === column) {
        setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    },
    [sortColumn]
  );

  const exportResults = useCallback(
    (format: 'csv' | 'json') => {
      if (!activeTab?.result) return;

      const result = activeTab.result;
      let content: string;
      let filename: string;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');

      if (format === 'json') {
        content = JSON.stringify(result.rows, null, 2);
        filename = `query_result_${timestamp}.json`;
      } else {
        const headers = result.columns.join(',');
        const rows = result.rows.map(row =>
          result.columns
            .map(col => {
              const val = row[col];
              if (val === null || val === undefined) return '';
              const str = String(val);
              return str.includes(',') || str.includes('"') || str.includes('\n')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
            })
            .join(',')
        );
        content = [headers, ...rows].join('\n');
        filename = `query_result_${timestamp}.csv`;
      }

      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/csv',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [activeTab?.result]
  );

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      // 尝试使用现代剪贴板 API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // 回退到旧的 execCommand 方法
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (error) {
      console.error('复制失败:', error);
      alert('复制失败，请手动复制');
    }
  }, []);

  const handleUseHistoryItem = useCallback(
    (query: string) => {
      if (activeTab) {
        updateTab(activeTab.id, { query });
      }
      setShowHistory(false);
    },
    [activeTab, updateTab]
  );

  const hasResultSet = !!activeTab?.result && activeTab.result.columns.length > 0;
  const resultTitle = hasResultSet ? '查询结果' : '执行结果';
  const resultDescription = hasResultSet
    ? '支持表头排序与结果导出'
    : '语句已执行，当前操作没有返回结果集';
  const hasExecutionFeedback = !!activeTab?.result || !!activeTab?.error;
  const editorMinHeightClass = hasExecutionFeedback ? 'min-h-[160px]' : 'min-h-[260px]';
  const editorHeight = hasExecutionFeedback ? '160px' : '240px';

  if (activeConnection.status !== 'connected') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-mysql/20 blur-3xl rounded-full" />
            <Database className="h-20 w-20 mx-auto text-mysql/50 relative" />
          </div>
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">等待连接</h3>
          <p className="text-sm text-muted-foreground/70">
            请先连接 MySQL 数据库以使用 SQL 查询功能
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 p-3" onKeyDown={handleKeyDown}>
      <Card className="flex-shrink-0 overflow-hidden border-border/60 shadow-card">
        <CardHeader className="border-b bg-gradient-to-r from-muted/35 via-background to-background pb-2 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/15">
                  <FileCode className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">SQL 工作台</CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    面向当前连接的即席查询、结构补全与结果导出
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="h-6 px-2.5 text-[11px] bg-background/80">
                  连接 {activeConnection.connection?.name || '未命名连接'}
                </Badge>
                <Badge variant="secondary" className="h-6 px-2.5 text-[11px] text-muted-foreground">
                  Cmd/Ctrl + Enter 执行
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant={showHistory ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="h-7 text-xs"
              >
                <History className="h-3.5 w-3.5 mr-1.5" />
                历史
                {globalHistory.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                    {globalHistory.length}
                  </Badge>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={loadSchema} className="h-7 text-xs">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                刷新结构
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <ScrollArea className="flex-1">
              <div className="flex items-center gap-2 pb-1">
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    className={cn(
                      'group flex items-center gap-1.5 px-3 py-2 rounded-full text-xs cursor-pointer transition-all border',
                      activeTabId === tab.id
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background/80 border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
                    )}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <span className="max-w-[110px] truncate font-medium">{tab.name}</span>
                    {tabs.length > 1 && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          closeTab(tab.id);
                        }}
                        className={cn(
                          'p-0.5 rounded-full transition-colors',
                          activeTabId === tab.id
                            ? 'hover:bg-primary-foreground/20'
                            : 'hover:bg-muted'
                        )}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addTab}
                  className="flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-border/80 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  title="新建查询 (Cmd/Ctrl + T)"
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </ScrollArea>
          </div>
        </CardHeader>

        <CardContent className="p-3">
          <div className="space-y-3 rounded-2xl border border-border/60 bg-gradient-to-b from-muted/20 via-background to-background p-3">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    数据库
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={currentDatabase || undefined}
                      onValueChange={setSelectedDatabase}
                      disabled={loadingDatabases || databases.length === 0}
                    >
                      <SelectTrigger className="h-9 min-w-[220px] text-sm bg-background">
                        <SelectValue
                          placeholder={loadingDatabases ? '加载数据库...' : '选择数据库'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {databases.map(database => (
                          <SelectItem key={database} value={database}>
                            {database}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      title="新建数据库"
                      disabled={isReadOnly || loadingDatabases || !activeConnection.connection?.id}
                      onClick={() => setShowCreateDatabase(true)}
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pb-0.5">
                  {!currentDatabase && (
                    <Badge variant="destructive" className="h-6 px-2.5 text-[11px]">
                      未选择数据库
                    </Badge>
                  )}
                  <Badge variant="secondary" className="h-6 px-2.5 text-[11px]">
                    {tables.length} 张表
                  </Badge>
                </div>
              </div>

              <Button
                onClick={executeQuery}
                disabled={activeTab?.isExecuting || !activeTab?.query.trim()}
                size="sm"
                className="h-9 px-4 bg-mysql hover:bg-mysql/90 shadow-sm"
              >
                {activeTab?.isExecuting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                执行查询
              </Button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
              <div className="flex items-center justify-between border-b bg-muted/25 px-4 py-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary/80" />
                  当前语句
                </div>
                <span className="text-xs text-muted-foreground">自动补全已启用</span>
              </div>
              <div className="p-2.5">
                <SqlEditor
                  value={activeTab?.query || ''}
                  onChange={value => updateTab(activeTab.id, { query: value })}
                  onExecute={executeQuery}
                  tables={tables}
                  tableColumns={tableColumns}
                  routines={routines}
                  placeholder="输入 SQL 查询语句... (Cmd/Ctrl + Enter 执行)"
                  className={editorMinHeightClass}
                  height={editorHeight}
                  minHeight={editorHeight}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {showHistory && (
        <Card className="shadow-card border-border/60 max-h-[260px]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">查询历史</CardTitle>
              {globalHistory.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearHistory}
                  className="h-7 text-xs text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  清空
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[200px]">
              {globalHistory.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  暂无查询历史
                </div>
              ) : (
                <div className="divide-y">
                  {globalHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleUseHistoryItem(item.query)}
                    >
                      <div className="flex-1 min-w-0">
                        <code className="text-xs font-mono line-clamp-2 break-all">
                          {item.query}
                        </code>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span>{new Date(item.timestamp).toLocaleString()}</span>
                          <span>{item.executionTime.toFixed(3)}s</span>
                          {item.rowCount !== undefined && <span>{item.rowCount} 行</span>}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={e => {
                          e.stopPropagation();
                          copyToClipboard(item.query);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {activeTab?.error && (
        <Card className="shadow-card border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">查询执行失败</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                  {activeTab.error}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => updateTab(activeTab.id, { error: null })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab?.result && (
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/60 shadow-card">
          <CardHeader className="flex-shrink-0 border-b bg-gradient-to-r from-background to-muted/20 pb-3 pt-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-green-500/10 ring-1 ring-green-500/15">
                  <Clock className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">{resultTitle}</CardTitle>
                  <p className="text-[11px] text-muted-foreground">{resultDescription}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  {hasResultSet ? (
                    <Badge variant="secondary" className="font-mono h-7 px-3">
                      {activeTab.result.rows.length} 行
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="font-mono h-7 px-3">
                      无结果集
                    </Badge>
                  )}
                  <Badge variant="outline" className="h-7 px-3 font-mono">
                    {activeTab.result.executionTime.toFixed(3)}s
                  </Badge>
                  {activeTab.result.affectedRows !== undefined && (
                    <Badge variant="outline" className="h-7 px-3 text-amber-600">
                      影响 {activeTab.result.affectedRows} 行
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportResults('json')}
                    className="h-7 text-xs"
                    title="导出为 JSON"
                    disabled={!hasResultSet}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    JSON
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportResults('csv')}
                    className="h-7 text-xs"
                    title="导出为 CSV"
                    disabled={!hasResultSet}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    CSV
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-hidden p-0 min-h-0">
            {activeTab.result!.columns.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                执行成功，无返回数据
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <div className="min-w-full">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                      <TableRow>
                        {activeTab.result!.columns.map(col => (
                          <TableHead
                            key={col}
                            className="font-semibold text-xs whitespace-nowrap cursor-pointer hover:bg-muted transition-colors select-none"
                            onClick={() => handleSort(col)}
                          >
                            <div className="flex items-center gap-1">
                              <span>{col}</span>
                              {sortColumn === col &&
                                (sortDirection === 'asc' ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                ))}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRows.map((row, idx) => (
                        <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                          {activeTab.result!.columns.map(col => (
                            <TableCell key={col} className="text-sm font-mono max-w-[300px]">
                              <div
                                className="truncate"
                                title={row[col] !== null ? String(row[col]) : 'NULL'}
                              >
                                {row[col] === null ? (
                                  <span className="text-muted-foreground italic">NULL</span>
                                ) : typeof row[col] === 'object' ? (
                                  JSON.stringify(row[col])
                                ) : (
                                  String(row[col])
                                )}
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!activeTab?.result && !activeTab?.error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileCode className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">输入 SQL 语句并点击执行</p>
            <p className="text-xs mt-1 opacity-70">支持多标签页查询，Cmd/Ctrl + T 新建标签</p>
          </div>
        </div>
      )}

      <CreateDatabaseDialog
        open={showCreateDatabase}
        onOpenChange={setShowCreateDatabase}
        onSuccess={dbName => {
          void loadDatabases();
          setSelectedDatabase(dbName);
        }}
      />
    </div>
  );
}
