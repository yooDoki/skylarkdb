import { useState } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { MySQLColumn, AddColumnOptions } from '@/types';
import { addMySQLColumn } from '@/utils/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Loader2, AlertCircle, Database, Code2, Settings, AlignLeft, AlignRight } from 'lucide-react';

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
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header with gradient background */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-white text-lg">
              <Plus className="h-5 w-5" />
              新增列
            </DialogTitle>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Database className="h-3 w-3" />
              <span>表:</span>
              <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-300 font-mono">{tableName}</code>
            </div>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-5">
          {/* Column Name & Type - Two column layout */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <span className="text-destructive">*</span>
                列名
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="column_name"
                className="h-9 text-sm font-mono bg-slate-50/50 border-slate-200 focus:bg-white transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <span className="text-destructive">*</span>
                数据类型
              </label>
              <Select value={dataType} onValueChange={setDataType}>
                <SelectTrigger className="h-9 text-sm font-mono bg-slate-50/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium sticky top-0 bg-popover border-b">
                    数值类型
                  </div>
                  {MYSQL_TYPES.slice(0, 5).map(type => (
                    <SelectItem key={type} value={type} className="text-xs font-mono">{type}</SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium border-t">
                    字符串类型
                  </div>
                  {MYSQL_TYPES.slice(5, 10).map(type => (
                    <SelectItem key={type} value={type} className="text-xs font-mono">{type}</SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium border-t">
                    日期/数值/其他
                  </div>
                  {MYSQL_TYPES.slice(10).map(type => (
                    <SelectItem key={type} value={type} className="text-xs font-mono">{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Options - Compact row */}
          <div className="bg-slate-50/50 rounded-lg border border-slate-100 p-3">
            <div className="flex items-center gap-1 mb-3">
              <Settings className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">选项</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer group">
                <Switch 
                  checked={!nullable} 
                  onCheckedChange={(v) => setNullable(!v)} 
                  className="data-[state=checked]:bg-blue-500" 
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                  <span className="font-mono text-xs bg-slate-200 px-1 rounded mr-1">NOT</span>
                  <span className="font-mono text-xs bg-slate-200 px-1 rounded">NULL</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <Switch 
                  checked={autoIncrement} 
                  onCheckedChange={setAutoIncrement}
                  className="data-[state=checked]:bg-amber-500" 
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                  <span className="font-mono text-xs bg-slate-200 px-1 rounded">AUTO_INCREMENT</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <Switch 
                  checked={hasDefault} 
                  onCheckedChange={setHasDefault}
                  className="data-[state=checked]:bg-emerald-500" 
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                  <span className="font-mono text-xs bg-slate-200 px-1 rounded">DEFAULT</span>
                </span>
              </label>
            </div>

            {hasDefault && (
              <div className="mt-3 pt-3 border-t border-slate-200/60">
                <Input
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  placeholder="默认值表达式 (如: NULL, CURRENT_TIMESTAMP, 0, 'text'...)"
                  className="h-8 text-sm font-mono bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">常用: NULL | CURRENT_TIMESTAMP | 0 | &apos;string&apos;</p>
              </div>
            )}
          </div>

          {/* Position - Inline with after column selector */}
          <div className="bg-slate-50/50 rounded-lg border border-slate-100 p-3">
            <div className="flex items-center gap-1 mb-3">
              {position === 'first' ? (
                <AlignLeft className="h-3.5 w-3.5 text-slate-400" />
              ) : position === 'last' ? (
                <AlignRight className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <Settings className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span className="text-xs font-semibold text-slate-600">插入位置</span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={position} onValueChange={(v) => setPosition(v as 'last' | 'first' | 'after')}>
                <SelectTrigger className="h-8 text-sm w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last">表末尾</SelectItem>
                  <SelectItem value="first">表开头</SelectItem>
                  <SelectItem value="after">指定列之后</SelectItem>
                </SelectContent>
              </Select>
              
              {position === 'after' && existingColumns.length > 0 && (
                <Select value={afterColumn} onValueChange={setAfterColumn}>
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue placeholder="选择插入位置..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingColumns.map((col, idx) => (
                      <SelectItem key={col.name} value={col.name}>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5">{idx + 1}</span>
                          <code className="text-xs font-mono">{col.name}</code>
                          <span className="text-xs text-muted-foreground">({col.fullType})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* SQL Preview - Dark themed */}
          <div className="bg-slate-900 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700">
              <Code2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-300">SQL 预览</span>
              <span className="ml-auto text-[10px] text-slate-500 font-mono">ALTER TABLE</span>
            </div>
            <div className="p-3">
              <code className="text-xs font-mono text-emerald-300 break-all leading-relaxed">
                {sqlPreview}
              </code>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 bg-slate-50 border-t gap-2">
          <Button variant="outline" onClick={handleClose} className="h-8">
            取消
          </Button>
          <Button 
            onClick={handleAdd} 
            disabled={isAdding || !name.trim()} 
            className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isAdding && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            <Plus className="h-3.5 w-3.5 mr-1" />
            新增列
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
