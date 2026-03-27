import { useState } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { dropMySQLTable } from '@/utils/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

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
      await dropMySQLTable(
        activeConnection.connection.id,
        selectedDatabase,
        tableName
      );
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            删除表
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            确定要删除表 <span className="font-mono font-medium text-foreground">{tableName}</span> 吗？
          </p>
          <p className="text-xs text-destructive">
            此操作不可恢复，表中的所有数据都将被永久删除。
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            数据库: <span className="font-mono">{selectedDatabase}</span>
          </p>
        </div>

        {error && (
          <div className="p-3 border border-destructive/50 bg-destructive/10 rounded-lg mb-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting || isReadOnly}>
            {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
