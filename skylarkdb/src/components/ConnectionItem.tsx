import { memo, useCallback, useState } from 'react';
import { DatabaseConnection, ConnectionStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Database, Server, Play, Power, Trash2, MoreVertical, Copy } from 'lucide-react';
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
        'group relative flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors cursor-pointer',
        isActive
          ? 'border-emerald-500/25 bg-emerald-500/8'
          : 'border-transparent hover:bg-muted/50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Status Indicator + Icon combined */}
      <div className="flex-shrink-0 relative">
        {connection.type === 'mysql' ? (
          <Database className={cn('h-4 w-4', isActive ? 'text-mysql' : 'text-muted-foreground')} />
        ) : (
          <Server className={cn('h-4 w-4', isActive ? 'text-redis' : 'text-muted-foreground')} />
        )}
        <div
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-background',
            getStatusColor(),
            isActive && status === 'connected' && 'animate-pulse'
          )}
        />
      </div>

      {/* Connection Info */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <span
          className={cn(
            'block text-xs truncate',
            isActive ? 'font-medium text-foreground' : 'text-foreground/80'
          )}
        >
          {connection.name}
        </span>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
          <span className="font-mono truncate">
            {connection.host}:{connection.port}
          </span>
          {connection.readOnly && (
            <span className="px-1 rounded flex-shrink-0 bg-amber-500/10 text-amber-600 text-[9px]">
              只读
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div
        className={cn(
          'flex items-center gap-0.5 flex-shrink-0 transition-opacity',
          isHovered || isActive ? 'opacity-100' : 'opacity-0'
        )}
      >
        {isActive && status === 'connected' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 rounded text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDisconnect}
            title="断开连接"
          >
            <Power className="h-3 w-3" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-5 w-5 rounded',
              'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50',
              status === 'connecting' && 'opacity-50 cursor-not-allowed'
            )}
            onClick={handleConnect}
            disabled={status === 'connecting'}
            title="连接"
          >
            <Play className="h-3 w-3" />
          </Button>
        )}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 rounded hover:bg-muted"
            onClick={handleMenuClick}
            title="更多操作"
          >
            <MoreVertical className="h-3 w-3" />
          </Button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-0.5 w-28 py-0.5 bg-popover border border-border rounded-md shadow-lg z-50">
              <button
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] hover:bg-muted transition-colors"
                onClick={handleDuplicate}
              >
                <Copy className="h-3 w-3" />
                复制连接
              </button>
              <button
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-destructive hover:bg-destructive/10 transition-colors"
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
