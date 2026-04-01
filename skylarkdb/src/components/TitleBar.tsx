/**
 * 自定义标题栏组件
 * 
 * 功能：
 * 1. 左侧：应用图标 + 标题（可拖拽区域）
 * 2. 右侧：最小化、最大化、关闭按钮
 * 3. 支持双击标题栏最大化/还原窗口
 * 4. 支持鼠标拖拽移动窗口
 * 5. Windows 沉浸式无边框样式
 */

import { useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Database, Minus, Square, X, Copy, Settings } from 'lucide-react';
import { cn } from '@/utils/cn';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Button } from '@/components/ui/button';

export function TitleBar() {
  // 窗口最大化状态
  const [isMaximized, setIsMaximized] = useState(false);
  
  // 获取当前窗口实例
  const appWindow = getCurrentWindow();

  /**
   * 监听窗口最大化状态变化
   * 使用 Tauri 事件监听窗口大小变化
   */
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    
    const setupListener = async () => {
      // 初始检查窗口状态
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
      
      // 监听窗口大小变化事件
      unlisten = await appWindow.onResized(async () => {
        const newMaximized = await appWindow.isMaximized();
        setIsMaximized(newMaximized);
      });
    };
    
    setupListener();
    
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [appWindow]);

  /**
   * 最小化窗口
   */
  const handleMinimize = useCallback(async () => {
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error('最小化窗口失败:', error);
    }
  }, [appWindow]);

  /**
   * 最大化/还原窗口
   */
  const handleMaximize = useCallback(async () => {
    try {
      if (isMaximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (error) {
      console.error('最大化窗口失败:', error);
    }
  }, [appWindow, isMaximized]);

  /**
   * 关闭窗口
   */
  const handleClose = useCallback(async () => {
    try {
      await appWindow.close();
    } catch (error) {
      console.error('关闭窗口失败:', error);
    }
  }, [appWindow]);

  /**
   * 双击标题栏 - 最大化/还原窗口
   */
  const handleDoubleClick = useCallback(async (e: React.MouseEvent) => {
    // 如果点击的是按钮区域，不触发最大化
    if ((e.target as HTMLElement).closest('.window-controls')) {
      return;
    }
    await handleMaximize();
  }, [handleMaximize]);

  /**
   * 开始拖拽窗口
   * 使用 Tauri 的 startDragging API
   */
  const handleDragStart = useCallback(async () => {
    try {
      await appWindow.startDragging();
    } catch (error) {
      console.error('拖拽窗口失败:', error);
    }
  }, [appWindow]);

  return (
    <div
      className={cn(
        'h-9 flex items-center justify-between select-none',
        'bg-background/80 backdrop-blur-md border-b border-border/50',
        'transition-colors duration-200'
      )}
      onDoubleClick={handleDoubleClick}
    >
      {/* 左侧：可拖拽区域（图标 + 标题） */}
      <div
        className="flex-1 flex items-center gap-2 px-3 h-full cursor-default"
        data-tauri-drag-region
        onMouseDown={handleDragStart}
      >
        {/* 应用图标 */}
        <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10">
          <Database className="h-3 w-3 text-primary" />
        </div>
        
        {/* 应用标题 */}
        <span className="text-xs font-medium text-foreground/90">
          SkylarkDB
        </span>
        
        {/* 版本号 */}
        <span className="text-[10px] text-muted-foreground">
          v0.1.8
        </span>
      </div>

      {/* 右侧：设置按钮 + 窗口控制按钮 */}
      <div className="window-controls flex items-center h-full">
        {/* 设置按钮 */}
        <SettingsDialog
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="h-full w-10 rounded-none border-none bg-transparent hover:bg-muted/80"
              title="设置 (⌘,)"
            >
              <Settings className="h-4 w-4" />
            </Button>
          }
        />

        {/* 最小化按钮 */}
        <button
          onClick={handleMinimize}
          className={cn(
            'h-full w-10 flex items-center justify-center',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-muted/80 transition-colors duration-150',
            'focus:outline-none focus:bg-muted'
          )}
          title="最小化"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        {/* 最大化/还原按钮 */}
        <button
          onClick={handleMaximize}
          className={cn(
            'h-full w-10 flex items-center justify-center',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-muted/80 transition-colors duration-150',
            'focus:outline-none focus:bg-muted'
          )}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <Copy className="h-3 w-3" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </button>

        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          className={cn(
            'h-full w-10 flex items-center justify-center',
            'text-muted-foreground hover:text-white',
            'hover:bg-red-500 transition-colors duration-150',
            'focus:outline-none focus:bg-red-500'
          )}
          title="关闭"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
