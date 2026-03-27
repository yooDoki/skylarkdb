import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
  DialogTitle,
} from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { UpdateChecker } from './UpdateChecker';
import { useSettings, type ThemeMode } from '@/hooks/useSettings';
import { getVersion } from '@tauri-apps/api/app';
import { useState, useEffect } from 'react';
import {
  Settings,
  Info,
  Palette,
  Database,
  Check,
  Sun,
  Moon,
  Monitor,
  RotateCcw,
  Keyboard,
  AlertTriangle,
  Layout,
  Code,
} from 'lucide-react';

interface SettingsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function SettingsDialog({ open: controlledOpen, onOpenChange, trigger }: SettingsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const { settings, updateSetting, resetSettings, isLoaded } = useSettings();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('unknown'));
  }, []);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  // Handle keyboard shortcut (Cmd/Ctrl + ,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setOpen]);

  const ThemeOption = ({ value, icon: Icon, label }: { value: ThemeMode; icon: typeof Sun; label: string }) => (
    <button
      onClick={() => updateSetting('theme', value)}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all ${
        settings.theme === value
          ? 'border-primary bg-primary/5 ring-1 ring-primary/60 shadow-sm'
          : 'border-border bg-background hover:border-primary/25 hover:bg-accent/40'
      }`}
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
        settings.theme === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium leading-none">{label}</span>
      {settings.theme === value && <Check className="ml-auto h-4 w-4 text-primary" />}
    </button>
  );

  const SettingRow = ({
    label,
    description,
    children,
    id,
  }: {
    label: string;
    description?: string;
    children: React.ReactNode;
    id?: string;
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );

  const handleReset = () => {
    resetSettings();
    setShowResetConfirm(false);
  };

  if (!isLoaded) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-muted transition-colors"
              title="设置 (⌘,)"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </DialogTrigger>

        <DialogContent className="sm:max-w-[560px] h-[600px] max-h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              设置
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              自定义 SkylarkDB 的外观和行为
            </p>
          </DialogHeader>

          <Tabs defaultValue="appearance" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pb-2">
              <TabsList className="grid w-full grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1">
                <TabsTrigger value="appearance" className="flex items-center gap-1.5 rounded-lg text-[13px]">
                  <Palette className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">外观</span>
                </TabsTrigger>
                <TabsTrigger value="editor" className="flex items-center gap-1.5 rounded-lg text-[13px]">
                  <Code className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">编辑器</span>
                </TabsTrigger>
                <TabsTrigger value="connection" className="flex items-center gap-1.5 rounded-lg text-[13px]">
                  <Database className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">连接</span>
                </TabsTrigger>
                <TabsTrigger value="about" className="flex items-center gap-1.5 rounded-lg text-[13px]">
                  <Info className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">关于</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden">
              {/* Appearance Tab */}
              <TabsContent value="appearance" className="h-full mt-0">
                <ScrollArea className="h-full px-6 py-4">
                  <div className="space-y-4 pb-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Palette className="h-4 w-4 text-primary" />
                          主题
                        </CardTitle>
                        <CardDescription className="text-xs">选择您喜欢的外观主题</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-3">
                          <ThemeOption value="light" icon={Sun} label="浅色模式" />
                          <ThemeOption value="dark" icon={Moon} label="深色模式" />
                          <ThemeOption value="system" icon={Monitor} label="跟随系统" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Layout className="h-4 w-4 text-primary" />
                          界面
                        </CardTitle>
                        <CardDescription className="text-xs">调整界面显示选项</CardDescription>
                      </CardHeader>
                      <CardContent className="py-0">
                        <SettingRow
                          id="show-status-bar"
                          label="显示状态栏"
                          description="在窗口底部显示连接状态和操作信息"
                        >
                          <Switch
                            id="show-status-bar"
                            checked={settings.showStatusBar}
                            onCheckedChange={(v) => updateSetting('showStatusBar', v)}
                          />
                        </SettingRow>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Editor Tab */}
              <TabsContent value="editor" className="h-full mt-0">
                <ScrollArea className="h-full px-6 py-4">
                  <div className="space-y-4 pb-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Code className="h-4 w-4 text-primary" />
                          编辑器设置
                        </CardTitle>
                        <CardDescription className="text-xs">配置 SQL 编辑器行为</CardDescription>
                      </CardHeader>
                      <CardContent className="py-0">
                        <SettingRow
                          id="show-line-numbers"
                          label="显示行号"
                          description="在编辑器左侧显示行号"
                        >
                          <Switch
                            id="show-line-numbers"
                            checked={settings.showLineNumbers}
                            onCheckedChange={(v) => updateSetting('showLineNumbers', v)}
                          />
                        </SettingRow>

                        <SettingRow
                          id="word-wrap"
                          label="自动换行"
                          description="长行自动换行显示"
                        >
                          <Switch
                            id="word-wrap"
                            checked={settings.wordWrap}
                            onCheckedChange={(v) => updateSetting('wordWrap', v)}
                          />
                        </SettingRow>

                        <SettingRow
                          id="auto-save"
                          label="自动保存"
                          description="自动保存编辑器中的更改"
                        >
                          <Switch
                            id="auto-save"
                            checked={settings.autoSave}
                            onCheckedChange={(v) => updateSetting('autoSave', v)}
                          />
                        </SettingRow>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Connection Tab */}
              <TabsContent value="connection" className="h-full mt-0">
                <ScrollArea className="h-full px-6 py-4">
                  <div className="space-y-4 pb-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Database className="h-4 w-4 text-primary" />
                          连接设置
                        </CardTitle>
                        <CardDescription className="text-xs">配置数据库连接选项</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="timeout" className="text-sm">连接超时（秒）</Label>
                          <div className="flex items-center gap-3">
                            <Input
                              id="timeout"
                              type="number"
                              min={5}
                              max={300}
                              value={settings.connectionTimeout}
                              onChange={(e) => updateSetting('connectionTimeout', Number(e.target.value))}
                              className="w-24"
                            />
                            <span className="text-sm text-muted-foreground">
                              范围: 5-300 秒
                            </span>
                          </div>
                        </div>

                        <div className="border-t border-border pt-4">
                          <SettingRow
                            id="auto-reconnect"
                            label="自动重连"
                            description="连接断开时自动尝试重新连接"
                          >
                            <Switch
                              id="auto-reconnect"
                              checked={settings.autoReconnect}
                              onCheckedChange={(v) => updateSetting('autoReconnect', v)}
                            />
                          </SettingRow>
                        </div>

                        <div className="border-t border-border pt-4">
                          <SettingRow
                            id="confirm-before-delete"
                            label="删除前确认"
                            description="删除数据前显示确认对话框"
                          >
                            <Switch
                              id="confirm-before-delete"
                              checked={settings.confirmBeforeDelete}
                              onCheckedChange={(v) => updateSetting('confirmBeforeDelete', v)}
                            />
                          </SettingRow>
                        </div>

                        <div className="border-t border-border pt-4 space-y-2">
                          <Label htmlFor="rows-per-page" className="text-sm">默认每页行数</Label>
                          <div className="flex items-center gap-3">
                            <Input
                              id="rows-per-page"
                              type="number"
                              min={10}
                              max={200}
                              step={10}
                              value={settings.rowsPerPage}
                              onChange={(e) => updateSetting('rowsPerPage', Number(e.target.value))}
                              className="w-24"
                            />
                            <span className="text-sm text-muted-foreground">
                              范围: 10-200 行
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-destructive/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-destructive flex items-center gap-2">
                          <RotateCcw className="h-4 w-4" />
                          重置设置
                        </CardTitle>
                        <CardDescription className="text-xs">
                          将所有设置恢复为默认值
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {showResetConfirm ? (
                          <div className="flex items-center gap-3 p-3 bg-destructive/10 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-destructive">确定要重置所有设置吗？</p>
                              <p className="text-xs text-muted-foreground">此操作不可撤销</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowResetConfirm(false)}
                              >
                                取消
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleReset}
                              >
                                重置
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowResetConfirm(true)}
                            className="text-destructive border-destructive/50 hover:bg-destructive/10"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            重置为默认值
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* About Tab */}
              <TabsContent value="about" className="h-full mt-0">
                <ScrollArea className="h-full px-6 py-4">
                  <div className="space-y-4 pb-4">
                    <div className="text-center py-6">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                        <Database className="h-8 w-8 text-primary-foreground" />
                      </div>
                      <h2 className="text-xl font-bold">SkylarkDB</h2>
                      <p className="text-sm text-muted-foreground">现代化的数据库管理工具</p>
                    </div>

                    <Card>
                      <CardContent className="p-0">
                        <div className="flex items-center justify-between py-3 px-4 border-b border-border">
                          <span className="text-sm text-muted-foreground">版本</span>
                          <span className="text-sm font-mono font-medium">v{appVersion || '...'}</span>
                        </div>
                        <div className="flex items-center justify-between py-3 px-4 border-b border-border">
                          <span className="text-sm text-muted-foreground">许可证</span>
                          <span className="text-sm font-medium">MIT</span>
                        </div>
                        <div className="flex items-center justify-between py-3 px-4">
                          <span className="text-sm text-muted-foreground">检查更新</span>
                          <UpdateChecker />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">支持的数据库</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                          <div className="w-10 h-10 rounded-lg bg-mysql/10 flex items-center justify-center">
                            <Database className="h-5 w-5 text-mysql" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">MySQL</div>
                            <div className="text-xs text-muted-foreground">关系型数据库</div>
                          </div>
                          <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">已支持</span>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                          <div className="w-10 h-10 rounded-lg bg-redis/10 flex items-center justify-center">
                            <Database className="h-5 w-5 text-redis" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">Redis</div>
                            <div className="text-xs text-muted-foreground">键值存储</div>
                          </div>
                          <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">已支持</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Keyboard className="h-4 w-4" />
                          快捷键
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="flex items-center justify-between py-2.5 px-4 border-b border-border">
                          <span className="text-sm text-muted-foreground">打开设置</span>
                          <kbd className="px-2 py-0.5 text-xs bg-muted rounded border font-mono">
                            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + ,
                          </kbd>
                        </div>
                        <div className="flex items-center justify-between py-2.5 px-4 border-b border-border">
                          <span className="text-sm text-muted-foreground">执行查询</span>
                          <kbd className="px-2 py-0.5 text-xs bg-muted rounded border font-mono">
                            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + Enter
                          </kbd>
                        </div>
                        <div className="flex items-center justify-between py-2.5 px-4">
                          <span className="text-sm text-muted-foreground">格式化 SQL</span>
                          <kbd className="px-2 py-0.5 text-xs bg-muted rounded border font-mono">
                            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + Shift + F
                          </kbd>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
