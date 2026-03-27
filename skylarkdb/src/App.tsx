import { useState, useEffect, useCallback } from 'react';
import { ConnectionList } from '@/components/ConnectionList';
import { MySQLExplorer } from '@/components/MySQLExplorer';
import { RedisExplorer } from '@/components/RedisExplorer';
import { SqlQueryPanel } from '@/components/SqlQueryPanel';
import { SettingsDialog } from '@/components/SettingsDialog';
import { UpdateChecker } from '@/components/UpdateChecker';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { Database, Server, Sparkles, ChevronRight, FileCode, Table2, CheckCircle2, XCircle, Loader2, Settings } from 'lucide-react';
import { connectMySQL, connectRedis } from '@/utils/api';

type ViewMode = 'explorer' | 'query';

function App() {
  const { activeConnection, setConnectionStatus } = useConnectionStore();
  const { collapsed, toggle } = useSidebarStore();
  const { settings, isLoaded } = useSettings();
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('explorer');

  useEffect(() => {
    setMounted(true);
  }, []);

  const reconnectActiveConnection = useCallback(async () => {
    const connection = activeConnection.connection;
    if (!connection) return;

    setConnectionStatus('connecting');

    try {
      const connectPromise = connection.type === 'mysql'
        ? connectMySQL(connection)
        : connectRedis(connection);

      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error(`连接超时（>${settings.connectionTimeout} 秒）`));
        }, settings.connectionTimeout * 1000);
      });

      const result = await Promise.race([connectPromise, timeoutPromise]);

      if (result.success) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error', result.message);
      }
    } catch (error) {
      setConnectionStatus('error', error instanceof Error ? error.message : 'Connection failed');
    }
  }, [activeConnection.connection, setConnectionStatus, settings.connectionTimeout]);

  useEffect(() => {
    if (!isLoaded || !settings.autoReconnect || !activeConnection.connection || activeConnection.status !== 'disconnected') {
      return;
    }

    let cancelled = false;

    const reconnect = async () => {
      await reconnectActiveConnection();
      if (cancelled) {
        return;
      }
    };

    void reconnect();

    return () => {
      cancelled = true;
    };
  }, [activeConnection.connection, activeConnection.status, isLoaded, reconnectActiveConnection, settings.autoReconnect]);

  // Theme is handled by useSettings hook

  // Get connection status display
  const getConnectionStatus = () => {
    if (!activeConnection.connection) {
      return { icon: null, text: '未连接', color: 'text-muted-foreground' };
    }
    switch (activeConnection.status) {
      case 'connected':
        return {
          icon: <CheckCircle2 className="h-3 w-3" />,
          text: `${activeConnection.connection.name} (${activeConnection.connection.type.toUpperCase()})`,
          color: 'text-green-500'
        };
      case 'connecting':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: '连接中...',
          color: 'text-amber-500'
        };
      case 'error':
        return {
          icon: <XCircle className="h-3 w-3" />,
          text: '连接失败',
          color: 'text-destructive'
        };
      default:
        return { icon: null, text: '未连接', color: 'text-muted-foreground' };
    }
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Hidden component to auto-check updates on startup */}
      <div className="hidden">
        <UpdateChecker autoCheck={true} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar - Connections */}
        <div
          className={cn(
            "border-r bg-muted/30 overflow-hidden transition-all duration-300 ease-in-out",
            collapsed ? "w-0" : "w-80"
          )}
        >
          <ConnectionList collapsed={collapsed} />
        </div>

        {/* Sidebar Toggle Button */}
        <button
          onClick={toggle}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-12 bg-background border border-border rounded-r-lg shadow-md hover:bg-muted transition-all duration-300 group",
            collapsed ? "left-0" : "left-[320px]"
          )}
          title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          <div className={cn(
            "transition-transform duration-300",
            collapsed ? "rotate-0" : "rotate-180"
          )}>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          </div>
        </button>

        {collapsed && (
          <div className="absolute right-4 top-3 z-20">
            <SettingsDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full border border-border/60 bg-background/90 shadow-sm backdrop-blur hover:bg-muted"
                  title="设置 (⌘,)"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              }
            />
          </div>
        )}

        {/* Right Content - Database Explorer */}
        <div className="flex-1 overflow-hidden bg-background min-h-0 flex flex-col">
          {activeConnection.connection ? (
            <>
              {activeConnection.connection.type === 'mysql' && (
                <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/30">
                  <Button
                    variant={viewMode === 'explorer' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('explorer')}
                    className="h-7 text-xs"
                  >
                    <Table2 className="h-3.5 w-3.5 mr-1.5" />
                    数据浏览
                  </Button>
                  <Button
                    variant={viewMode === 'query' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('query')}
                    className="h-7 text-xs"
                  >
                    <FileCode className="h-3.5 w-3.5 mr-1.5" />
                    SQL 查询
                  </Button>
                </div>
              )}
              <div className={`flex-1 min-h-0 h-full overflow-hidden animate-fade-in ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                {activeConnection.connection.type === 'mysql' ? (
                  viewMode === 'query' ? (
                    <SqlQueryPanel />
                  ) : (
                    <MySQLExplorer onReconnect={reconnectActiveConnection} />
                  )
                ) : (
                  <RedisExplorer />
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full min-h-0">
              <div className="text-center animate-scale-in">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-150" />
                  <div className="flex items-center justify-center gap-6 relative">
                    <div className="p-4 rounded-2xl bg-mysql/10 border border-mysql/20">
                      <Database className="h-10 w-10 text-mysql" />
                    </div>
                    <div className="p-4 rounded-2xl bg-redis/10 border border-redis/20">
                      <Server className="h-10 w-10 text-redis" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-center mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-xl font-semibold">欢迎使用 SkylarkDB</h2>
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  从左侧面板选择一个连接开始管理您的数据库
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      {settings.showStatusBar && isLoaded && (
        <div className="h-7 border-t bg-muted/30 flex items-center justify-between px-3 text-xs">
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-1.5 ${connectionStatus.color}`}>
              {connectionStatus.icon}
              <span>{connectionStatus.text}</span>
            </div>
            {activeConnection.connection?.database && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Database className="h-3 w-3" />
                <span>{activeConnection.connection.database}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <span>SkylarkDB v0.1.3</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
