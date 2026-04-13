import { useState, useCallback, useEffect, useRef } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { setRedisKey } from '@/utils/api';
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
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Loader2,
  AlertCircle,
  Key,
  Hash,
  List,
  Layers,
  Database,
  Sparkles,
  Clock,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const KEY_TYPES = [
  { value: 'string', label: 'String', icon: Key, color: 'text-blue-500' },
  { value: 'hash', label: 'Hash', icon: Hash, color: 'text-green-500' },
  { value: 'list', label: 'List', icon: List, color: 'text-yellow-500' },
  { value: 'set', label: 'Set', icon: Layers, color: 'text-purple-500' },
  { value: 'zset', label: 'Sorted Set', icon: Database, color: 'text-red-500' },
];

interface AddKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddKeyDialog({ open, onOpenChange, onSuccess }: AddKeyDialogProps) {
  const { activeConnection } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;
  const [keyName, setKeyName] = useState('');
  const [keyType, setKeyType] = useState('string');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyNameInputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦到键名输入框
  useEffect(() => {
    if (open && keyNameInputRef.current) {
      setTimeout(() => keyNameInputRef.current?.focus(), 100);
    }
  }, [open]);

  // 表单重置
  useEffect(() => {
    if (!open) {
      setKeyName('');
      setKeyType('string');
      setValue('');
      setTtl('');
      setError(null);
    }
  }, [open]);

  const getValuePlaceholder = useCallback(() => {
    switch (keyType) {
      case 'string':
        return '输入字符串值...';
      case 'hash':
        return '{"field1": "value1", "field2": "value2"}';
      case 'list':
        return '["item1", "item2", "item3"]';
      case 'set':
        return '["member1", "member2", "member3"]';
      case 'zset':
        return '[["member1", 1.0], ["member2", 2.0]]';
      default:
        return '输入值...';
    }
  }, [keyType]);

  const handleCreate = async () => {
    if (!activeConnection.connection?.id) return;
    if (isReadOnly) {
      setError('当前连接为只读模式，不能创建键');
      return;
    }
    if (!keyName.trim()) {
      setError('请输入键名');
      return;
    }
    if (!value.trim()) {
      setError('请输入值');
      return;
    }

    // 验证 JSON 格式
    if (keyType !== 'string') {
      try {
        JSON.parse(value);
      } catch {
        setError('值必须是有效的 JSON 格式');
        return;
      }
    }

    const ttlValue = ttl.trim() ? parseInt(ttl, 10) : undefined;
    if (ttlValue && ttlValue <= 0) {
      setError('TTL 必须大于 0');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await setRedisKey(
        activeConnection.connection.id,
        keyName.trim(),
        value.trim(),
        keyType,
        ttlValue
      );

      onSuccess();
      onOpenChange?.(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const getCommandPreview = () => {
    if (keyType === 'string') {
      return `SET "${keyName || 'key'}" "${value || 'value'}"${ttl ? ` EX ${ttl}` : ''}`;
    }
    return `SETEX "${keyName || 'key'}" ${ttl || '0'} "${value || 'data'}"`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-2xl p-0 gap-0 overflow-hidden"
        onSubmit={handleCreate}
        submitDisabled={isCreating || isReadOnly}
      >
        {/* Header */}
        <div className="border-b border-border/70 bg-muted/[0.12] px-5 py-3.5">
          <DialogHeader className="space-y-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-redis/15 bg-redis/10 text-redis shadow-sm">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-[17px] font-semibold tracking-tight">新建 Redis 键</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  在当前数据库中创建新的键值对
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-5 py-5 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 border border-destructive/40 bg-destructive/8 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive leading-relaxed">{error}</p>
            </div>
          )}
          {/* 第一行：键名 + 类型 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="keyName" className="text-sm font-medium flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                键名
                <span className="text-xs text-destructive">*</span>
              </Label>
              <Input
                id="keyName"
                ref={keyNameInputRef}
                value={keyName}
                onChange={e => setKeyName(e.target.value)}
                placeholder="user:1001"
                className="font-mono h-10 rounded-lg border-border/80"
                disabled={isReadOnly || isCreating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="keyType" className="text-sm font-medium flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                类型
              </Label>
              <Select value={keyType} onValueChange={setKeyType} disabled={isReadOnly || isCreating}>
                <SelectTrigger id="keyType" className="font-mono h-10 rounded-lg border-border/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KEY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className={cn('h-4 w-4', type.color)} />
                        <span className="font-medium">{type.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 值输入区 */}
          <div className="space-y-2">
            <Label htmlFor="keyValue" className="text-sm font-medium flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />值
              <span className="text-xs text-destructive">*</span>
              {keyType !== 'string' && (
                <span className="text-xs text-muted-foreground ml-1">(JSON 格式)</span>
              )}
            </Label>
            <textarea
              id="keyValue"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={getValuePlaceholder()}
              className="w-full min-h-[120px] px-3.5 py-3 text-[13px] font-mono leading-relaxed bg-background border border-border/80 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-redis/20 focus:border-redis/30 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]"
              disabled={isReadOnly || isCreating}
              spellCheck={false}
            />
          </div>

          {/* TTL */}
          <div className="space-y-2">
            <Label htmlFor="ttl" className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              TTL (秒)
              <span className="text-xs text-muted-foreground font-normal">
                (可选，不填则永久保存)
              </span>
            </Label>
            <Input
              id="ttl"
              type="number"
              value={ttl}
              onChange={e => setTtl(e.target.value)}
              placeholder="例如：3600 (1 小时)"
              className="font-mono w-48 h-10 rounded-lg border-border/80"
              min="1"
              disabled={isReadOnly || isCreating}
            />
          </div>

          {/* 命令预览 */}
          <Card className="border-border/50 bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">命令预览</span>
              </div>
              <code className="text-xs font-mono bg-muted px-3 py-2 rounded-lg block break-all leading-relaxed">
                {getCommandPreview()}
              </code>
            </CardContent>
          </Card>

          {/* 提示信息 */}
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
            <p className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              提示: 按 <kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono">Ctrl/⌘ + Enter</kbd> 快速提交
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/70 bg-muted/[0.08] px-5 py-3.5">
          <DialogFooter className="gap-2.5">
            <Button
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              disabled={isCreating}
              className="h-9 min-w-[80px] rounded-lg border-border/80 bg-background px-4"
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating || isReadOnly}
              className="h-9 min-w-[80px] rounded-lg px-4 bg-redis hover:bg-redis/90 shadow-[0_8px_18px_-10px_rgba(225,85,50,0.55)]"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  创建中...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  创建键
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
