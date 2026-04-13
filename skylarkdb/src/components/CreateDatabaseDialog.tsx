import { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Database,
  Loader2,
  AlertCircle,
  Plus,
  Code2,
  ShieldCheck,
} from 'lucide-react';

const CHARSET_OPTIONS = [
  { value: 'utf8mb4', label: 'utf8mb4', description: '推荐 - 完整 Unicode 支持' },
  { value: 'utf8', label: 'utf8', description: '基本 Unicode' },
  { value: 'latin1', label: 'latin1', description: '西欧语言' },
  { value: 'gbk', label: 'gbk', description: '简体中文' },
  { value: 'big5', label: 'big5', description: '繁体中文' },
  { value: 'sjis', label: 'sjis', description: '日文' },
  { value: 'euckr', label: 'euckr', description: '韩文' },
  { value: 'ascii', label: 'ascii', description: 'ASCII' },
  { value: 'binary', label: 'binary', description: '二进制' },
];

const COLLATION_MAP: Record<string, Array<{ value: string; label: string }>> = {
  utf8mb4: [
    { value: 'utf8mb4_general_ci', label: 'utf8mb4_general_ci (默认)' },
    { value: 'utf8mb4_unicode_ci', label: 'utf8mb4_unicode_ci (精确排序)' },
    { value: 'utf8mb4_0900_ai_ci', label: 'utf8mb4_0900_ai_ci (MySQL 8.0)' },
    { value: 'utf8mb4_bin', label: 'utf8mb4_bin (区分大小写)' },
  ],
  utf8: [
    { value: 'utf8_general_ci', label: 'utf8_general_ci (默认)' },
    { value: 'utf8_unicode_ci', label: 'utf8_unicode_ci (精确排序)' },
    { value: 'utf8_bin', label: 'utf8_bin (区分大小写)' },
  ],
  latin1: [
    { value: 'latin1_swedish_ci', label: 'latin1_swedish_ci (默认)' },
    { value: 'latin1_general_ci', label: 'latin1_general_ci' },
    { value: 'latin1_bin', label: 'latin1_bin' },
  ],
  gbk: [
    { value: 'gbk_chinese_ci', label: 'gbk_chinese_ci (默认)' },
    { value: 'gbk_bin', label: 'gbk_bin' },
  ],
  big5: [
    { value: 'big5_chinese_ci', label: 'big5_chinese_ci (默认)' },
    { value: 'big5_bin', label: 'big5_bin' },
  ],
  sjis: [
    { value: 'sjis_japanese_ci', label: 'sjis_japanese_ci (默认)' },
    { value: 'sjis_bin', label: 'sjis_bin' },
  ],
  euckr: [
    { value: 'euckr_korean_ci', label: 'euckr_korean_ci (默认)' },
    { value: 'euckr_bin', label: 'euckr_bin' },
  ],
  ascii: [
    { value: 'ascii_general_ci', label: 'ascii_general_ci (默认)' },
    { value: 'ascii_bin', label: 'ascii_bin' },
  ],
  binary: [
    { value: 'binary', label: 'binary' },
  ],
};

interface CreateDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (databaseName: string) => void;
}

export function CreateDatabaseDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateDatabaseDialogProps) {
  const { activeConnection } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;
  const [databaseName, setDatabaseName] = useState('');
  const [charset, setCharset] = useState('utf8mb4');
  const [collation, setCollation] = useState('utf8mb4_general_ci');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表单重置
  useEffect(() => {
    if (!open) {
      setDatabaseName('');
      setCharset('utf8mb4');
      setCollation('utf8mb4_general_ci');
      setError(null);
    }
  }, [open]);

  // 当字符集变化时，重置排序规则为默认值
  useEffect(() => {
    const collations = COLLATION_MAP[charset];
    if (collations && collations.length > 0) {
      setCollation(collations[0].value);
    }
  }, [charset]);

  const handleCreate = async () => {
    if (!activeConnection.connection?.id) return;
    if (isReadOnly) {
      setError('当前连接为只读模式，不能创建数据库');
      return;
    }
    if (!databaseName.trim()) {
      setError('请输入数据库名称');
      return;
    }

    // 数据库名称验证
    const name = databaseName.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      setError('数据库名称只能包含字母、数字和下划线，且必须以字母或下划线开头');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await createMySQLDatabase(activeConnection.connection.id, name, {
        charset,
        collation,
      });
      onSuccess(name);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const currentCollations = COLLATION_MAP[charset] || [];

  const getSQLPreview = () => {
    let sql = `CREATE DATABASE \`${databaseName || 'database_name'}\``;
    if (charset) {
      sql += `\n  CHARACTER SET ${charset}`;
    }
    if (collation) {
      sql += `\n  COLLATE ${collation}`;
    }
    return sql;
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
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-mysql/15 bg-mysql/10 text-mysql shadow-sm">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-[17px] font-semibold tracking-tight">
                  新建数据库
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  在当前 MySQL 连接中创建新的数据库
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

          {isReadOnly && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              当前连接为只读模式，无法创建数据库
            </div>
          )}

          {/* 数据库名称 */}
          <div className="space-y-2">
            <Label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
              数据库名称
              <span className="text-xs text-destructive">*</span>
            </Label>
            <Input
              value={databaseName}
              onChange={e => setDatabaseName(e.target.value)}
              placeholder="例如：my_database"
              className="h-10 rounded-lg border-border/80 font-mono"
              disabled={isCreating || isReadOnly}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              只能包含字母、数字和下划线，且必须以字母或下划线开头
            </p>
          </div>

          {/* 字符集 */}
          <div className="space-y-2">
            <Label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
              字符集
            </Label>
            <Select value={charset} onValueChange={setCharset} disabled={isCreating || isReadOnly}>
              <SelectTrigger className="h-10 rounded-lg border-border/80 font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHARSET_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{option.label}</span>
                      <span className="text-xs text-muted-foreground">- {option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 排序规则 */}
          <div className="space-y-2">
            <Label className="text-[13px] font-semibold text-foreground">
              排序规则
            </Label>
            <Select value={collation} onValueChange={setCollation} disabled={isCreating || isReadOnly}>
              <SelectTrigger className="h-10 rounded-lg border-border/80 font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currentCollations.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="font-mono text-sm">{option.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SQL 预览 */}
          <div className="rounded-lg border border-border/80 bg-slate-950 shadow-[0_8px_18px_rgba(15,23,42,0.28)]">
            <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
              <Code2 className="h-3.5 w-3.5 text-mysql" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                SQL 预览
              </span>
            </div>
            <div className="overflow-x-auto p-4">
              <code className="block whitespace-pre-wrap break-all font-mono text-[13px] leading-7 text-emerald-300">
                {getSQLPreview()}
              </code>
            </div>
          </div>

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
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
              className="h-9 min-w-[80px] rounded-lg border-border/80 bg-background px-4"
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating || isReadOnly || !databaseName.trim()}
              className="h-9 min-w-[80px] rounded-lg px-4 bg-mysql hover:bg-mysql/90 shadow-[0_8px_18px_-10px_rgba(0,112,192,0.55)]"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  创建中...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  创建数据库
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
