import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useConnectionStore } from '@/stores/connectionStore';
import { ConnectionForm } from './ConnectionForm';
import { ConnectionItem } from './ConnectionItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DatabaseConnection } from '@/types';
import { Database, Plus, Search, X, Play } from 'lucide-react';
import { cn } from '@/utils/cn';
import { logError } from '@/utils/errorHandler';
import {
  connectMySQL,
  connectRedis,
  deleteConnectionPassword,
  disconnectMySQL,
  disconnectRedis,
} from '@/utils/api';

interface ConnectionListProps {
  collapsed?: boolean;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  connection: DatabaseConnection | null;
}

type SortField = 'name' | 'type' | 'host' | 'createdAt' | 'updatedAt';
type SortOrder = 'asc' | 'desc';
type FilterType = 'all' | 'mysql' | 'redis';
type FilterStatus = 'all' | 'connected' | 'disconnected' | 'connecting' | 'error';

const ESTIMATED_ITEM_HEIGHT = 72;

export function ConnectionList({ collapsed = false }: ConnectionListProps) {
  const {
    connections,
    activeConnection,
    addConnection,
    deleteConnection,
    setActiveConnection,
    setConnectionStatus,
    updateConnection,
  } = useConnectionStore();

  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField] = useState<SortField>('updatedAt');
  const [sortOrder] = useState<SortOrder>('desc');
  const [filterType] = useState<FilterType>('all');
  const [filterStatus] = useState<FilterStatus>('all');
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
        conn =>
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
  }, [
    connections,
    debouncedSearch,
    sortField,
    sortOrder,
    filterType,
    filterStatus,
    activeConnection,
  ]);

  const virtualizer = useVirtualizer({
    count: filteredAndSortedConnections.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
  });

  const handleConnect = useCallback(
    async (connection: DatabaseConnection) => {
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('系统钥匙串中没有找到该连接的已保存密码')) {
          updateConnection(connection.id, { hasPassword: false });
        }
        setConnectionStatus('error', errorMessage);
      }
    },
    [setActiveConnection, setConnectionStatus, updateConnection]
  );

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
      logError('Connection List - Disconnect', error);
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

  const handleConfirmDelete = useCallback(async () => {
    if (deleteConfirm.id) {
      const targetConnection = connections.find(connection => connection.id === deleteConfirm.id);

      if (activeConnection.connection?.id === deleteConfirm.id) {
        try {
          if (activeConnection.connection.type === 'mysql') {
            await disconnectMySQL(activeConnection.connection.id);
          } else {
            await disconnectRedis(activeConnection.connection.id);
          }
        } catch (error) {
          logError('Connection List - Disconnect Before Delete', error);
        }
      }

      if (targetConnection?.passwordStorage === 'system' && targetConnection.hasPassword) {
        await deleteConnectionPassword(deleteConfirm.id).catch(error => {
          logError('Connection List - Delete Password', error);
        });
      }

      deleteConnection(deleteConfirm.id);
    }
    setDeleteConfirm({ open: false, id: null });
  }, [activeConnection.connection, connections, deleteConfirm.id, deleteConnection]);

  const handleDuplicate = useCallback(
    (connection: DatabaseConnection) => {
      const { ...rest } = connection;
      const shouldCopyLocalPassword =
        (connection.passwordStorage ?? 'local') === 'local' && !!connection.password?.trim();

      addConnection({
        ...rest,
        name: `${connection.name} (副本)`,
        passwordStorage: 'local',
        hasPassword: shouldCopyLocalPassword,
        password: shouldCopyLocalPassword ? connection.password : undefined,
      });
    },
    [addConnection]
  );

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
    if (!contextMenu.isOpen) return;

    const handleClick = () => handleCloseContextMenu();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseContextMenu();
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.isOpen, handleCloseContextMenu]);

  const items = virtualizer.getVirtualItems();

  return (
    <>
      <div
        className={cn(
          'h-full flex flex-col transition-opacity duration-300',
          collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
      >
        {/* Search + New Button - 合并在一行 */}
        <div className="px-3 py-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="搜索连接..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-7 pl-7 pr-6 rounded-md text-xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button
            size="icon"
            onClick={() => {
              setEditingConnection(undefined);
              setShowForm(true);
            }}
            className="h-7 w-7 rounded-md"
            variant="secondary"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto px-3"
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
              {filteredAndSortedConnections.map(connection => {
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
              {items.map(virtualItem => {
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
          onClose={() => {
            setShowForm(false);
            setEditingConnection(undefined);
          }}
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
