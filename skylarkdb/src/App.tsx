import { useState, useEffect } from 'react';
import { ConnectionList } from '@/components/ConnectionList';
import { MySQLExplorer } from '@/components/MySQLExplorer';
import { RedisExplorer } from '@/components/RedisExplorer';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { Database, Server, Moon, Sun, Sparkles, ChevronRight, Terminal } from 'lucide-react';

function App() {
  const { activeConnection } = useConnectionStore();
  const { collapsed, toggle } = useSidebarStore();
  const [darkMode, setDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sqlWorkbenchOpen, setSqlWorkbenchOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSqlWorkbenchOpen(false);
  }, [activeConnection.connection?.id, activeConnection.connection?.type]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <Database className="h-6 w-6 text-primary relative" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold leading-tight">
              <span className="gradient-text">Skylark</span>
              <span className="text-foreground">DB</span>
            </h1>
            <span className="text-[10px] text-muted-foreground -mt-0.5">数据库管理工具</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {activeConnection.connection?.type === 'mysql' && activeConnection.status === 'connected' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSqlWorkbenchOpen(true)}
              className="h-9 w-9 rounded-full hover:bg-muted transition-colors"
              title="SQL 查询"
            >
              <Terminal className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            className="h-9 w-9 rounded-full hover:bg-muted transition-colors"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

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

        {/* Right Content - Database Explorer */}
        <div className="flex-1 overflow-hidden bg-background min-h-0">
          {activeConnection.connection ? (
            <div className={`h-full min-h-0 animate-fade-in ${mounted ? 'opacity-100' : 'opacity-0'}`}>
              {activeConnection.connection.type === 'mysql' ? (
                <MySQLExplorer
                  sqlWorkbenchOpen={sqlWorkbenchOpen}
                  onSqlWorkbenchOpenChange={setSqlWorkbenchOpen}
                />
              ) : (
                <RedisExplorer />
              )}
            </div>
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
    </div>
  );
}

export default App;
