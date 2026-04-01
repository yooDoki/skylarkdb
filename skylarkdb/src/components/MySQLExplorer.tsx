import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { MySQLColumn, MySQLTable, TableData } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Database,
  Table2,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeft,
  Loader2,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  Trash2,
  KeyRound,
  Pencil,
  Save,
  X,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  getMySQLColumns,
  getMySQLTableData,
  getMySQLTables,
  getMySQLDatabases,
  setMySQLDefaultDatabase,
  updateMySQLRecord,
  dropMySQLColumn,
  insertMySQLRecord,
  deleteMySQLRecord,
} from '@/utils/api';
import { CreateTableDialog } from '@/components/CreateTableDialog';
import { CreateDatabaseDialog } from '@/components/CreateDatabaseDialog';
import { DeleteTableDialog } from '@/components/DeleteTableDialog';
import { AddColumnDialog } from '@/components/AddColumnDialog';
import { ImportDataDialog } from '@/components/ImportDataDialog';

const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [15, 25, 50, 100, 200];

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
  const isReadOnly = !!activeConnection.connection?.readOnly;
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
  const [showCreateDatabase, setShowCreateDatabase] = useState(false);
  const [deleteTableName, setDeleteTableName] = useState<string | null>(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showImportData, setShowImportData] = useState(false);
  const [dropColumnInfo, setDropColumnInfo] = useState<{
    tableName: string;
    columnName: string;
  } | null>(null);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [editingFocusColumn, setEditingFocusColumn] = useState<string | null>(null);
  const [showInsertRow, setShowInsertRow] = useState(false);
  const [insertingRow, setInsertingRow] = useState(false);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});

  const tableCache = useRef<Map<string, TableCache>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const editingRowData = useRef<TableRow | null>(null);
  const saveEditingRowRef = useRef<(row: TableRow) => Promise<void>>();
  const tableListRef = useRef<HTMLDivElement>(null);

  const CACHE_TIMEOUT = 5 * 60 * 1000;

  const loadDatabases = useCallback(
    async (connectionId: string) => {
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
    },
    [selectedDatabase, activeConnection.connection?.database, setSelectedDatabase]
  );

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
    if (
      activeConnection.status === 'connected' &&
      selectedDatabase &&
      activeConnection.connection?.id
    ) {
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

  const loadTableColumns = useCallback(
    async (tableName: string) => {
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
    },
    [activeConnection.connection?.id, tableColumns]
  );

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
  }, [
    activeConnection.connection?.id,
    selectedDatabase,
    loadTables,
    viewingTable,
    deleteTableName,
  ]);

  const loadTableData = useCallback(
    async (tableName: string, page: number, signal?: AbortSignal, requestedPageSize?: number) => {
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
    },
    [activeConnection.connection?.id, pageSize]
  );

  const handleAddColumnSuccess = useCallback(() => {
    if (viewingTable) {
      setTableColumns(prev => {
        const next = new Map(prev);
        next.delete(viewingTable);
        return next;
      });
      tableCache.current.clear();
      if (activeConnection.connection?.id) {
        loadTableColumns(viewingTable);
        loadTableData(viewingTable, currentPage);
      }
    }
  }, [viewingTable, currentPage, activeConnection.connection?.id, loadTableColumns, loadTableData]);

  const handleDropColumnSuccess = useCallback(() => {
    if (viewingTable) {
      setTableColumns(prev => {
        const next = new Map(prev);
        next.delete(viewingTable);
        return next;
      });
      tableCache.current.clear();
      if (activeConnection.connection?.id) {
        loadTableColumns(viewingTable);
        loadTableData(viewingTable, currentPage);
      }
    }
    setDropColumnInfo(null);
  }, [viewingTable, currentPage, activeConnection.connection?.id, loadTableColumns, loadTableData]);

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
    setEditingFocusColumn(null);
    editingRowData.current = null;
  }, [viewingTable, currentPage]);

  const currentTableColumns = useMemo(
    () => (viewingTable ? (tableColumns.get(viewingTable) ?? []) : []),
    [tableColumns, viewingTable]
  );

  const primaryKeyColumns = useMemo(
    () => currentTableColumns.filter(column => column.isPrimaryKey),
    [currentTableColumns]
  );

  const editableColumns = useMemo(
    () =>
      currentTableColumns.filter(
        column => !column.isPrimaryKey && !column.isBlob && !column.isBit && !column.isGeometry
      ),
    [currentTableColumns]
  );

  const insertableColumns = useMemo(
    () =>
      currentTableColumns.filter(column => {
        const extra = column.extra.toLowerCase();
        return (
          !column.isBlob && !column.isBit && !column.isGeometry && !extra.includes('generated')
        );
      }),
    [currentTableColumns]
  );
  const requiredInsertColumnsCount = useMemo(
    () =>
      insertableColumns.filter(column => {
        const extra = column.extra.toLowerCase();
        const isAutoIncrement = extra.includes('auto_increment');
        const hasServerDefault = column.default !== null || extra.includes('default_generated');
        return !column.nullable && !isAutoIncrement && !hasServerDefault;
      }).length,
    [insertableColumns]
  );

  const canUpdateRows = !isReadOnly && primaryKeyColumns.length > 0 && editableColumns.length > 0;
  const canDeleteRows = !isReadOnly && primaryKeyColumns.length > 0;
  const canInsertRows = !isReadOnly && insertableColumns.length > 0;
  const hasRowActions = canUpdateRows || canDeleteRows;

  const getRowLocator = useCallback(
    (row: TableRow) => {
      if (primaryKeyColumns.length === 0) return null;
      const locator: Record<string, unknown> = {};
      for (const column of primaryKeyColumns) {
        const value = row[column.name];
        if (value === undefined) {
          return null;
        }
        locator[column.name] = value;
      }
      return locator;
    },
    [primaryKeyColumns]
  );

  const makeRowKey = useCallback(
    (row: TableRow) => {
      const locator = getRowLocator(row);
      if (!locator) return null;
      return JSON.stringify(locator);
    },
    [getRowLocator]
  );

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
    const boolLike =
      type === 'boolean' || type === 'bool' || (type === 'tinyint' && column.maxLength === '1');

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

  const startEditingRow = useCallback(
    (row: TableRow, focusColumn?: string) => {
      const rowKey = makeRowKey(row);
      if (!rowKey) return;

      const nextValues: Record<string, string> = {};
      editableColumns.forEach(column => {
        nextValues[column.name] = serializeEditorValue(row[column.name]);
      });

      editingRowData.current = row;
      setEditingRowKey(rowKey);
      setEditingValues(nextValues);
      setEditingFocusColumn(
        focusColumn && editableColumns.some(c => c.name === focusColumn) ? focusColumn : null
      );
      setEditMessage(null);
    },
    [editableColumns, makeRowKey, serializeEditorValue]
  );

  const cancelEditingRow = useCallback(() => {
    setEditingRowKey(null);
    setEditingValues({});
    setSavingRowKey(null);
    setEditMessage(null);
    setEditingFocusColumn(null);
    editingRowData.current = null;
  }, []);

  const handleEditValueChange = useCallback((columnName: string, value: string) => {
    setEditingValues(prev => ({ ...prev, [columnName]: value }));
  }, []);

  const handleInsertValueChange = useCallback((columnName: string, value: string) => {
    setInsertValues(prev => ({ ...prev, [columnName]: value }));
  }, []);

  const saveEditingRow = useCallback(
    async (row: TableRow) => {
      if (!activeConnection.connection?.id || !viewingTable) return;

      const rowKey = makeRowKey(row);
      if (!rowKey) return;
      const recordLocator = getRowLocator(row);
      if (!recordLocator) return;

      const nextChanges: Record<string, unknown> = {};

      try {
        editableColumns.forEach(column => {
          const nextValue = parseEditedValue(
            editingValues[column.name] ?? serializeEditorValue(row[column.name]),
            column
          );
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
          recordLocator
        );
        tableCache.current.clear();
        setEditingRowKey(null);
        setEditingValues({});
        setEditingFocusColumn(null);
        editingRowData.current = null;
        setEditMessage({
          type: 'success',
          text: `已保存记录修改（${Object.entries(recordLocator)
            .map(([key, value]) => `${key}=${serializeEditorValue(value)}`)
            .join(', ')}）`,
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
    },
    [
      activeConnection.connection?.id,
      currentPage,
      editableColumns,
      editingValues,
      getRowLocator,
      loadTableData,
      makeRowKey,
      normalizeCompareValue,
      parseEditedValue,
      serializeEditorValue,
      viewingTable,
    ]
  );

  const resetInsertDialog = useCallback(() => {
    setShowInsertRow(false);
    setInsertValues({});
    setInsertingRow(false);
  }, []);

  const saveInsertedRow = useCallback(async () => {
    if (!activeConnection.connection?.id || !viewingTable) return;

    const payload: Record<string, unknown> = {};
    try {
      insertableColumns.forEach(column => {
        const rawValue = insertValues[column.name] ?? '';
        const trimmed = rawValue.trim();
        const extra = column.extra.toLowerCase();
        const isAutoIncrement = extra.includes('auto_increment');
        const hasServerDefault = column.default !== null || extra.includes('default_generated');
        const isRequired = !column.nullable && !isAutoIncrement && !hasServerDefault;

        if (trimmed === '') {
          if (isRequired) {
            throw new Error(`列「${column.name}」为必填项`);
          }
          return;
        }

        payload[column.name] = parseEditedValue(rawValue, column);
      });
    } catch (error) {
      setEditMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '新增记录校验失败',
      });
      return;
    }

    setInsertingRow(true);
    setEditMessage(null);
    try {
      await insertMySQLRecord(activeConnection.connection.id, viewingTable, payload);
      tableCache.current.clear();
      setEditMessage({
        type: 'success',
        text: '已新增一行记录',
      });
      resetInsertDialog();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      await loadTableData(viewingTable, currentPage, controller.signal);
    } catch (error) {
      setEditMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '新增记录失败',
      });
      setInsertingRow(false);
    }
  }, [
    activeConnection.connection?.id,
    currentPage,
    insertValues,
    insertableColumns,
    loadTableData,
    parseEditedValue,
    resetInsertDialog,
    viewingTable,
  ]);

  const handleDeleteRow = useCallback(
    async (row: TableRow) => {
      if (!activeConnection.connection?.id || !viewingTable) return;
      const recordLocator = getRowLocator(row);
      if (!recordLocator) {
        setEditMessage({
          type: 'error',
          text: '未找到用于删除该记录的主键定位信息',
        });
        return;
      }

      const locatorText = Object.entries(recordLocator)
        .map(([key, value]) => `${key}=${serializeEditorValue(value)}`)
        .join(', ');
      if (!confirm(`确定要删除这条记录吗？\n${locatorText}`)) {
        return;
      }

      const rowKey = makeRowKey(row);
      setSavingRowKey(rowKey);
      setEditMessage(null);
      try {
        await deleteMySQLRecord(activeConnection.connection.id, viewingTable, recordLocator);
        tableCache.current.clear();
        if (editingRowKey === rowKey) {
          cancelEditingRow();
        }
        setEditMessage({
          type: 'success',
          text: `已删除记录（${locatorText}）`,
        });
        const controller = new AbortController();
        abortControllerRef.current = controller;
        await loadTableData(viewingTable, currentPage, controller.signal);
      } catch (error) {
        setEditMessage({
          type: 'error',
          text: error instanceof Error ? error.message : '删除记录失败',
        });
      } finally {
        setSavingRowKey(null);
      }
    },
    [
      activeConnection.connection?.id,
      cancelEditingRow,
      currentPage,
      editingRowKey,
      getRowLocator,
      loadTableData,
      makeRowKey,
      serializeEditorValue,
      viewingTable,
    ]
  );

  // Keep ref in sync for keyboard shortcut access
  saveEditingRowRef.current = saveEditingRow;

  // Keyboard shortcuts: ESC cancel, Ctrl/Cmd+Enter save
  useEffect(() => {
    if (!editingRowKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelEditingRow();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (editingRowData.current) {
          void saveEditingRowRef.current!(editingRowData.current);
        }
        return;
      }

      // Enter - save (only when not in an Input/textarea; Input handles its own Enter)
      if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          e.stopPropagation();
          if (editingRowData.current) {
            void saveEditingRowRef.current!(editingRowData.current);
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [editingRowKey, cancelEditingRow]);

  // Auto-focus the editing column input (without scrolling)
  useEffect(() => {
    if (editingFocusColumn && editingRowKey) {
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLInputElement>(
          `input[data-edit-col="${editingFocusColumn}"]`
        );
        input?.focus({ preventScroll: true });
        input?.select();
      });
    }
  }, [editingFocusColumn, editingRowKey]);

  // Auto-scroll selected table into view
  useEffect(() => {
    if (viewingTable && tableListRef.current) {
      requestAnimationFrame(() => {
        const selectedButton = tableListRef.current?.querySelector(
          `[data-table-name="${viewingTable}"]`
        );
        if (selectedButton) {
          selectedButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  }, [viewingTable]);

  const handleTableClick = useCallback(
    (tableName: string) => {
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
    },
    [clickTimer, loadTableColumns, loadingColumns, tableColumns]
  );

  const handleTableDoubleClick = useCallback(
    (tableName: string) => {
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
    },
    [clickTimer, pendingTable, loadTableData]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (!viewingTable) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setCurrentPage(newPage);
      loadTableData(viewingTable, newPage, controller.signal);
    },
    [viewingTable, loadTableData]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      if (!viewingTable) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setPageSize(newPageSize);
      setCurrentPage(0);
      loadTableData(viewingTable, 0, controller.signal, newPageSize);
    },
    [viewingTable, loadTableData]
  );

  const filteredTables = useMemo(() => {
    if (!searchTerm.trim()) return tables;
    const term = searchTerm.toLowerCase();
    return tables.filter(table => table.name.toLowerCase().includes(term));
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
        <span
          className="inline-block min-w-max font-mono text-xs text-foreground/90"
          title={serializedValue}
        >
          {serializedValue}
        </span>
      );
    }

    const strValue = String(value);
    return (
      <span
        className="inline-block min-w-max font-mono text-xs text-foreground/90"
        title={strValue}
      >
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
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setShowCreateDatabase(true)}
                  disabled={isReadOnly || loadingDatabases}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  新建数据库
                </Button>
                <Badge variant="secondary" className="text-xs shadow-sm">
                  {databases.length}
                </Badge>
              </div>
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
                {databases.map(db => (
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
      <Card className="flex w-72 min-h-0 flex-shrink-0 flex-col overflow-hidden border-border/60 bg-card/90 shadow-card backdrop-blur-sm">
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
              onChange={e => setSearchTerm(e.target.value)}
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
              disabled={isReadOnly}
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
        <div
          ref={tableListRef}
          className="min-h-0 flex-1 overflow-auto px-4 py-4"
          style={
            {
              scrollbarWidth: 'thin',
              scrollbarColor: 'hsl(var(--muted-foreground) / 0.3) transparent',
            } as React.CSSProperties
          }
        >
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
              filteredTables.map(table => (
                <div key={`${table.schema}-${table.name}`} className="transition-all duration-150">
                  <button
                    data-table-name={table.name}
                    onClick={() => handleTableClick(table.name)}
                    onDoubleClick={() => handleTableDoubleClick(table.name)}
                    className={cn(
                      'group w-full flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all',
                      viewingTable === table.name
                        ? 'border-primary/25 bg-primary/[0.08] text-primary shadow-sm'
                        : 'border-transparent hover:border-border/70 hover:bg-muted/60'
                    )}
                  >
                    {expandedTables.has(table.name) ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    )}
                    <Table2
                      className={cn(
                        'h-3.5 w-3.5 flex-shrink-0 transition-colors',
                        viewingTable === table.name
                          ? 'text-primary'
                          : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    <span className="text-xs truncate flex-1" title={table.name}>
                      {table.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'h-5 px-1.5 text-[10px] font-medium',
                        viewingTable === table.name
                          ? 'border-primary/20 bg-primary/10 text-primary'
                          : 'border-border/70 bg-background/70 text-muted-foreground'
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
                          {tableColumns.get(table.name)!.map(column => (
                            <div
                              key={`${table.name}-${column.name}`}
                              className="group/column flex items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-background/70"
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
                                  <span
                                    className="truncate text-[11px] font-medium text-foreground"
                                    title={column.name}
                                  >
                                    {column.name}
                                  </span>
                                  {column.isPrimaryKey && (
                                    <Badge
                                      variant="outline"
                                      className="h-4 px-1 text-[9px] uppercase border-amber-200 bg-amber-50 text-amber-700"
                                    >
                                      PK
                                    </Badge>
                                  )}
                                  {!column.nullable && (
                                    <Badge
                                      variant="outline"
                                      className="h-4 px-1 text-[9px] uppercase"
                                    >
                                      NN
                                    </Badge>
                                  )}
                                  {column.extra.includes('auto_increment') && (
                                    <Badge
                                      variant="secondary"
                                      className="h-4 px-1 text-[9px] uppercase"
                                    >
                                      AI
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground">
                                  {column.fullType}
                                </div>
                              </div>
                              <button
                                className="flex-shrink-0 rounded p-0.5 opacity-0 transition-colors group-hover/column:opacity-100 hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
                                title={`删除列 ${column.name}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  setDropColumnInfo({
                                    tableName: table.name,
                                    columnName: column.name,
                                  });
                                }}
                                disabled={isReadOnly}
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-1 py-2 text-xs text-muted-foreground">暂无字段信息</div>
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
                      <CardTitle className="truncate text-sm font-semibold">
                        {viewingTable}
                      </CardTitle>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {tableData && (
                          <>
                            <span>共 {tableData.totalCount.toLocaleString()} 条记录</span>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <span>{tableData.columns.length} 列</span>
                          </>
                        )}
                        {isReadOnly && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <span>当前连接为只读模式</span>
                          </>
                        )}
                        {currentTableColumns.length > 0 && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            {canUpdateRows ? (
                              <span>支持行内编辑</span>
                            ) : primaryKeyColumns.length > 0 ? (
                              <span>没有可直接编辑的普通列</span>
                            ) : (
                              <span>无主键，暂不支持编辑或删除</span>
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
                      className="h-7"
                      onClick={() => setShowInsertRow(true)}
                      disabled={!canInsertRows}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      新增行
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => setShowImportData(true)}
                      disabled={isReadOnly}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      导入数据
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => setShowAddColumn(true)}
                      disabled={isReadOnly}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      新增列
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTableName(viewingTable)}
                      disabled={isReadOnly}
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
                    {(editMessage ||
                      currentTableColumns.length > 0 ||
                      loadingColumns.has(viewingTable)) && (
                      <div className="px-6 pt-4">
                        {editMessage && (
                          <div
                            className={cn(
                              'mb-3 rounded-lg border px-3 py-2 text-xs',
                              editMessage.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-destructive/30 bg-destructive/5 text-destructive'
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
                        ) : (
                          currentTableColumns.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="h-6 px-2.5">
                                {primaryKeyColumns.length > 0
                                  ? `主键: ${primaryKeyColumns.map(column => column.name).join(', ')}`
                                  : '未检测到主键'}
                              </Badge>
                              {canUpdateRows ? (
                                <span>
                                  双击单元格或点击"编辑"修改，
                                  <kbd className="rounded border px-1 font-mono text-[10px]">
                                    Tab
                                  </kbd>{' '}
                                  切换单元格，
                                  <kbd className="rounded border px-1 font-mono text-[10px]">
                                    Enter
                                  </kbd>{' '}
                                  保存，
                                  <kbd className="rounded border px-1 font-mono text-[10px]">
                                    Esc
                                  </kbd>{' '}
                                  取消，输入 <code className="font-mono text-[10px]">NULL</code>{' '}
                                  可置空。
                                </span>
                              ) : primaryKeyColumns.length > 0 ? (
                                <span>当前表没有可安全编辑的普通列。</span>
                              ) : (
                                <span>当前表没有主键，无法安全定位记录，暂未开放编辑和删除。</span>
                              )}
                            </div>
                          )
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
                              {hasRowActions && (
                                <TableHead className="sticky right-0 top-0 z-20 h-10 whitespace-nowrap border-b border-border/80 bg-background/95 text-xs font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/80">
                                  操作
                                </TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tableData.rows.map((row, rowIdx) => (
                              <TableRow
                                key={rowIdx}
                                className="odd:bg-muted/[0.18] hover:bg-primary/[0.05]"
                              >
                                {tableData.columns.map((col, cellIdx) => {
                                  const rowKey = makeRowKey(row);
                                  const isEditingRow = !!rowKey && editingRowKey === rowKey;
                                  const columnMeta = currentTableColumns.find(
                                    column => column.name === col
                                  );
                                  const canEditCell =
                                    isEditingRow &&
                                    columnMeta &&
                                    !columnMeta.isPrimaryKey &&
                                    !columnMeta.isBlob &&
                                    !columnMeta.isBit &&
                                    !columnMeta.isGeometry;
                                  const isDoubleClickEditable =
                                    !isEditingRow &&
                                    canUpdateRows &&
                                    rowKey &&
                                    columnMeta &&
                                    !columnMeta.isPrimaryKey &&
                                    !columnMeta.isBlob &&
                                    !columnMeta.isBit &&
                                    !columnMeta.isGeometry;

                                  const handleInputKeyDown = (
                                    e: React.KeyboardEvent<HTMLInputElement>
                                  ) => {
                                    if (e.key === 'Tab') {
                                      e.preventDefault();
                                      const cols = editableColumns.map(c => c.name);
                                      const currentIdx = cols.indexOf(col);
                                      if (e.shiftKey) {
                                        if (currentIdx > 0)
                                          setEditingFocusColumn(cols[currentIdx - 1]);
                                      } else {
                                        if (currentIdx < cols.length - 1) {
                                          setEditingFocusColumn(cols[currentIdx + 1]);
                                        } else if (editingRowData.current) {
                                          void saveEditingRowRef.current!(editingRowData.current);
                                        }
                                      }
                                    }
                                    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (editingRowData.current) {
                                        void saveEditingRowRef.current!(editingRowData.current);
                                      }
                                    }
                                  };

                                  return (
                                    <TableCell
                                      key={cellIdx}
                                      className={cn(
                                        'min-w-[160px] whitespace-nowrap border-border/40 py-3 text-xs align-top',
                                        isDoubleClickEditable &&
                                          'cursor-pointer hover:bg-primary/[0.08] transition-colors'
                                      )}
                                      onDoubleClick={() => {
                                        if (isDoubleClickEditable) {
                                          startEditingRow(row, col);
                                        }
                                      }}
                                    >
                                      {canEditCell ? (
                                        <Input
                                          data-edit-col={col}
                                          value={editingValues[col] ?? ''}
                                          onChange={event =>
                                            handleEditValueChange(col, event.target.value)
                                          }
                                          onKeyDown={handleInputKeyDown}
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
                                {hasRowActions && (
                                  <TableCell className="sticky right-0 z-10 border-l border-border/40 bg-background/95 py-2 text-xs backdrop-blur supports-[backdrop-filter]:bg-background/85">
                                    {(() => {
                                      const rowKey = makeRowKey(row);
                                      const isEditingRow = !!rowKey && editingRowKey === rowKey;
                                      const isSavingRow = !!rowKey && savingRowKey === rowKey;

                                      if (!rowKey) {
                                        return (
                                          <span className="text-muted-foreground">不可操作</span>
                                        );
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
                                          {canDeleteRows && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                              disabled={isSavingRow}
                                              onClick={() => void handleDeleteRow(row)}
                                            >
                                              <Trash2 className="mr-1 h-3 w-3" />
                                              删除
                                            </Button>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1">
                                          {canUpdateRows && (
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
                                          )}
                                          {canDeleteRows && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                              disabled={savingRowKey !== null}
                                              onClick={() => void handleDeleteRow(row)}
                                            >
                                              <Trash2 className="mr-1 h-3 w-3" />
                                              删除
                                            </Button>
                                          )}
                                        </div>
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
                            第 {currentPage + 1} / {Math.max(1, totalPages)} 页，共{' '}
                            {(tableData.totalCount || 0).toLocaleString()} 条
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">每页</span>
                            <Select
                              value={String(pageSize)}
                              onValueChange={v => handlePageSizeChange(Number(v))}
                            >
                              <SelectTrigger className="h-7 w-[80px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent side="top">
                                {PAGE_SIZE_OPTIONS.map(size => (
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

      <CreateDatabaseDialog
        open={showCreateDatabase}
        onOpenChange={setShowCreateDatabase}
        onSuccess={dbName => {
          if (activeConnection.connection?.id) {
            void loadDatabases(activeConnection.connection.id);
            setSelectedDatabase(dbName);
          }
        }}
      />

      <CreateTableDialog
        open={showCreateTable}
        onOpenChange={setShowCreateTable}
        onSuccess={handleCreateSuccess}
      />

      <Dialog
        open={showInsertRow}
        onOpenChange={open => {
          if (!open) {
            resetInsertDialog();
            return;
          }
          setShowInsertRow(true);
        }}
      >
        <DialogContent className="max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-background via-background to-primary/[0.04] px-8 py-7">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary shadow-sm ring-1 ring-primary/10">
                <Plus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-2xl font-semibold tracking-tight">
                  新增一行
                </DialogTitle>
                <DialogDescription className="mt-2 max-w-3xl text-[15px] leading-7 text-muted-foreground">
                  留空会优先使用数据库默认值或自增规则；如需显式置空，可输入{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    NULL
                  </code>
                  。
                </DialogDescription>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary" className="h-7 rounded-full px-3 font-medium">
                    {insertableColumns.length} 个可录入字段
                  </Badge>
                  <Badge className="h-7 rounded-full bg-primary px-3 font-medium text-primary-foreground shadow-sm">
                    {requiredInsertColumnsCount} 个必填
                  </Badge>
                  <Badge variant="outline" className="h-7 rounded-full px-3 font-medium">
                    {insertableColumns.length - requiredInsertColumnsCount} 个可留空
                  </Badge>
                </div>
              </div>
            </div>
          </DialogHeader>
          <div className="border-b border-border/50 bg-muted/[0.35] px-8 py-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 shadow-sm">
                <Database className="h-3.5 w-3.5 text-primary" />
                <span>字段按卡片分组，录入更易扫读</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 shadow-sm">
                <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                <span>主键或自增列可留空时会交给数据库自动处理</span>
              </div>
            </div>
          </div>
          <div className="max-h-[min(68vh,760px)] overflow-y-auto bg-gradient-to-b from-background to-muted/[0.12] px-8 py-6">
            <div className="grid gap-4 xl:grid-cols-2">
              {insertableColumns.map(column => {
                const extra = column.extra.toLowerCase();
                const isAutoIncrement = extra.includes('auto_increment');
                const hasServerDefault =
                  column.default !== null || extra.includes('default_generated');
                const isRequired = !column.nullable && !isAutoIncrement && !hasServerDefault;
                return (
                  <div
                    key={column.name}
                    className={cn(
                      'group rounded-2xl border bg-background/90 p-4 shadow-sm transition-all duration-200',
                      isRequired
                        ? 'border-primary/20 shadow-primary/[0.04] hover:border-primary/30 hover:shadow-md'
                        : 'border-border/70 hover:border-border hover:shadow-md'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Label
                          htmlFor={`insert-${column.name}`}
                          className="text-[15px] font-semibold text-foreground"
                        >
                          {column.name}
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">{column.fullType}</p>
                      </div>
                      <Badge
                        variant={isRequired ? 'default' : 'secondary'}
                        className={cn(
                          'h-7 rounded-full px-3 text-[11px] font-semibold shadow-sm',
                          !isRequired && 'bg-muted text-muted-foreground'
                        )}
                      >
                        {isRequired ? '必填' : '可留空'}
                      </Badge>
                    </div>
                    <Input
                      id={`insert-${column.name}`}
                      value={insertValues[column.name] ?? ''}
                      onChange={event => handleInsertValueChange(column.name, event.target.value)}
                      placeholder={`${column.type}${column.default !== null ? `，默认 ${column.default}` : ''}${isAutoIncrement ? '，自动递增' : ''}`}
                      className="mt-4 h-12 rounded-xl border-border/60 bg-background px-4 font-mono text-sm shadow-inner transition-all focus:border-primary/40 focus:bg-background"
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
                        {column.type}
                      </span>
                      <span>{column.nullable ? '允许 NULL' : '非空约束'}</span>
                      {column.default !== null && <span>默认值: {column.default}</span>}
                      {isAutoIncrement && <span>自动递增</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter className="border-t border-border/60 bg-background/95 px-8 py-5 backdrop-blur">
            <div className="flex w-full items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">保存后会立即刷新当前表数据。</p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className="h-11 rounded-xl px-6"
                  disabled={insertingRow}
                  onClick={resetInsertDialog}
                >
                  取消
                </Button>
                <Button
                  className="h-11 rounded-xl px-6 shadow-sm"
                  disabled={insertingRow}
                  onClick={() => void saveInsertedRow()}
                >
                  {insertingRow ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  保存新行
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteTableName && (
        <DeleteTableDialog
          open={!!deleteTableName}
          onOpenChange={open => !open && setDeleteTableName(null)}
          tableName={deleteTableName}
          onSuccess={handleDeleteSuccess}
        />
      )}

      <AddColumnDialog
        open={showAddColumn}
        onOpenChange={setShowAddColumn}
        tableName={viewingTable!}
        existingColumns={currentTableColumns}
        onSuccess={handleAddColumnSuccess}
      />

      {dropColumnInfo && (
        <Dialog open={!!dropColumnInfo} onOpenChange={open => !open && setDropColumnInfo(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                删除列
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-4">
                确定要删除表{' '}
                <span className="font-mono font-medium text-foreground">
                  {dropColumnInfo.tableName}
                </span>{' '}
                的列{' '}
                <span className="font-mono font-medium text-foreground">
                  {dropColumnInfo.columnName}
                </span>{' '}
                吗？
              </p>
              <p className="text-xs text-destructive">
                此操作不可恢复，列中的所有数据都将被永久删除。
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDropColumnInfo(null)}>
                取消
              </Button>
              <Button
                variant="destructive"
                disabled={isReadOnly}
                onClick={async () => {
                  if (!activeConnection.connection?.id) return;
                  try {
                    await dropMySQLColumn(
                      activeConnection.connection.id,
                      dropColumnInfo.tableName,
                      dropColumnInfo.columnName
                    );
                    handleDropColumnSuccess();
                  } catch (err) {
                    console.error('Failed to drop column:', err);
                  }
                }}
              >
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ImportDataDialog
        open={showImportData}
        onOpenChange={setShowImportData}
        onSuccess={() => {
          tableCache.current.clear();
          if (viewingTable) {
            loadTableData(viewingTable, currentPage);
          }
        }}
      />
    </div>
  );
}
