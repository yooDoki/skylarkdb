import { memo, useCallback, useState } from 'react';
import { DatabaseConnection, ConnectionStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Database, Server, Play, Power, Edit2, Trash2, MoreVertical, Copy } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ConnectionItemProps {
  connection: DatabaseConnection;
  isActive: boolean;
  status: ConnectionStatus;
  error: string | null;
  onConnect: (connection: DatabaseConnection) => void;
  onDisconnect: () => void;
  onEdit: (connection: DatabaseConnection) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDuplicate?: (connection: DatabaseConnection) => void;
  onContextMenu?: (e: React.MouseEvent, connection: DatabaseConnection) => void;
}

export const ConnectionItem = memo(function ConnectionItem({
  connection,
  isActive,
  status,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onDuplicate,
  onContextMenu,
}: ConnectionItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleConnect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (status !== 'connecting') {
        onConnect(connection);
      }
    },
    [connection, onConnect, status]
  );

  const handleDisconnect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDisconnect();
    },
    [onDisconnect]
  );

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit(connection);
    },
    [connection, onEdit]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(connection.id, e);
    },
    [connection.id, onDelete]
  );

  const handleDuplicate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDuplicate?.(connection);
      setShowMenu(false);
    },
    [connection, onDuplicate]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu?.(e, connection);
    },
    [connection, onContextMenu]
  );

  const handleMenuClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowMenu(!showMenu);
    },
    [showMenu]
  );

  const getStatusColor = () => {
    if (!isActive) return 'bg-gray-300';
    switch (status) {
      case 'connected':
        return 'bg-emerald-500';
      case 'connecting':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer',
        isActive
          ? 'border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/15'
          : 'border-border/50 bg-card hover:border-primary/30 hover:bg-accent/30'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Status Indicator */}
      <div
        className={cn(
          'w-2.5 h-2.5 rounded-full flex-shrink-0',
          getStatusColor(),
          isActive && status === 'connected' && 'animate-pulse'
        )}
      />

      {/* Database Icon */}
      <div
        className={cn(
          'flex-shrink-0 p-2 rounded-lg transition-all duration-200',
          connection.type === 'mysql'
            ? isActive
              ? 'bg-mysql/20'
              : 'bg-mysql/10'
            : isActive
              ? 'bg-redis/20'
              : 'bg-redis/10'
        )}
      >
        {connection.type === 'mysql' ? (
          <Database className="h-4 w-4 text-mysql" />
        ) : (
          <Server className="h-4 w-4 text-redis" />
        )}
      </div>

      {/* Connection Info */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'font-medium text-sm truncate',
              isActive ? 'text-foreground' : 'text-foreground/90'
            )}
          >
            {connection.name}
          </span>
          {connection.readOnly && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-amber-500/10 text-amber-600">
              只读
            </span>
          )}
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase flex-shrink-0',
              connection.type === 'mysql' ? 'bg-mysql/10 text-mysql' : 'bg-redis/10 text-redis'
            )}
          >
            {connection.type}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          <span className="font-mono truncate">
            {connection.host}:{connection.port}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        className={cn(
          'flex items-center gap-0.5 transition-all duration-200',
          isHovered || isActive ? 'opacity-100' : 'opacity-0'
        )}
      >
        {isActive && status === 'connected' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDisconnect}
            title="断开连接"
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7 rounded-md',
              'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100',
              status === 'connecting' && 'opacity-50 cursor-not-allowed'
            )}
            onClick={handleConnect}
            disabled={status === 'connecting'}
            title="连接"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md hover:bg-muted"
          onClick={handleEdit}
          title="编辑"
        >
          <Edit2 className="h-3 w-3" />
        </Button>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md hover:bg-muted"
            onClick={handleMenuClick}
            title="更多操作"
          >
            <MoreVertical className="h-3 w-3" />
          </Button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-32 py-1 bg-popover border border-border rounded-lg shadow-lg z-50">
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                onClick={handleDuplicate}
              >
                <Copy className="h-3 w-3" />
                复制连接
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                onClick={handleDelete}
              >
                <Trash2 className="h-3 w-3" />
                删除
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
