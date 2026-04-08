import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { MySQLColumn, MySQLTable, TableData } from '@/types';
import {
  getMySQLColumns,
  getMySQLTableData,
  getMySQLTables,
  getMySQLDatabases,
  setMySQLDefaultDatabase,
  updateMySQLRecord,
  insertMySQLRecord,
  deleteMySQLRecord,
} from '@/utils/api';

const DEFAULT_PAGE_SIZE = 15;
const CACHE_TIMEOUT = 5 * 60 * 1000;

export interface UseMySQLExplorerReturn {
  // State
  databases: string[];
  tables: MySQLTable[];
  tableData: TableData | null;
  tableColumns: Map<string, MySQLColumn[]>;
  loading: boolean;
  loadingDatabases: boolean;
  loadingTables: boolean;
  loadingColumns: Set<string>;
  expandedTables: Set<string>;
  searchTerm: string;
  currentPage: number;
  pageSize: number;
  viewingTable: string | null;
  isReadOnly: boolean;

  // Row editing state
  editingRowKey: string | null;
  editingValues: Record<string, string>;
  savingRowKey: string | null;
  editMessage: { type: 'success' | 'error'; text: string } | null;
  editingFocusColumn: string | null;

  // Insert row state
  showInsertRow: boolean;
  insertingRow: boolean;
  insertValues: Record<string, string>;

  // Dialogs state
  showCreateTable: boolean;
  showCreateDatabase: boolean;
  deleteTableName: string | null;
  showAddColumn: boolean;
  showImportData: boolean;
  dropColumnInfo: { tableName: string; columnName: string } | null;

  // Computed
  currentTableColumns: MySQLColumn[];
  primaryKeyColumns: MySQLColumn[];
  editableColumns: MySQLColumn[];
  insertableColumns: MySQLColumn[];
  requiredInsertColumnsCount: number;
  canUpdateRows: boolean;
  canDeleteRows: boolean;
  canInsertRows: boolean;
  hasRowActions: boolean;
  filteredTables: MySQLTable[];
  totalPages: number;

  // Actions - Database
  loadDatabases: (connectionId: string) => Promise<void>;
  setSelectedDatabase: (db: string | null) => void;

  // Actions - Tables
  loadTables: (connectionId: string, database: string) => Promise<void>;
  handleTableClick: (tableName: string) => void;
  handleTableDoubleClick: (tableName: string) => void;
  handleCreateSuccess: () => void;
  handleDeleteSuccess: () => void;

  // Actions - Table Data
  loadTableData: (
    tableName: string,
    page: number,
    signal?: AbortSignal,
    requestedPageSize?: number
  ) => Promise<void>;
  handlePageChange: (newPage: number) => void;
  handlePageSizeChange: (newPageSize: number) => void;

  // Actions - Column
  loadTableColumns: (tableName: string) => Promise<void>;
  handleAddColumnSuccess: () => void;
  handleDropColumnSuccess: () => void;

  // Actions - Row editing
  getRowLocator: (row: Record<string, any>) => Record<string, unknown> | null;
  makeRowKey: (row: Record<string, any>) => string | null;
  serializeEditorValue: (value: unknown) => string;
  startEditingRow: (row: Record<string, any>, focusColumn?: string) => void;
  cancelEditingRow: () => void;
  handleEditValueChange: (columnName: string, value: string) => void;
  saveEditingRow: (row: Record<string, any>) => Promise<void>;
  handleDeleteRow: (row: Record<string, any>) => Promise<void>;

  // Actions - Insert row
  handleInsertValueChange: (columnName: string, value: string) => void;
  resetInsertDialog: () => void;
  saveInsertedRow: () => Promise<void>;

  // Actions - Dialogs
  setShowCreateTable: (show: boolean) => void;
  setShowCreateDatabase: (show: boolean) => void;
  setDeleteTableName: (name: string | null) => void;
  setShowAddColumn: (show: boolean) => void;
  setShowImportData: (show: boolean) => void;
  setDropColumnInfo: (info: { tableName: string; columnName: string } | null) => void;
  setSearchTerm: (term: string) => void;
  setExpandedTables: (tables: Set<string>) => void;

