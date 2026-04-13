import { useEffect, useMemo, useState } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { RefreshCw, Download, ArrowUpCircle, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

type UpdateCheckerProps = {
  initialUpdate?: Update | null;
  onUpdateAvailableChange?: (available: boolean) => void;
};

const DOWNLOADED_VERSION_KEY = 'skylarkdb.updater.downloadedVersion';

export function UpdateChecker({ initialUpdate, onUpdateAvailableChange }: UpdateCheckerProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<string>('');
  const [checkResult, setCheckResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const downloadedVersion = useMemo(() => {
    try {
      return localStorage.getItem(DOWNLOADED_VERSION_KEY) || '';
    } catch {
      return '';
    }
  }, []);

  useEffect(() => {
    if (initialUpdate) {
      setUpdateAvailable(true);
      setUpdateInfo(initialUpdate);
      setIsDownloaded(initialUpdate.version === downloadedVersion && downloadedVersion.length > 0);
      onUpdateAvailableChange?.(true);
    }
  }, [downloadedVersion, initialUpdate, onUpdateAvailableChange]);

  const checkForUpdates = async () => {
    setIsChecking(true);
    setCheckResult(null);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable(true);
        setUpdateInfo(update);
        setIsDownloaded(update.version === downloadedVersion && downloadedVersion.length > 0);
        onUpdateAvailableChange?.(true);
      } else {
        setCheckResult({ type: 'success', text: '当前已是最新版本' });
        onUpdateAvailableChange?.(false);
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('timed out') || msg.toLowerCase().includes('timeout')) {
        setCheckResult({ type: 'error', text: '检查超时，请稍后重试' });
      } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed') || msg.includes('Could not fetch')) {
        setCheckResult({ type: 'error', text: '网络连接失败，请检查网络后重试' });
      } else if (msg.includes('release JSON') || msg.toLowerCase().includes('json')) {
        setCheckResult({ type: 'error', text: '更新信息解析失败（发布端 latest.json 可能不符合格式）' });
      } else {
        setCheckResult({ type: 'error', text: `检查失败：${msg}` });
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownload = async () => {
    if (!updateInfo) return;
    setIsDownloading(true);
    setInstallProgress('正在下载更新...');
    try {
      await updateInfo.download((event) => {
        switch (event.event) {
          case 'Started':
            setInstallProgress('正在下载更新...');
            break;
          case 'Progress':
            setInstallProgress('正在下载更新...');
            break;
          case 'Finished':
            setInstallProgress('下载完成，可在方便时重启更新');
            break;
        }
      });
      setIsDownloaded(true);
      try {
        localStorage.setItem(DOWNLOADED_VERSION_KEY, updateInfo.version);
      } catch {
        // ignore
      }
    } catch (error) {
      console.error('下载更新失败:', error);
      const msg = error instanceof Error ? error.message : String(error);
      setInstallProgress(`下载失败：${msg}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRestartToUpdate = async () => {
    if (!updateInfo) return;
    setIsInstalling(true);
    setInstallProgress('正在安装更新...');
    try {
      await updateInfo.install();
      setInstallProgress('安装完成，即将重启...');
      await relaunch();
    } catch (error) {
      console.error('安装更新失败:', error);
      const msg = error instanceof Error ? error.message : String(error);
      setInstallProgress(`安装失败：${msg}`);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          {checkResult && (
            <span className={cn(
              'text-xs',
              checkResult.type === 'success' ? 'text-emerald-600' : 'text-muted-foreground'
            )}>
              {checkResult.text}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkForUpdates}
          disabled={isChecking}
          className="h-8 rounded-lg border-border/80 px-3 text-xs"
        >
          {isChecking ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5 mr-1.5" />
          )}
          {isChecking ? '检查中...' : '检查更新'}
        </Button>
      </div>

      <Dialog open={updateAvailable} onOpenChange={(open) => {
        if (!isDownloading && !isInstalling) setUpdateAvailable(open);
      }}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="border-b border-border/70 bg-gradient-to-r from-primary/[0.08] to-primary/[0.03] px-5 py-3.5">
            <DialogHeader className="space-y-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary shadow-sm">
                  <ArrowUpCircle className="h-4 w-4" />
                </div>
                <div>
                  <DialogTitle className="text-[17px] font-semibold tracking-tight">
                    发现新版本
                  </DialogTitle>
                  <DialogDescription className="text-xs mt-0.5">
                    新版本已准备就绪，可以立即更新
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="px-5 py-5 space-y-4">
            {/* 版本信息 */}
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3">
              <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">新版本</span>
                  <span className="text-sm font-mono font-semibold text-primary">
                    v{updateInfo?.version}
                  </span>
                  <span className="text-xs text-muted-foreground">←</span>
                  <span className="text-xs text-muted-foreground">v{updateInfo?.currentVersion}</span>
                </div>
              </div>
            </div>

            {/* 安装进度 */}
            {(isDownloading || isInstalling || installProgress) && (
              <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3">
                {(isDownloading || isInstalling) ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                )}
                <span className="text-sm text-primary">{installProgress}</span>
              </div>
            )}

            {/* 更新说明 */}
            {updateInfo?.body && (
              <div className="space-y-2">
                <span className="text-[13px] font-semibold text-foreground">更新说明</span>
                <div className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm text-muted-foreground leading-relaxed max-h-[40vh] overflow-y-auto">
                  {updateInfo.body}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/70 bg-muted/[0.08] px-5 py-3.5">
            <DialogFooter className="gap-2.5">
              <Button
                variant="outline"
                onClick={() => setUpdateAvailable(false)}
                disabled={isDownloading || isInstalling}
                className="h-9 min-w-[80px] rounded-lg border-border/80 bg-background px-4"
              >
                稍后
              </Button>
              <Button
                onClick={isDownloaded ? handleRestartToUpdate : handleDownload}
                disabled={isDownloading || isInstalling}
                className="h-9 min-w-[80px] rounded-lg px-4 shadow-sm"
              >
                {(isDownloading || isInstalling) ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1.5" />
                )}
                {isDownloading ? '下载中...' : isInstalling ? '安装中...' : isDownloaded ? '重启更新' : '下载更新'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
