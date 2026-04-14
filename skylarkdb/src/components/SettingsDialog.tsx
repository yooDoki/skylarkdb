import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check, Update } from '@tauri-apps/plugin-updater';
import { Button } from './ui/button';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { UpdateChecker } from './UpdateChecker';
import { useSettings, type ThemeMode } from '@/hooks/useSettings';
import { Settings, Cpu, Monitor, Heart, Palette } from 'lucide-react';

const themeLabels: Record<ThemeMode, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
};

export function SettingsDialog() {
  const { settings, updateSetting } = useSettings();
  const [open, setOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [prefetchedUpdate, setPrefetchedUpdate] = useState<Update | null>(null);

  useEffect(() => {
    if (open && !appVersion) {
      getVersion().then(v => setAppVersion(v)).catch(() => setAppVersion('0.1.8'));
    }
  }, [open, appVersion]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const update = await check();
        if (!cancelled) setPrefetchedUpdate(update);
      } catch {
        if (!cancelled) setPrefetchedUpdate(null);
      }
    };

    run();
    const timer = window.setInterval(run, 1000 * 60 * 60 * 6);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="h-9 w-9 rounded-full hover:bg-muted transition-colors"
        title="设置"
      >
        <span className="relative inline-flex">
          <Settings className="h-4 w-4" />
          {!!prefetchedUpdate && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
              aria-label="发现新版本"
            />
          )}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="border-b border-border/70 bg-muted/[0.12] px-5 py-3.5">
            <DialogHeader className="space-y-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary shadow-sm">
                  <Settings className="h-4 w-4" />
                </div>
                <div>
                  <DialogTitle className="text-[17px] font-semibold tracking-tight">
                    设置
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs">
                    外观、应用信息与更新
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="max-h-[60vh] space-y-5 overflow-y-auto px-5 py-5">
            {/* 外观 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                外观
              </Label>
              <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-muted-foreground">主题</span>
                  <Select
                    value={settings.theme}
                    onValueChange={v => updateSetting('theme', v as ThemeMode)}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-[200px]">
                      <SelectValue placeholder="选择主题" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">{themeLabels.light}</SelectItem>
                      <SelectItem value="dark">{themeLabels.dark}</SelectItem>
                      <SelectItem value="system">{themeLabels.system}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  「跟随系统」会随 macOS / Windows 深浅色自动切换，并同步标题栏样式。
                </p>
              </div>
            </div>

            {/* 应用信息 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                应用信息
              </Label>
              <div className="rounded-lg border border-border/70 bg-background/80 shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">应用名称</span>
                  <span className="text-sm font-medium">SkylarkDB</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">版本</span>
                  <span className="text-sm font-mono font-medium">v{appVersion || '...'}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">运行环境</span>
                  <span className="text-sm font-medium">Tauri + React</span>
                </div>
              </div>
            </div>

            {/* 更新检查 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                更新
              </Label>
              <div className="rounded-lg border border-border/70 bg-background/80 px-4 py-3 shadow-sm">
                <UpdateChecker
                  initialUpdate={prefetchedUpdate}
                  onUpdateAvailableChange={(available) => {
                    if (!available) setPrefetchedUpdate(null);
                  }}
                />
              </div>
            </div>

            {/* 致谢 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                致谢
              </Label>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
                <p>基于 Tauri、React、Radix UI 等开源技术构建。</p>
                <p className="mt-1">感谢所有开源社区的贡献者。</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border/70 bg-muted/[0.08] px-5 py-3.5 flex justify-end">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-9 min-w-[80px] rounded-lg border-border/80 bg-background px-4"
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
