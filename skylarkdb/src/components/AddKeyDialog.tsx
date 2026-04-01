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

    setIsCreating(true);
    setError(null);

    try {
      const ttlValue = ttl.trim() ? parseInt(ttl, 10) : undefined;
      if (ttlValue && ttlValue <= 0) {
        setError('TTL 必须大于 0');
        setIsCreating(false);
        return;
      }

      await setRedisKey(
        activeConnection.connection.id,
        keyName.trim(),
        value.trim(),
        keyType,
        ttlValue
      );

      // 重置表单
      setKeyName('');
      setValue('');
      setTtl('');
      setKeyType('string');
      onSuccess();
      onOpenChange?.(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setKeyName('');
    setValue('');
    setTtl('');
    setKeyType('string');
    onOpenChange?.(false);
  };

  const getCommandPreview = () => {
    if (keyType === 'string') {
      return `SET "${keyName || 'key'}" "${value || 'value'}"${ttl ? ` EX ${ttl}` : ''}`;
    }
    return `SETEX "${keyName || 'key'}" ${ttl || '0'} "${value || 'data'}"`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-redis/20 to-redis/10 flex items-center justify-center">
              <Key className="h-4 w-4 text-redis" />
            </div>
            <div>
              <DialogTitle className="text-lg">新建 Redis 键</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                在当前数据库中创建新的键值对
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 p-3 border border-destructive/50 bg-destructive/10 rounded-lg">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="space-y-4 py-2">
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
                className="font-mono"
                disabled={isReadOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="keyType" className="text-sm font-medium flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                类型
              </Label>
              <Select value={keyType} onValueChange={setKeyType} disabled={isReadOnly}>
                <SelectTrigger id="keyType" className="font-mono">
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
              className="w-full min-h-[120px] px-3 py-2 text-sm font-mono bg-background border border-input rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-redis/20 focus:border-transparent transition-all"
              disabled={isReadOnly}
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
              className="font-mono w-48"
              min="1"
              disabled={isReadOnly}
            />
          </div>

          {/* 命令预览 */}
          <Card className="border-dashed bg-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">命令预览</span>
              </div>
              <code className="text-xs font-mono bg-muted px-2 py-1.5 rounded block break-all">
                {getCommandPreview()}
              </code>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || isReadOnly}
            className="bg-redis hover:bg-redis/90 text-white"
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
      </DialogContent>
    </Dialog>
  );
}
