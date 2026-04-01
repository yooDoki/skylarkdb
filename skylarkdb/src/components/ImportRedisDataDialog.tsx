import { useState, useRef } from 'react';
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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload,
  Loader2,
  FileJson,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { importRedisData } from '@/utils/api';
import { logError } from '@/utils/errorHandler';
import { cn } from '@/utils/cn';

interface ImportRedisDataDialogProps {
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
    description: '标准格式，包含 key、type、value 字段',
  },
  txt: {
    label: 'TXT',
    extension: '.txt',
    icon: FileText,
    color: 'text-green-500',
    description: '简单格式，每行一个 key=value',
  },
};

export function ImportRedisDataDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportRedisDataDialogProps) {
  const { activeConnection } = useConnectionStore();
  const [filePath, setFilePath] = useState('');
  const [format, setFormat] = useState<'json' | 'txt'>('json');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const filePath = (file as any).webkitRelativePath || file.name;
      setFilePath(filePath);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!activeConnection.connection || !filePath) {
      setError('请选择文件');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      await importRedisData({
        connectionId: activeConnection.connection.id,
        filePath,
        format: format as any,
      });

      onSuccess();
      onOpenChange(false);
      setFilePath('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logError(errorMessage, 'Redis 数据导入失败');
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
        <div className="border-b border-border/50 bg-gradient-to-r from-redis/5 to-redis/10 p-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-redis/10 shadow-sm">
                <Upload className="h-6 w-6 text-redis" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-xl font-semibold">导入 Redis 数据</DialogTitle>
                <DialogDescription className="text-sm">
                  从文件导入键值对到 Redis 数据库
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
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FORMAT_INFO) as Array<keyof typeof FORMAT_INFO>).map(key => {
                const info = FORMAT_INFO[key];
                const Icon = info.icon;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setFormat(key);
                      setFilePath('');
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    disabled={isImporting}
                    className="relative flex flex-col items-center gap-2 rounded-lg border p-3 transition-all"
                  >
                    {format === key && (
                      <>
                        <div className="absolute inset-0 border-2 border-redis rounded-lg" />
                        <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-redis" />
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

          {/* 文件上传区域 */}
          <div className="space-y-2">
            <Label htmlFor="file" className="text-sm font-medium">
              选择文件
            </Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-all cursor-pointer"
            >
              <input
                ref={fileInputRef}
                id="file"
                type="file"
                accept={`.${format}`}
                onChange={handleFileSelect}
                disabled={isImporting}
                className="hidden"
              />
              {filePath ? (
                <div className="flex items-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-redis/10">
                    <CheckCircle2 className="h-6 w-6 text-redis" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{filePath}</p>
                    <p className="text-xs text-muted-foreground">点击更换文件</p>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted/50 mx-auto">
                    <Upload className="h-7 w-7 text-muted-foreground group-hover:text-redis transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    点击选择文件或拖拽文件到此处
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
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-redis/10 flex-shrink-0 mt-0.5">
                  <AlertCircle className="h-4 w-4 text-redis" />
                </div>
                <div className="space-y-2 text-xs">
                  <p className="font-medium text-foreground">导入说明：</p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                      <span>
                        <strong className="text-foreground">JSON:</strong> 数组格式，每个元素包含
                        key、type、value 字段
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                      <span>
                        <strong className="text-foreground">TXT:</strong> 每行一个 key=value，支持 #
                        注释
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                      <span>如果键已存在，将覆盖原有值</span>
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
            disabled={isImporting || !filePath}
            className="min-w-[140px] bg-redis hover:bg-redis/90"
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
