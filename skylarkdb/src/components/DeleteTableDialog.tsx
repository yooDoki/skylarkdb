import { useState } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { dropMySQLTable } from '@/utils/api';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, Database, Table2, Info, Trash2 } from 'lucide-react';

interface DeleteTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  onSuccess: () => void;
}

export function DeleteTableDialog({ open, onOpenChange, tableName, onSuccess }: DeleteTableDialogProps) {
  const { activeConnection, selectedDatabase } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!activeConnection.connection?.id || !selectedDatabase) return;
    if (isReadOnly) {
      setError('当前连接为只读模式，不能删除数据表');
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await dropMySQLTable(activeConnection.connection.id, selectedDatabase, tableName);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[420px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-destructive/15 to-destructive/5 px-6 py-4 border-b border-border/50">
          <div className="relative flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center ring-1 ring-destructive/20">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">删除数据表</DialogTitle>
              <DialogDescription className="text-xs mt-0.5 text-muted-foreground">
                此操作不可撤销
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Table info */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 space-y-2">
            <div className="flex items-center gap-2">
              <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">要删除的表</span>
            </div>
            <code className="block px-2.5 py-2 rounded-md bg-background border border-border/50 font-mono text-sm">
              {tableName}
            </code>
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">数据库:</span>
              <Badge variant="secondary" className="h-5 text-xs font-mono">
                {selectedDatabase}
              </Badge>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <Info className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-destructive">高危操作警告</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                删除后，该表中的所有数据、索引和约束都将被<span className="font-medium text-destructive">永久删除</span>且无法恢复。
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/50 bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-muted/20 border-t border-border/50 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isDeleting} className="h-9 px-4">
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || isReadOnly}
            className="h-9 px-4"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                删除中...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                确认删除
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