  // Refs
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  tableListRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function useMySQLExplorer(): UseMySQLExplorerReturn {
  const { activeConnection, selectedDatabase, setSelectedDatabase } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;

  // State
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<MySQLTable[]>([]);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [viewingTable, setViewingTable] = useState<string | null>(null);

  // Row editing state
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [editingFocusColumn, setEditingFocusColumn] = useState<string | null>(null);

  // Insert row state
  const [showInsertRow, setShowInsertRow] = useState(false);
  const [insertingRow, setInsertingRow] = useState(false);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});

  // Dialogs state
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [showCreateDatabase, setShowCreateDatabase] = useState(false);
  const [deleteTableName, setDeleteTableName] = useState<string | null>(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showImportData, setShowImportData] = useState(false);
  const [dropColumnInfo, setDropColumnInfo] = useState<{
    tableName: string;
    columnName: string;
  } | null>(null);

  // Refs
  const tableCache = useRef<Map<string, TableCache>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const editingRowData = useRef<Record<string, any> | null>(null);
  const saveEditingRowRef = useRef<(row: Record<string, any>) => Promise<void>>();
  const tableListRef = useRef<HTMLDivElement | null>(null);

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTableRef = useRef<string | null>(null);

  interface TableCache {
    data: TableData;
    timestamp: number;
  }

  type TableRow = Record<string, any>;

  // Load databases
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

  // Load tables
  const loadTables = useCallback(async (connectionId: string, database: string) => {
    setLoadingTables(true);
    try {
      const tablesData = await getMySQLTables(connectionId, database);
      setTables(tablesData as MySQLTable[]);
    } catch (error) {
      console.error('Failed to load tables:', error);
    } finally {
      setLoadingTables(false);
    }
  }, []);

  // Load table columns
  const loadTableColumns = useCallback(
    async (tableName: string) => {
      const connectionId = activeConnection.connection?.id;
      if (!connectionId) return;

      const tableColumnsCache = tableCache.current.get(`columns-${tableName}`);
      if (tableColumnsCache) return;

      setLoadingColumns(prev => new Set(prev).add(tableName));
      try {
        const columns = await getMySQLColumns(connectionId, tableName);
        tableCache.current.set(`columns-${tableName}`, {
          data: columns as any,
          timestamp: Date.now(),
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
    [activeConnection.connection?.id]
  );

  // Load table data
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

  // Effects
  useEffect(() => {
    if (activeConnection.status === 'connected' && activeConnection.connection?.id) {
      loadDatabases(activeConnection.connection.id);
    } else if (!activeConnection.connection) {
      setDatabases([]);
      setTables([]);
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
      setMySQLDefaultDatabase(activeConnection.connection.id, selectedDatabase).catch(err => {
        console.error('Failed to set default database:', err);
      });
    } else if (!selectedDatabase) {
      setTables([]);
      setTableData(null);
      setViewingTable(null);
      setExpandedTables(new Set());
    }
  }, [activeConnection.status, selectedDatabase, activeConnection.connection?.id, loadTables]);

  useEffect(() => {
    if (viewingTable) {
      void loadTableColumns(viewingTable);
    }
  }, [viewingTable]);

  useEffect(() => {
    setEditingRowKey(null);
    setEditingValues({});
    setSavingRowKey(null);
    setEditMessage(null);
    setEditingFocusColumn(null);
    editingRowData.current = null;
  }, [viewingTable, currentPage]);

  // Computed values
  const currentTableColumns = useMemo(
    () => (viewingTable ? getTableColumns(viewingTable) : []),
    [viewingTable]
  );

  function getTableColumns(_tableName: string): MySQLColumn[] {
    // This will be passed from component state
    return [];
  }

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

  const filteredTables = useMemo(() => {
    if (!searchTerm.trim()) return tables;
    const term = searchTerm.toLowerCase();
    return tables.filter(table => table.name.toLowerCase().includes(term));
  }, [tables, searchTerm]);

  const totalPages = Math.ceil((tableData?.totalCount || 0) / pageSize);

  // Helper functions
  const serializeEditorValue = useCallback((value: unknown) => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }, []);

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

  const normalizeCompareValue = useCallback((value: unknown) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }, []);

  // Row editing actions
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

  // Insert row actions
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

  // Table actions
  const handleTableClick = useCallback((tableName: string) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    const timer = setTimeout(() => {
      setExpandedTables(prev => {
        const newSet = new Set(prev);
        const willExpand = !newSet.has(tableName);
        if (!willExpand) {
          newSet.delete(tableName);
        } else {
          newSet.add(tableName);
        }
        return newSet;
      });
      clickTimerRef.current = null;
    }, 250);

    clickTimerRef.current = timer;
  }, []);

  const handleTableDoubleClick = useCallback(
    (tableName: string) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }

      if (pendingTableRef.current) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setViewingTable(tableName);
      pendingTableRef.current = tableName;
      setCurrentPage(0);
      loadTableData(tableName, 0, controller.signal);
    },
    [loadTableData]
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

  const handleCreateSuccess = useCallback(() => {
    if (activeConnection.connection?.id && selectedDatabase) {
      void loadTables(activeConnection.connection.id, selectedDatabase);
    }
    tableCache.current.clear();
  }, [activeConnection.connection?.id, selectedDatabase, loadTables]);

  const handleDeleteSuccess = useCallback(() => {
    if (activeConnection.connection?.id && selectedDatabase) {
      void loadTables(activeConnection.connection.id, selectedDatabase);
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

  const handleAddColumnSuccess = useCallback(() => {
    if (viewingTable) {
      if (activeConnection.connection?.id) {
        void loadTableColumns(viewingTable);
        void loadTableData(viewingTable, currentPage);
      }
    }
  }, [viewingTable, currentPage, activeConnection.connection?.id, loadTableColumns, loadTableData]);

  const handleDropColumnSuccess = useCallback(() => {
    if (viewingTable) {
      if (activeConnection.connection?.id) {
        void loadTableColumns(viewingTable);
        void loadTableData(viewingTable, currentPage);
      }
    }
    setDropColumnInfo(null);
  }, [viewingTable, currentPage, activeConnection.connection?.id, loadTableColumns, loadTableData]);

  const handleInsertValueChange = useCallback((columnName: string, value: string) => {
    setInsertValues(prev => ({ ...prev, [columnName]: value }));
  }, []);

  // Sync ref for keyboard shortcuts
  saveEditingRowRef.current = saveEditingRow;

  return {
    // State
    databases,
    tables,
    tableData,
    tableColumns: new Map(), // Will be overridden by component
    loading,
    loadingDatabases,
    loadingTables,
    loadingColumns,
    expandedTables,
    searchTerm,
    currentPage,
    pageSize,
    viewingTable,
    isReadOnly,

    // Row editing state
    editingRowKey,
    editingValues,
    savingRowKey,
    editMessage,
    editingFocusColumn,

    // Insert row state
    showInsertRow,
    insertingRow,
    insertValues,

    // Dialogs state
    showCreateTable,
    showCreateDatabase,
    deleteTableName,
    showAddColumn,
    showImportData,
    dropColumnInfo,

    // Computed
    currentTableColumns,
    primaryKeyColumns,
    editableColumns,
    insertableColumns,
    requiredInsertColumnsCount,
    canUpdateRows,
    canDeleteRows,
    canInsertRows,
    hasRowActions,
    filteredTables,
    totalPages,

    // Actions
    loadDatabases,
    setSelectedDatabase,
    loadTables,
    handleTableClick,
    handleTableDoubleClick,
    handleCreateSuccess,
    handleDeleteSuccess,
    loadTableData,
    handlePageChange,
    handlePageSizeChange,
    loadTableColumns,
    handleAddColumnSuccess,
    handleDropColumnSuccess,
    getRowLocator,
    makeRowKey,
    serializeEditorValue,
    startEditingRow,
    cancelEditingRow,
    handleEditValueChange,
    saveEditingRow,
    handleDeleteRow,
    handleInsertValueChange,
    resetInsertDialog,
    saveInsertedRow,
    setShowCreateTable,
    setShowCreateDatabase,
    setDeleteTableName,
    setShowAddColumn,
    setShowImportData,
    setDropColumnInfo,
    setSearchTerm,
    setExpandedTables,

    // Refs
    abortControllerRef,
    tableListRef,
  };
}
