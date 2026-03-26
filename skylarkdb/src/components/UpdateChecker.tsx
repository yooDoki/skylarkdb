import { useState, useEffect } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';

export function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    setIsChecking(true);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable(true);
        setUpdateInfo(update);
      }
    } catch (error) {
      console.error('检查更新失败:', error);
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
      <Button 
        onClick={checkForUpdates} 
        disabled={isChecking}
        className="ml-2"
      >
        {isChecking ? '检查中...' : '检查更新'}
      </Button>
      
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
            <Button onClick={() => setUpdateAvailable(false)}>稍后</Button>
            <Button onClick={handleInstall}>立即更新</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
