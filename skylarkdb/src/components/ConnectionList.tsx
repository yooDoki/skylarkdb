import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useConnectionStore } from '@/stores/connectionStore';
import { ConnectionForm } from './ConnectionForm';
import { ConnectionItem } from './ConnectionItem';
import { SettingsDialog } from './SettingsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DatabaseConnection } from '@/types';
import { Database, Plus, Search, Filter, X, Play, Settings } from 'lucide-react';
import { cn } from '@/utils/cn';
import { connectMySQL, connectRedis, disconnectMySQL, disconnectRedis } from '@/utils/api';

type SortField = 'name' | 'type' | 'host' | 'createdAt' | 'updatedAt';
type SortOrder = 'asc' | 'desc';
type FilterType = 'all' | 'mysql' | 'redis';
type FilterStatus = 'all' | 'connected' | 'disconnected' | 'connecting' | 'error';

interface ConnectionListProps {
  collapsed?: boolean;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  connection: DatabaseConnection | null;
}

const ESTIMATED_ITEM_HEIGHT = 72;

export function ConnectionList({ collapsed = false }: ConnectionListProps) {
  const { 
    connections, 
    activeConnection, 
    addConnection,
    deleteConnection, 
    setActiveConnection, 
    setConnectionStatus 
  } = useConnectionStore();
  
  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    connection: null,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 150);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  const filteredAndSortedConnections = useMemo(() => {
    let result = [...connections];

    if (debouncedSearch.trim()) {
      const term = debouncedSearch.toLowerCase();
      result = result.filter(
        (conn) => 
          conn.name.toLowerCase().includes(term) || 
          conn.host.toLowerCase().includes(term) ||
          conn.type.toLowerCase().includes(term) ||
          (conn.database && conn.database.toLowerCase().includes(term))
      );
    }

    if (filterType !== 'all') {
      result = result.filter(conn => conn.type === filterType);
    }

    if (filterStatus !== 'all') {
      result = result.filter(conn => {
        const isActive = activeConnection.connection?.id === conn.id;
        const status = isActive ? activeConnection.status : 'disconnected';
        return status === filterStatus;
      });
    }

    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'zh-CN');
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'host':
          comparison = a.host.localeCompare(b.host);
          break;
        case 'createdAt':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'updatedAt':
          comparison = a.updatedAt - b.updatedAt;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [connections, debouncedSearch, sortField, sortOrder, filterType, filterStatus, activeConnection]);

  const virtualizer = useVirtualizer({
    count: filteredAndSortedConnections.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
  });

  const handleConnect = useCallback(async (connection: DatabaseConnection) => {
    setActiveConnection(connection);
    setConnectionStatus('connecting');

    try {
      let result;
      if (connection.type === 'mysql') {
        result = await connectMySQL(connection);
      } else {
        result = await connectRedis(connection);
      }

      if (result.success) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error', result.message);
      }
    } catch (error) {
      setConnectionStatus('error', error instanceof Error ? error.message : 'Connection failed');
    }
  }, [setActiveConnection, setConnectionStatus]);

  const handleDisconnect = useCallback(async () => {
    const currentConnection = activeConnection.connection;

    try {
      if (currentConnection) {
        if (currentConnection.type === 'mysql') {
          await disconnectMySQL(currentConnection.id);
        } else {
          await disconnectRedis(currentConnection.id);
        }
      }
    } catch (error) {
      console.error('Failed to disconnect from backend:', error);
    } finally {
      setActiveConnection(null);
      setConnectionStatus('disconnected');
    }
  }, [activeConnection.connection, setActiveConnection, setConnectionStatus]);

  const handleEdit = useCallback((connection: DatabaseConnection) => {
    setEditingConnection(connection);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteConfirm({ open: true, id });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirm.id) {
      deleteConnection(deleteConfirm.id);
    }
    setDeleteConfirm({ open: false, id: null });
  }, [deleteConfirm.id, deleteConnection]);

  const handleDuplicate = useCallback((connection: DatabaseConnection) => {
    const { id, createdAt, updatedAt, ...rest } = connection;
    addConnection({
      ...rest,
      name: `${connection.name} (副本)`,
    });
  }, [addConnection]);

  const handleContextMenu = useCallback((e: React.MouseEvent, connection: DatabaseConnection) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      connection,
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  useEffect(() => {
    const handleClick = () => handleCloseContextMenu();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseContextMenu();
    };

    if (contextMenu.isOpen) {
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.isOpen, handleCloseContextMenu]);

  const handleSortChange = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }, [sortField]);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterType('all');
    setFilterStatus('all');
    setSortField('updatedAt');
    setSortOrder('desc');
  }, []);

  const hasActiveFilters = searchTerm || filterType !== 'all' || filterStatus !== 'all' || 
    sortField !== 'updatedAt' || sortOrder !== 'desc';

  const items = virtualizer.getVirtualItems();

  const activeFiltersCount = [
    filterType !== 'all',
    filterStatus !== 'all',
    sortField !== 'updatedAt' || sortOrder !== 'desc',
  ].filter(Boolean).length;

  return (
    <>
      <div className={cn(
        "h-full flex flex-col p-4 transition-opacity duration-300",
        collapsed ? "opacity-0 pointer-events-none" : "opacity-100"
      )}>
        <div className="mb-4 rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/35 p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
                <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-xl" />
                <Database className="relative h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold leading-tight">
                  <span className="gradient-text">Skylark</span>
                  <span className="text-foreground">DB</span>
                </h1>
                <p className="text-[11px] text-muted-foreground">数据库管理工具</p>
              </div>
            </div>
            <SettingsDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full border border-border/60 bg-background/80 hover:bg-muted"
                  title="设置 (⌘,)"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              }
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold text-muted-foreground">连接列表</h2>
              {connections.length > 0 && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {filteredAndSortedConnections.length === connections.length
                    ? connections.length
                    : `${filteredAndSortedConnections.length}/${connections.length}`}
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => { setEditingConnection(undefined); setShowForm(true); }}
              className="h-7 px-2.5 text-xs rounded-full"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              新建
            </Button>
          </div>
        </div>

        {connections.length > 0 && (
          <>
            <div className="mb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="搜索连接..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 pl-9 pr-8 rounded-lg text-sm"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 mb-2">
              <Button
                variant={showFilters ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-3 w-3 mr-1" />
                筛选
                {activeFiltersCount > 0 && (
                  <span className="ml-1 px-1 py-0 bg-primary/20 rounded text-[10px] text-primary">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={clearFilters}
                >
                  <X className="h-3 w-3 mr-1" />
                  清除
                </Button>
              )}
            </div>

            {showFilters && (
              <div className="mb-3 p-2.5 bg-muted/30 rounded-lg border border-border/50 space-y-2.5">
                {/* Type Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-8">类型</span>
                  <div className="flex gap-1 flex-1 flex-wrap">
                    {(['all', 'mysql', 'redis'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] rounded transition-all",
                          filterType === type
                            ? type === 'mysql'
                              ? "bg-mysql/15 text-mysql"
                              : type === 'redis'
                              ? "bg-redis/15 text-redis"
                              : "bg-primary/15 text-primary"
                            : "hover:bg-muted text-muted-foreground"
                        )}
                      >
                        {type === 'all' ? '全部' : type.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-8">状态</span>
                  <div className="flex gap-1 flex-1 flex-wrap">
                    {([
                      { value: 'all', label: '全部' },
                      { value: 'connected', label: '已连接' },
                      { value: 'disconnected', label: '未连接' },
                      { value: 'connecting', label: '连接中' },
                      { value: 'error', label: '错误' },
                    ] as const).map((status) => (
                      <button
                        key={status.value}
                        onClick={() => setFilterStatus(status.value)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] rounded transition-all",
                          filterStatus === status.value
                            ? "bg-primary/15 text-primary"
                            : "hover:bg-muted text-muted-foreground"
                        )}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-8">排序</span>
                  <div className="flex gap-1 flex-1 flex-wrap">
                    {([
                      { field: 'updatedAt' as const, label: '时间' },
                      { field: 'name' as const, label: '名称' },
                      { field: 'type' as const, label: '类型' },
                    ]).map((sort) => (
                      <button
                        key={sort.field}
                        onClick={() => handleSortChange(sort.field)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] rounded transition-all",
                          sortField === sort.field
                            ? "bg-primary/15 text-primary"
                            : "hover:bg-muted text-muted-foreground"
                        )}
                      >
                        {sort.label}
                        {sortField === sort.field && (
                          <span className="ml-0.5">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div 
          ref={scrollContainerRef} 
          className="flex-1 overflow-auto -mx-4 px-4"
          style={{ contain: 'strict' }}
        >
          {filteredAndSortedConnections.length === 0 ? (
            <div className="text-center py-12">
              <div className="relative mb-4">
                <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
                {searchTerm || filterType !== 'all' || filterStatus !== 'all' ? (
                  <Search className="h-10 w-10 mx-auto text-muted-foreground/50 relative" />
                ) : (
                  <Database className="h-10 w-10 mx-auto text-muted-foreground/50 relative" />
                )}
              </div>
              {searchTerm || filterType !== 'all' || filterStatus !== 'all' ? (
                <>
                  <p className="text-muted-foreground text-sm">没有找到匹配的连接</p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">还没有连接</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">点击上方按钮创建</p>
                </>
              )}
            </div>
          ) : filteredAndSortedConnections.length < 20 ? (
            <div className="space-y-2">
              {filteredAndSortedConnections.map((connection) => {
                const isActive = activeConnection.connection?.id === connection.id;
                
                return (
                  <ConnectionItem
                    key={connection.id}
                    connection={connection}
                    isActive={isActive}
                    status={isActive ? activeConnection.status : 'disconnected'}
                    error={isActive ? activeConnection.error : null}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onContextMenu={handleContextMenu}
                  />
                );
              })}
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {items.map((virtualItem) => {
                const connection = filteredAndSortedConnections[virtualItem.index];
                if (!connection) return null;
                
                const isActive = activeConnection.connection?.id === connection.id;
                
                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <ConnectionItem
                      connection={connection}
                      isActive={isActive}
                      status={isActive ? activeConnection.status : 'disconnected'}
                      error={isActive ? activeConnection.error : null}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                      onContextMenu={handleContextMenu}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <ConnectionForm
          onClose={() => { setShowForm(false); setEditingConnection(undefined); }}
          initialData={editingConnection}
        />
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        title="删除连接"
        description="确定要删除这个连接吗？此操作不可撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: null })}
      />

      {contextMenu.isOpen && contextMenu.connection && (
        <div
          className="fixed z-50 min-w-32 py-1 bg-popover border border-border rounded-lg shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              handleConnect(contextMenu.connection!);
              handleCloseContextMenu();
            }}
          >
            <Play className="h-3 w-3" />
            连接
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              handleEdit(contextMenu.connection!);
              handleCloseContextMenu();
            }}
          >
            <Database className="h-3 w-3" />
            编辑
          </button>
          <div className="my-1 h-px bg-border mx-2" />
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            onClick={() => {
              setDeleteConfirm({ open: true, id: contextMenu.connection!.id });
              handleCloseContextMenu();
            }}
          >
            <X className="h-3 w-3" />
            删除
          </button>
        </div>
      )}
    </>
  );
}
