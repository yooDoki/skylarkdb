import { useState, useEffect } from 'react';
import { ConnectionList } from '@/components/ConnectionList';
import { MySQLExplorer } from '@/components/MySQLExplorer';
import { RedisExplorer } from '@/components/RedisExplorer';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { cn } from '@/utils/cn';
import { Database } from 'lucide-react';

function App() {
  const { activeConnection } = useConnectionStore();
  const { collapsed, toggle } = useSidebarStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Left Sidebar - Connections */}
      <div
        className={cn(
          "border-r flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out",
          collapsed ? "w-0" : "w-56"
        )}
      >
        <ConnectionList collapsed={collapsed} />
      </div>

      {/* Sidebar Toggle */}
      <button
        onClick={toggle}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-4 h-8 bg-background border border-l-0 border-border rounded-r hover:bg-muted/60 transition-all duration-300 group",
          collapsed ? "left-0" : "left-[224px]"
        )}
        title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
      >
        <div className={cn(
          "transition-transform duration-300",
          collapsed ? "rotate-0" : "rotate-180"
        )}>
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className="text-muted-foreground group-hover:text-foreground">
            <path d="M5 2L1 6L5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Right Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeConnection.connection ? (
          <div className={`h-full min-h-0 ${mounted ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}>
            {activeConnection.connection.type === 'mysql' ? (
              <MySQLExplorer />
            ) : (
              <RedisExplorer />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Database className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                从左侧选择连接开始
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
