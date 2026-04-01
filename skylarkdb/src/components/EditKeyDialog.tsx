import { useState, useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { setRedisKey, setRedisKeyTTL, renameRedisKey } from '@/utils/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Loader2, AlertCircle, Clock, Edit3 } from 'lucide-react';

interface EditKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyName: string;
  keyType: string;
  currentValue: string;
  currentTTL: number;
  onSuccess: () => void;
}

export function EditKeyDialog({
  open,
  onOpenChange,
  keyName,
  keyType,
  currentValue,
  currentTTL,
  onSuccess,
}: EditKeyDialogProps) {
  const { activeConnection } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;
  const [editMode, setEditMode] = useState<'value' | 'ttl' | 'rename'>('value');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(currentValue);
      setTtl(currentTTL === -1 ? '' : String(currentTTL));
      setNewKeyName(keyName);
      setError(null);
    }
  }, [open, currentValue, currentTTL, keyName]);

  const handleSave = async () => {
    if (!activeConnection.connection?.id) return;
    if (isReadOnly) {
      setError('当前连接为只读模式，不能修改键');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (editMode === 'value') {
        // 验证 JSON 格式（非 string 类型）
        if (keyType !== 'string') {
          try {
            JSON.parse(value);
          } catch {
            setError('值必须是有效的 JSON 格式');
            setIsSaving(false);
            return;
          }
        }
        await setRedisKey(activeConnection.connection.id, keyName, value, keyType);
      } else if (editMode === 'ttl') {
        const ttlValue = ttl.trim() ? parseInt(ttl, 10) : -1;
        if (ttlValue !== -1 && ttlValue <= 0) {
          setError('TTL 必须大于 0');
          setIsSaving(false);
          return;
        }
        await setRedisKeyTTL(activeConnection.connection.id, keyName, ttlValue);
      } else if (editMode === 'rename') {
        if (!newKeyName.trim()) {
          setError('请输入新的键名');
          setIsSaving(false);
          return;
        }
        if (newKeyName === keyName) {
          setError('新键名不能与原键名相同');
          setIsSaving(false);
          return;
        }
        await renameRedisKey(activeConnection.connection.id, keyName, newKeyName.trim());
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden border-border/80 bg-background shadow-2xl">
        {/* Header */}
        <div className="border-b border-border/70 bg-muted/[0.12] px-5 py-3.5">
          <DialogHeader className="space-y-0">
            <DialogTitle className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-redis/15 bg-redis/10 text-redis shadow-sm">
                <Pencil className="h-4 w-4" />
              </div>
              <span>编辑键</span>
              <span className="text-[13px] text-muted-foreground font-mono ml-1 truncate max-w-[200px]">
                {keyName}
              </span>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* 编辑模式选择 - 标签页样式 */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted/[0.5] border border-border/60">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditMode('value')}
              disabled={isReadOnly}
              className={`flex-1 justify-center gap-2 h-9 text-[13px] font-medium transition-all rounded-md ${
                editMode === 'value'
                  ? 'bg-background text-redis shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              编辑值
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditMode('ttl')}
              disabled={isReadOnly}
              className={`flex-1 justify-center gap-2 h-9 text-[13px] font-medium transition-all rounded-md ${
                editMode === 'ttl'
                  ? 'bg-background text-redis shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              设置 TTL
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditMode('rename')}
              disabled={isReadOnly}
              className={`flex-1 justify-center gap-2 h-9 text-[13px] font-medium transition-all rounded-md ${
                editMode === 'rename'
                  ? 'bg-background text-redis shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              重命名
            </Button>
          </div>

          {/* 编辑值 */}
          {editMode === 'value' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-semibold text-foreground">
                  值
                  {keyType !== 'string' && (
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      (JSON 格式)
                    </span>
                  )}
                </label>
              </div>
              <textarea
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="输入值..."
                className="w-full h-48 px-3.5 py-3 text-[13px] font-mono leading-relaxed bg-background border border-border/80 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-redis/20 focus:border-redis/30 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]"
                disabled={isReadOnly}
                spellCheck={false}
              />
            </div>
          )}

          {/* 设置 TTL */}
          {editMode === 'ttl' && (
            <div className="space-y-3">
              <label className="text-[13px] font-semibold text-foreground">TTL (秒)</label>
              <Input
                type="number"
                value={ttl}
                onChange={e => setTtl(e.target.value)}
                placeholder="不填则设为永久"
                className="h-10 rounded-lg border-border/80 bg-background px-3 font-mono text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]"
                disabled={isReadOnly}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                当前 TTL: {currentTTL === -1 ? '永久' : `${currentTTL} 秒`}
              </p>
            </div>
          )}

          {/* 重命名 */}
          {editMode === 'rename' && (
            <div className="space-y-3">
              <label className="text-[13px] font-semibold text-foreground">新键名</label>
              <Input
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="输入新的键名..."
                className="h-10 rounded-lg border-border/80 bg-background px-3 font-mono text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]"
                disabled={isReadOnly}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                当前键名: <span className="font-mono">{keyName}</span>
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 border border-destructive/40 bg-destructive/8 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/70 bg-muted/[0.08] px-5 py-3.5">
          <DialogFooter className="gap-2.5">
            <Button
              variant="outline"
              onClick={handleClose}
              className="h-9 min-w-[80px] rounded-lg border-border/80 bg-background px-4"
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isReadOnly}
              className="h-9 min-w-[80px] rounded-lg px-4 bg-redis hover:bg-redis/90 shadow-[0_8px_18px_-10px_rgba(225,85,50,0.55)]"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              保存
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
