import { useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { createMySQLDatabase } from '@/utils/api';
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
import { Loader2, AlertCircle } from 'lucide-react';

interface CreateDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (databaseName: string) => void;
}

export function CreateDatabaseDialog({ open, onOpenChange, onSuccess }: CreateDatabaseDialogProps) {
  const { activeConnection } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;
  const [name, setName] = useState('');
  const [charset, setCharset] = useState('');
  const [collation, setCollation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName('');
    setCharset('');
    setCollation('');
    setError(null);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!activeConnection.connection?.id) return;
    if (isReadOnly) {
      setError('当前连接为只读模式，不能创建数据库');
      return;
    }
    if (!trimmed) {
      setError('请输入数据库名称');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createMySQLDatabase(activeConnection.connection.id, trimmed, {
        charset: charset.trim() || null,
        collation: collation.trim() || null,
      });
      onSuccess(trimmed);
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建数据库</DialogTitle>
          <DialogDescription>
            在当前 MySQL 连接上执行 CREATE DATABASE。名称将使用反引号转义；字符集与排序规则可选。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="new-db-name">数据库名称</Label>
            <Input
              id="new-db-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如 my_app"
              autoComplete="off"
              disabled={submitting || isReadOnly}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-db-charset">字符集（可选）</Label>
            <Input
              id="new-db-charset"
              value={charset}
              onChange={e => setCharset(e.target.value)}
              placeholder="留空则使用服务器默认，如 utf8mb4"
              autoComplete="off"
              disabled={submitting || isReadOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-db-collation">排序规则（可选）</Label>
            <Input
              id="new-db-collation"
              value={collation}
              onChange={e => setCollation(e.target.value)}
              placeholder="留空则使用服务器默认，如 utf8mb4_unicode_ci"
              autoComplete="off"
              disabled={submitting || isReadOnly}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || isReadOnly}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                创建中…
              </>
            ) : (
              '创建'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
