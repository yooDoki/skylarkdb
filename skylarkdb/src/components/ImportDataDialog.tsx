import { useState, useCallback } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useConnectionStore } from '@/stores/connectionStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload,
  Loader2,
  Database,
  FileJson,
  FileCode,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { importMySQLData } from '@/utils/api';
import { logError } from '@/utils/errorHandler';
import { cn } from '@/utils/cn';

interface ImportDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const FORMAT_INFO = {
  json: {
    label: 'JSON',
    extension: '.json',
    icon: FileJson,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    description: '适合结构化数据，易于阅读和编辑',
  },
  sql: {
    label: 'SQL',
    extension: '.sql',
    icon: FileCode,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    description: '标准 SQL 导入，支持复杂数据结构',
  },
  csv: {
    label: 'CSV',
    extension: '.csv',
    icon: FileSpreadsheet,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    description: '通用表格格式，兼容 Excel 等工具',
  },
};

export function ImportDataDialog({ open, onOpenChange, onSuccess }: ImportDataDialogProps) {
  const { activeConnection, selectedDatabase } = useConnectionStore();
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [format, setFormat] = useState<'json' | 'sql' | 'csv'>('json');
  const [database, setDatabase] = useState(selectedDatabase || '');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync database when selectedDatabase changes
  if (selectedDatabase && !database) {
    setDatabase(selectedDatabase);
  }

  const handleFileSelect = useCallback(async () => {
    try {
      const result = await openDialog({
        multiple: false,
        filters: [
          {
            name: `${format.toUpperCase()} 文件`,
            extensions: [format === 'sql' ? 'sql' : format],
          },
        ],
      });

      if (result) {
        setFilePath(result);
        // Extract filename from full path for display
        const parts = result.replace(/\\/g, '/').split('/');
        setFileName(parts[parts.length - 1]);
        setError(null);
      }
    } catch (err) {
      console.error('File selection error:', err);
    }
  }, [format]);

  const handleImport = async () => {
    if (!activeConnection.connection || !filePath || !database) {
      setError('请填写完整信息');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      await importMySQLData({
        connectionId: activeConnection.connection.id,
        database,
        filePath,
        format,
        tableMapping: [],
        onConflict: 'ignore',
      });

      onSuccess();
      onOpenChange(false);
      setFilePath('');
      setFileName('');
      if (!selectedDatabase) setDatabase('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logError(errorMessage, '数据导入失败');
      setError(`导入失败：${errorMessage}`);
    } finally {
      setIsImporting(false);
    }
  };

  const currentFormat = FORMAT_INFO[format];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] gap-0 p-0">
        {/* 头部区域 */}
        <div className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-primary/10 p-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shadow-sm">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-xl font-semibold">导入数据</DialogTitle>
                <DialogDescription className="text-sm">
                  从文件导入数据到 MySQL 数据库
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* 内容区域 */}
        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-6">
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="flex-1">{error}</div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => setError(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* 文件格式选择 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">选择文件格式</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(FORMAT_INFO) as Array<keyof typeof FORMAT_INFO>).map(key => {
                const info = FORMAT_INFO[key];
                const Icon = info.icon;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setFormat(key);
                      setFilePath('');
                      setFileName('');
                    }}
                    disabled={isImporting}
                    className="relative flex flex-col items-center gap-2 rounded-lg border p-3 transition-all"
                  >
                    {format === key && (
                      <>
                        <div className="absolute inset-0 border-2 border-primary rounded-lg" />
                        <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-primary" />
                      </>
                    )}
                    <Icon className={cn('h-6 w-6', info.color)} />
                    <span className="text-xs font-medium">{info.label}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {info.extension}
                    </Badge>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{currentFormat.description}</p>
          </div>

          {/* 目标数据库 */}
          <div className="space-y-2">
            <Label htmlFor="database" className="text-sm font-medium">
              目标数据库
            </Label>
            <div className="relative">
              <Database className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="database"
                placeholder="输入数据库名称，例如：mydb"
                value={database}
                onChange={e => setDatabase(e.target.value)}
                disabled={isImporting}
                className="pl-9 h-10"
              />
            </div>
          </div>

          {/* 文件上传区域 */}
          <div className="space-y-2">
            <Label htmlFor="file" className="text-sm font-medium">
              选择文件
            </Label>
            <div
              onClick={handleFileSelect}
              className="group relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-all cursor-pointer hover:border-primary/50"
            >
              {filePath ? (
                <div className="flex items-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground truncate max-w-[300px]" title={fileName}>{fileName}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[300px]" title={filePath}>{filePath}</p>
                    <p className="text-xs text-muted-foreground">点击更换文件</p>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted/50 mx-auto">
                    <Upload className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    点击选择文件
                  </p>
                  <p className="text-xs text-muted-foreground">
                    仅支持 {currentFormat.extension.toUpperCase()} 格式文件
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 导入说明卡片 */}
          <Card className="border-border/50 bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 flex-shrink-0 mt-0.5">
                  <AlertCircle className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-2 text-xs">
                  <p className="font-medium text-foreground">导入说明：</p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                      <span>
                        <strong className="text-foreground">JSON:</strong>{' '}
                        数据应为数组格式，包含要导入的记录对象
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                      <span>
                        <strong className="text-foreground">SQL:</strong> 文件应包含有效的 INSERT
                        语句
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                      <span>
                        <strong className="text-foreground">CSV:</strong>{' '}
                        第一行应为列名，数据行与列名对应
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                      <span>如果目标表不存在，系统会自动创建</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 底部按钮 */}
        <DialogFooter className="border-t border-border/50 bg-muted/30 p-6 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
            className="min-w-[100px]"
          >
            取消
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || !filePath || !database}
            className="min-w-[140px] bg-primary hover:bg-primary/90"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                开始导入
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
