import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'default';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent 
        className="max-w-[420px] p-0 gap-0 overflow-hidden"
        onSubmit={onConfirm}
        submitDisabled={loading}
      >
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-destructive/15 to-destructive/5 px-6 py-4 border-b border-border/50">
          <DialogHeader className="space-y-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center ring-1 ring-destructive/20">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  此操作需要确认
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border/50 bg-muted/20 px-6 py-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="min-w-[80px]"
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
            className="min-w-[80px]"
          >
            {loading ? '处理中...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
