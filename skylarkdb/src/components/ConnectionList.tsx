import { useState, useEffect, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { ConnectionForm } from './ConnectionForm';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DatabaseConnection } from '@/types';
import { Database, Server, Plus, Edit2, Trash2, Play, Power } from 'lucide-react';
import { cn } from '@/utils/cn';
import { connectMySQL, connectRedis } from '@/utils/api';

interface ConnectionListProps {
  collapsed?: boolean;
}

export function ConnectionList({ collapsed = false }: ConnectionListProps) {
  const { connections, activeConnection, deleteConnection, setActiveConnection, setConnectionStatus } = useConnectionStore();
  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | undefined>();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const connectionRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleConnect = async (connection: DatabaseConnection) => {
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
  };

  const handleDisconnect = () => {
    setActiveConnection(null);
    setConnectionStatus('disconnected');
  };

  const handleEdit = (connection: DatabaseConnection) => {
    setEditingConnection(connection);
    setShowForm(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteConfirm({ open: true, id });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.id) {
      deleteConnection(deleteConfirm.id);
    }
    setDeleteConfirm({ open: false, id: null });
  };

  useEffect(() => {
    if (activeConnection.connection?.id && scrollContainerRef.current) {
      const element = connectionRefs.current.get(activeConnection.connection.id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeConnection.connection?.id]);

  const getStatusIndicator = (connection: DatabaseConnection) => {
    if (activeConnection.connection?.id === connection.id) {
      switch (activeConnection.status) {
        case 'connected':
          return (
            <span className="status-dot connected" title="已连接" />
          );
        case 'connecting':
          return (
            <span className="status-dot connecting" title="连接中..." />
          );
        case 'error':
          return (
            <span className="status-dot error" title="连接失败" />
          );
        default:
          return null;
      }
    }
    return null;
  };

  const getDatabaseIcon = (type: 'mysql' | 'redis', isActive: boolean) => {
    const baseClasses = "h-5 w-5 transition-all duration-200";
    if (type === 'mysql') {
      return (
        <div className={cn(
          "p-2 rounded-lg transition-all duration-200",
          isActive ? "bg-mysql/20" : "bg-mysql/10"
        )}>
          <Database className={cn(baseClasses, "text-mysql")} />
        </div>
      );
    }
    return (
      <div className={cn(
        "p-2 rounded-lg transition-all duration-200",
        isActive ? "bg-redis/20" : "bg-redis/10"
      )}>
        <Server className={cn(baseClasses, "text-redis")} />
      </div>
    );
  };

  const getTypeBadge = (type: 'mysql' | 'redis') => (
    <span className={cn(
      "text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide",
      type === 'mysql' ? "badge-mysql" : "badge-redis"
    )}>
      {type}
    </span>
  );

  return (
    <>
      <div className={cn(
        "h-full flex flex-col p-4 transition-opacity duration-300",
        collapsed ? "opacity-0 pointer-events-none" : "opacity-100"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">连接列表</h2>
            {connections.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {connections.length}
              </span>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => { setEditingConnection(undefined); setShowForm(true); }}
            className="h-8 px-3 rounded-full shadow-soft hover:shadow-card-hover transition-shadow"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            新建
          </Button>
        </div>

        {/* Connection List */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto -mx-4 px-4">
          {connections.length === 0 ? (
            <div className="text-center py-12 animate-fade-in">
              <div className="relative mb-4">
                <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
                <Database className="h-12 w-12 mx-auto text-muted-foreground/50 relative" />
              </div>
              <p className="text-muted-foreground font-medium mb-1">还没有连接</p>
              <p className="text-xs text-muted-foreground/70">点击上方按钮创建新连接</p>
            </div>
          ) : (
            <div className="space-y-2">
              {connections.map((connection, index) => {
                const isActive = activeConnection.connection?.id === connection.id;
                const isHovered = hoveredId === connection.id;
                
                return (
                  <div
                    key={connection.id}
                    ref={(el) => connectionRefs.current.set(connection.id, el)}
                    onMouseEnter={() => setHoveredId(connection.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={cn(
                      "group relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer",
                      isActive
                        ? "border-primary/30 bg-primary/5 shadow-soft"
                        : "border-border/50 bg-card/50 hover:border-primary/20 hover:bg-card hover:shadow-soft"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Status Indicator */}
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2">
                      {getStatusIndicator(connection)}
                    </div>

                    {/* Database Icon */}
                    {getDatabaseIcon(connection.type, isActive)}

                    {/* Connection Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn(
                          "font-medium truncate",
                          isActive ? "text-foreground" : "text-foreground/90"
                        )}>
                          {connection.name}
                        </span>
                        {getTypeBadge(connection.type)}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {connection.host}:{connection.port}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className={cn(
                      "flex items-center gap-0.5 transition-opacity duration-200",
                      isHovered || isActive ? "opacity-100" : "opacity-0"
                    )}>
                      {isActive && activeConnection.status === 'connected' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDisconnect();
                          }}
                          title="断开连接"
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-primary hover:text-primary hover:bg-primary/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConnect(connection);
                          }}
                          disabled={activeConnection.status === 'connecting'}
                          title="连接"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(connection);
                        }}
                        title="编辑"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(connection.id, e);
                        }}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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
    </>
  );
}
