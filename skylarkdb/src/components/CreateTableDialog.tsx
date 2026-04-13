import { useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { CreateTableColumn } from '@/types';
import { createMySQLTable } from '@/utils/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2, AlertCircle, Code2 } from 'lucide-react';

const MYSQL_TYPES = [
  'INT',
  'BIGINT',
  'SMALLINT',
  'TINYINT',
  'MEDIUMINT',
  'VARCHAR(255)',
  'CHAR(50)',
  'TEXT',
  'MEDIUMTEXT',
  'LONGTEXT',
  'DECIMAL(10,2)',
  'FLOAT',
  'DOUBLE',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'TIME',
  'YEAR',
  'BLOB',
  'MEDIUMBLOB',
  'LONGBLOB',
  'JSON',
  'BOOLEAN',
  'BIT(1)',
];

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateTableDialog({ open, onOpenChange, onSuccess }: CreateTableDialogProps) {
  const { activeConnection, selectedDatabase } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<CreateTableColumn[]>([
    {
      name: '',
      dataType: 'INT',
      nullable: true,
      defaultValue: undefined,
      autoIncrement: false,
      isPrimaryKey: false,
    },
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表单重置
  useEffect(() => {
    if (!open) {
      setTableName('');
      setColumns([
        {
          name: '',
          dataType: 'INT',
          nullable: true,
          defaultValue: undefined,
          autoIncrement: false,
          isPrimaryKey: false,
        },
      ]);
      setError(null);
    }
  }, [open]);

  const handleColumnChange = useCallback(
    (index: number, field: keyof CreateTableColumn, value: unknown) => {
      setColumns(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };

        if (field === 'isPrimaryKey' && value === true) {
          updated[index].nullable = false;
          updated[index].autoIncrement = true;
        }

        return updated;
      });
    },
    []
  );

  const addColumn = useCallback(() => {
    setColumns(prev => [
      ...prev,
      {
        name: '',
        dataType: 'INT',
        nullable: true,
        defaultValue: undefined,
        autoIncrement: false,
        isPrimaryKey: false,
      },
    ]);
  }, []);

  const removeColumn = useCallback((index: number) => {
    setColumns(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleCreate = async () => {
    if (!activeConnection.connection?.id || !selectedDatabase) return;
    if (isReadOnly) {
      setError('当前连接为只读模式，不能创建数据表');
      return;
    }
    if (!tableName.trim()) {
      setError('请输入表名');
      return;
    }
    const validColumns = columns.filter(c => c.name.trim());
    if (validColumns.length === 0) {
      setError('请至少定义一列');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await createMySQLTable(
        activeConnection.connection.id,
        selectedDatabase,
        tableName.trim(),
        validColumns
      );
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const getSQLPreview = () => {
    const validColumns = columns.filter(c => c.name);
    if (validColumns.length === 0) return 'CREATE TABLE `table_name` (...)';

    const columnDefs = validColumns.map(col => {
      let def = `  \`${col.name}\` ${col.dataType}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.autoIncrement) def += ' AUTO_INCREMENT';
      if (col.isPrimaryKey) def += ' PRIMARY KEY';
      return def;
    });

    return `CREATE TABLE \`${tableName || 'table_name'}\` (\n${columnDefs.join(',\n')}\n)`;
  };

  const handleClose = () => {
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            创建新表
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            数据库: <span className="font-mono text-primary">{selectedDatabase}</span>
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 border border-destructive/40 bg-destructive/8 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive leading-relaxed">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[13px] font-semibold text-foreground">表名</label>
            <Input
              value={tableName}
              onChange={e => setTableName(e.target.value)}
              placeholder="输入表名..."
              className="font-mono h-10 rounded-lg border-border/80"
              disabled={isReadOnly || isCreating}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-semibold text-foreground">列定义</label>
              <Button variant="outline" size="sm" onClick={addColumn} disabled={isReadOnly || isCreating} className="h-8">
                <Plus className="h-3 w-3 mr-1" />
                添加列
              </Button>
            </div>

            <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
              {columns.map((col, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 p-3 border border-border/80 rounded-lg bg-muted/30"
                >
                  <div className="flex-1 grid grid-cols-5 gap-2">
                    <div className="col-span-1">
                      <Input
                        placeholder="列名"
                        value={col.name}
                        onChange={e => handleColumnChange(index, 'name', e.target.value)}
                        className="h-8 text-xs font-mono rounded-lg"
                        disabled={isCreating}
                      />
                    </div>
                    <div className="col-span-1">
                      <Select
                        value={col.dataType}
                        onValueChange={v => handleColumnChange(index, 'dataType', v)}
                        disabled={isCreating}
                      >
                        <SelectTrigger className="h-8 text-xs rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MYSQL_TYPES.map(type => (
                            <SelectItem key={type} value={type} className="font-mono text-xs">
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 flex items-center gap-2">
                      <Switch
                        checked={!col.nullable}
                        onCheckedChange={v => handleColumnChange(index, 'nullable', !v)}
                        className="scale-75"
                        disabled={isCreating}
                      />
                      <span className="text-xs text-muted-foreground">NOT NULL</span>
                    </div>
                    <div className="col-span-1 flex items-center gap-2">
                      <Switch
                        checked={col.autoIncrement}
                        onCheckedChange={v => handleColumnChange(index, 'autoIncrement', v)}
                        className="scale-75"
                        disabled={isCreating}
                      />
                      <span className="text-xs text-muted-foreground">AUTO_INC</span>
                    </div>
                    <div className="col-span-1 flex items-center gap-2">
                      <Switch
                        checked={col.isPrimaryKey}
                        onCheckedChange={v => handleColumnChange(index, 'isPrimaryKey', v)}
                        className="scale-75"
                        disabled={isCreating}
                      />
                      <span className="text-xs text-muted-foreground">PK</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 hover:bg-destructive/10"
                    onClick={() => removeColumn(index)}
                    disabled={isCreating || isReadOnly || columns.length === 1}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
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
              disabled={isCreating || isReadOnly}
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
                  创建表
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
