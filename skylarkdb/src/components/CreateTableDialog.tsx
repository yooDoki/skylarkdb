import { useState, useCallback } from 'react';
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
import { Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';

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
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
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
          <div className="space-y-2">
            <label className="text-sm font-medium">表名</label>
            <Input
              value={tableName}
              onChange={e => setTableName(e.target.value)}
              placeholder="输入表名..."
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">列定义</label>
              <Button variant="outline" size="sm" onClick={addColumn} disabled={isReadOnly}>
                <Plus className="h-3 w-3 mr-1" />
                添加列
              </Button>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-auto">
              {columns.map((col, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 p-3 border rounded-lg bg-muted/30"
                >
                  <div className="flex-1 grid grid-cols-5 gap-2">
                    <div className="col-span-1">
                      <Input
                        placeholder="列名"
                        value={col.name}
                        onChange={e => handleColumnChange(index, 'name', e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="col-span-1">
                      <Select
                        value={col.dataType}
                        onValueChange={v => handleColumnChange(index, 'dataType', v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MYSQL_TYPES.map(type => (
                            <SelectItem key={type} value={type}>
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
                      />
                      <span className="text-xs text-muted-foreground">NOT NULL</span>
                    </div>
                    <div className="col-span-1 flex items-center gap-2">
                      <Switch
                        checked={col.autoIncrement}
                        onCheckedChange={v => handleColumnChange(index, 'autoIncrement', v)}
                        className="scale-75"
                      />
                      <span className="text-xs text-muted-foreground">AUTO_INC</span>
                    </div>
                    <div className="col-span-1 flex items-center gap-2">
                      <Switch
                        checked={col.isPrimaryKey}
                        onCheckedChange={v => handleColumnChange(index, 'isPrimaryKey', v)}
                        className="scale-75"
                      />
                      <span className="text-xs text-muted-foreground">PK</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => removeColumn(index)}
                    disabled={isReadOnly || columns.length === 1}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 border border-destructive/50 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="p-3 border border-dashed rounded-lg bg-muted/20">
            <p className="text-xs text-muted-foreground mb-2">SQL 预览:</p>
            <code className="text-xs font-mono text-muted-foreground">
              {`CREATE TABLE \`${tableName || 'table_name'}\` (\n`}
              {columns
                .filter(c => c.name)
                .map((col, i) => (
                  <span key={i}>
                    {'  '}
                    {col.name} {col.dataType}
                    {!col.nullable ? ' NOT NULL' : ''}
                    {col.autoIncrement ? ' AUTO_INCREMENT' : ''}
                    {col.isPrimaryKey ? ' (PRIMARY KEY)' : ''}
                    {i < columns.filter(c => c.name).length - 1 ? ',' : ''}
                    {'\n'}
                  </span>
                ))}
              {')'}
            </code>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || isReadOnly}
            className="bg-mysql hover:bg-mysql/90"
          >
            {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            创建表
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
