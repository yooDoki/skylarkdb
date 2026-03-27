import { useState } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { MySQLColumn, AddColumnOptions } from '@/types';
import { addMySQLColumn } from '@/utils/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Loader2, AlertCircle } from 'lucide-react';

const MYSQL_TYPES = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
  'VARCHAR(255)', 'CHAR(50)', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
  'DECIMAL(10,2)', 'FLOAT', 'DOUBLE',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR',
  'JSON',
  'BOOLEAN', 'BIT(1)',
];

interface AddColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  existingColumns: MySQLColumn[];
  onSuccess: () => void;
}

export function AddColumnDialog({ open, onOpenChange, tableName, existingColumns, onSuccess }: AddColumnDialogProps) {
  const { activeConnection } = useConnectionStore();
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState('VARCHAR(255)');
  const [nullable, setNullable] = useState(true);
  const [autoIncrement, setAutoIncrement] = useState(false);
  const [defaultValue, setDefaultValue] = useState('');
  const [hasDefault, setHasDefault] = useState(false);
  const [position, setPosition] = useState<'last' | 'first' | 'after'>('last');
  const [afterColumn, setAfterColumn] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!activeConnection.connection?.id) return;
    if (!name.trim()) {
      setError('请输入列名');
      return;
    }

    const options: AddColumnOptions = {
      name: name.trim(),
      dataType,
      nullable,
      autoIncrement,
      first: position === 'first',
      afterColumn: position === 'after' && afterColumn ? afterColumn : undefined,
    };
    if (hasDefault && defaultValue.trim()) {
      options.defaultValue = defaultValue.trim();
    }

    setIsAdding(true);
    setError(null);

    try {
      await addMySQLColumn(activeConnection.connection.id, tableName, options);
      setName('');
      setDataType('VARCHAR(255)');
      setNullable(true);
      setAutoIncrement(false);
      setDefaultValue('');
      setHasDefault(false);
      setPosition('last');
      setAfterColumn('');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAdding(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onOpenChange(false);
  };

  const sqlPreview = [
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${name || 'column_name'}\` ${dataType}`,
    !nullable ? 'NOT NULL' : null,
    hasDefault && defaultValue.trim() ? `DEFAULT ${defaultValue.trim()}` : null,
    autoIncrement ? 'AUTO_INCREMENT' : null,
    position === 'first' ? 'FIRST' : position === 'after' && afterColumn ? `AFTER \`${afterColumn}\`` : null,
  ].filter(Boolean).join(' ');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            新增列
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            表: <span className="font-mono text-primary">{tableName}</span>
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">列名</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入列名..."
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">数据类型</label>
              <Select value={dataType} onValueChange={setDataType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MYSQL_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={!nullable} onCheckedChange={(v) => setNullable(!v)} className="scale-75" />
              <span className="text-xs">NOT NULL</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={autoIncrement} onCheckedChange={setAutoIncrement} className="scale-75" />
              <span className="text-xs">AUTO_INCREMENT</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={hasDefault} onCheckedChange={setHasDefault} className="scale-75" />
              <span className="text-xs">DEFAULT</span>
            </label>
          </div>

          {hasDefault && (
            <Input
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              placeholder="默认值 (如 NULL, CURRENT_TIMESTAMP, 0...)"
              className="h-8 text-xs font-mono"
            />
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">位置</label>
            <Select value={position} onValueChange={(v) => setPosition(v as 'last' | 'first' | 'after')}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last">表末尾（默认）</SelectItem>
                <SelectItem value="first">表开头（FIRST）</SelectItem>
                <SelectItem value="after">指定列之后（AFTER）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {position === 'after' && existingColumns.length > 0 && (
            <Select value={afterColumn} onValueChange={setAfterColumn}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择列..." />
              </SelectTrigger>
              <SelectContent>
                {existingColumns.map(col => (
                  <SelectItem key={col.name} value={col.name}>{col.name} ({col.fullType})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 border border-destructive/50 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="p-3 border border-dashed rounded-lg bg-muted/20">
            <p className="text-xs text-muted-foreground mb-1">SQL 预览:</p>
            <code className="text-xs font-mono text-muted-foreground break-all">{sqlPreview}</code>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button onClick={handleAdd} disabled={isAdding || !name.trim()} className="bg-mysql hover:bg-mysql/90">
            {isAdding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            新增列
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
