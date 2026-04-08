import { useState } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { RefreshCw, Download } from 'lucide-react';

export function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string>('');

  const checkForUpdates = async () => {
    setIsChecking(true);
    setCheckResult('');
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable(true);
        setUpdateInfo(update);
      } else {
        setCheckResult('当前已是最新版本');
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      setCheckResult('检查失败，请稍后重试');
    } finally {
      setIsChecking(false);
    }
  };

  const handleInstall = async () => {
    if (updateInfo) {
      try {
        await updateInfo.downloadAndInstall((event) => {
          if (event.event === 'Finished') {
            console.log('更新完成，需要重启应用');
          }
        });
      } catch (error) {
        console.error('安装更新失败:', error);
      }
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {checkResult && (
          <span className="text-xs text-muted-foreground">{checkResult}</span>
        )}
        <Button 
          variant="outline"
          size="sm"
          onClick={checkForUpdates} 
          disabled={isChecking}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>发现新版本</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>版本: {updateInfo?.version}</p>
            <p className="mt-2">更新说明: {updateInfo?.body}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateAvailable(false)}>稍后</Button>
            <Button onClick={handleInstall}>立即更新</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
