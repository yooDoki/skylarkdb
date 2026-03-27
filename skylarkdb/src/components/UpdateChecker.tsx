import { useState, useEffect } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { RefreshCw, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from './ui/card';

export function UpdateChecker({ autoCheck = false, currentVersion }: { autoCheck?: boolean; currentVersion?: string }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [checkResult, setCheckResult] = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const normalizeUpdateError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();

    if (
      lower.includes('404')
      || lower.includes('not found')
      || lower.includes('failed to deserialize response')
    ) {
      return {
        silent: true,
        result: '暂未获取到更新信息',
        error: null,
      };
    }

    return {
      silent: false,
      result: '检查失败',
      error: message || '检查更新时发生未知错误',
    };
  };

  const checkForUpdates = async () => {
    setIsChecking(true);
    setCheckResult('');
    setError(null);
    setDownloadProgress(0);
    
    try {
      const update = await check();
      
      if (update) {
        setUpdateInfo(update);
        setUpdateAvailable(true);
        setCheckResult(`发现新版本 v${update.version}`);
      } else {
        setCheckResult('当前已是最新版本');
      }
    } catch (err) {
      console.error('检查更新失败:', err);
      const normalized = normalizeUpdateError(err);
      setError(normalized.error);
      setCheckResult(normalized.result);
    } finally {
      setIsChecking(false);
    }
  };

  const handleInstall = async () => {
    if (!updateInfo) return;
    
    setIsInstalling(true);
    setDownloadProgress(0);
    
    try {
      await updateInfo.downloadAndInstall((event: any) => {
        console.log('更新事件:', event);
        
        if (event.event === 'Started') {
          setDownloadProgress(0);
        } else if (event.event === 'Progress') {
          const { contentLength, downloaded } = event.data;
          if (contentLength) {
            const progress = Math.round((downloaded / contentLength) * 100);
            setDownloadProgress(progress);
          }
        } else if (event.event === 'Finished') {
          setDownloadProgress(100);
        }
      });
      
      setUpdateAvailable(false);
    } catch (err) {
      console.error('安装更新失败:', err);
      setError(err instanceof Error ? err.message : '安装更新时发生未知错误');
    } finally {
      setIsInstalling(false);
    }
  };

  useEffect(() => {
    if (autoCheck) {
      checkForUpdates();
    }
  }, [autoCheck]);

  return (
    <>
      <div className="flex items-center gap-2">
        {checkResult && (
          <span className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
            {checkResult}
          </span>
        )}
        <Button 
          variant="outline"
          size="sm"
          onClick={checkForUpdates} 
          disabled={isChecking || isInstalling}
          className="h-7 text-xs"
        >
          {isChecking ? (
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Download className="h-3 w-3 mr-1" />
          )}
          {isChecking ? '检查中...' : '检查更新'}
        </Button>
      </div>
      
      <Dialog open={updateAvailable} onOpenChange={setUpdateAvailable}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              发现新版本
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              SkylarkDB {updateInfo?.version} 可用，您当前的版本是 {currentVersion || '未知'}
            </p>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {updateInfo?.body && (
              <Card>
                <CardContent className="pt-4">
                  <h4 className="text-sm font-medium mb-2">更新说明</h4>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {updateInfo.body}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {isInstalling && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>下载中...</span>
                  <span>{downloadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}
            
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setUpdateAvailable(false)}
              disabled={isInstalling}
            >
              稍后
            </Button>
            <Button 
              onClick={handleInstall} 
              disabled={isInstalling}
              className="gap-2"
            >
              {isInstalling ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  安装中...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  立即更新
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
