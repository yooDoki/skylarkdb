import { useState } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { MySQLColumn, AddColumnOptions } from '@/types';
import { addMySQLColumn } from '@/utils/api';
import { cn } from '@/utils/cn';
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
import {
  Plus,
  Loader2,
  AlertCircle,
  Database,
  Code2,
  Settings2,
  AlignLeft,
  AlignRight,
  ShieldCheck,
} from 'lucide-react';

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
  'JSON',
  'BOOLEAN',
  'BIT(1)',
];

interface AddColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  existingColumns: MySQLColumn[];
  onSuccess: () => void;
}

interface OptionCardProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description: string;
  token: string;
  tone: 'blue' | 'amber' | 'emerald';
}

const optionToneClasses: Record<OptionCardProps['tone'], string> = {
  blue: 'border-blue-200 bg-blue-50/80 shadow-blue-100/60',
  amber: 'border-amber-200 bg-amber-50/80 shadow-amber-100/60',
  emerald: 'border-emerald-200 bg-emerald-50/80 shadow-emerald-100/60',
};

function OptionCard({
  checked,
  onCheckedChange,
  label,
  description,
  token,
  tone,
}: OptionCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3 transition-all',
        checked ? `shadow-sm ${optionToneClasses[tone]}` : 'border-slate-200 bg-slate-50/70'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          className={cn(
            checked ? 'shadow-sm' : '',
            tone === 'blue' && 'data-[state=checked]:bg-blue-600',
            tone === 'amber' && 'data-[state=checked]:bg-amber-500',
            tone === 'emerald' && 'data-[state=checked]:bg-emerald-500'
          )}
        />
      </div>
      <div className="mt-3 inline-flex rounded-full border border-white/70 bg-white/90 px-2.5 py-1 font-mono text-[11px] text-slate-600 shadow-sm">
        {token}
      </div>
    </div>
  );
}

export function AddColumnDialog({
  open,
  onOpenChange,
  tableName,
  existingColumns,
  onSuccess,
}: AddColumnDialogProps) {
  const { activeConnection } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;
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
    if (isReadOnly) {
      setError('当前连接为只读模式，不能新增字段');
      return;
    }
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
    position === 'first'
      ? 'FIRST'
      : position === 'after' && afterColumn
        ? `AFTER \`${afterColumn}\``
        : null,
  ]
    .filter(Boolean)
    .join(' ');

  const positionLabel =
    position === 'first' ? '表开头' : position === 'after' ? '指定列之后' : '表末尾';
  const canSubmit = !isReadOnly && !isAdding && !!name.trim();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl border-slate-200 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(15,23,42,0.25)]">
        <div className="border-b border-slate-200 bg-white px-6 py-5">
          <DialogHeader className="space-y-4 border-none px-0 py-0 pr-10 text-left">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-200">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="space-y-1.5">
                  <DialogTitle className="text-[22px] font-semibold tracking-tight text-slate-950">
                    新增列
                  </DialogTitle>
                  <p className="text-sm leading-6 text-slate-500">
                    为当前数据表添加字段，右侧会实时生成执行 SQL。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  <Database className="h-3.5 w-3.5 text-slate-400" />
                  <span>表名</span>
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 shadow-sm">
                    {tableName}
                  </code>
                </div>
                {isReadOnly && (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    只读连接
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(88vh-150px)] overflow-y-auto p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <div className="space-y-4">
              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 shadow-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm leading-6">{error}</p>
                </div>
              )}

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">字段定义</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      先确定列名和类型，再补充默认值与插入位置。
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2.5">
                    <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      <span className="text-red-500">*</span>
                      列名
                    </label>
                    <Input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="column_name"
                      className="h-11 rounded-xl border-slate-200 bg-slate-50 px-4 font-mono text-[15px] shadow-sm transition focus-visible:border-slate-400 focus-visible:ring-slate-300"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      <span className="text-red-500">*</span>
                      数据类型
                    </label>
                    <Select value={dataType} onValueChange={setDataType}>
                      <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 px-4 font-mono text-[15px] shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <div className="sticky top-0 border-b bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          数值类型
                        </div>
                        {MYSQL_TYPES.slice(0, 5).map(type => (
                          <SelectItem key={type} value={type} className="font-mono text-xs">
                            {type}
                          </SelectItem>
                        ))}
                        <div className="border-t px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          字符串类型
                        </div>
                        {MYSQL_TYPES.slice(5, 10).map(type => (
                          <SelectItem key={type} value={type} className="font-mono text-xs">
                            {type}
                          </SelectItem>
                        ))}
                        <div className="border-t px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          其他
                        </div>
                        {MYSQL_TYPES.slice(10).map(type => (
                          <SelectItem key={type} value={type} className="font-mono text-xs">
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-slate-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">字段选项</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      常用约束做成卡片式开关，状态更直观。
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <OptionCard
                    checked={!nullable}
                    onCheckedChange={checked => setNullable(!checked)}
                    label="非空约束"
                    description="插入时必须提供值。"
                    token="NOT NULL"
                    tone="blue"
                  />
                  <OptionCard
                    checked={autoIncrement}
                    onCheckedChange={setAutoIncrement}
                    label="自动递增"
                    description="适合整型主键或流水编号。"
                    token="AUTO_INCREMENT"
                    tone="amber"
                  />
                  <OptionCard
                    checked={hasDefault}
                    onCheckedChange={setHasDefault}
                    label="默认值"
                    description="未传值时按表达式自动填充。"
                    token="DEFAULT"
                    tone="emerald"
                  />
                </div>

                {hasDefault && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <label className="mb-2 block text-sm font-medium text-emerald-900">
                      默认值表达式
                    </label>
                    <Input
                      value={defaultValue}
                      onChange={e => setDefaultValue(e.target.value)}
                      placeholder="例如: NULL, CURRENT_TIMESTAMP, 0, 'text'"
                      className="h-10 rounded-xl border-emerald-200 bg-white font-mono shadow-sm focus-visible:ring-emerald-200"
                    />
                    <p className="mt-2 text-xs leading-5 text-emerald-700/80">
                      常见写法：`NULL`、`CURRENT_TIMESTAMP`、`0`、`&apos;string&apos;`
                    </p>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  {position === 'first' ? (
                    <AlignLeft className="h-4 w-4 text-slate-400" />
                  ) : position === 'last' ? (
                    <AlignRight className="h-4 w-4 text-slate-400" />
                  ) : (
                    <Settings2 className="h-4 w-4 text-slate-400" />
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">插入位置</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      控制新字段放在表头、表尾，或指定列之后。
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-2.5">
                    <label className="text-sm font-medium text-slate-700">位置策略</label>
                    <Select
                      value={position}
                      onValueChange={v => setPosition(v as 'last' | 'first' | 'after')}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 px-4 shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="last">表末尾</SelectItem>
                        <SelectItem value="first">表开头</SelectItem>
                        <SelectItem value="after">指定列之后</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-sm font-medium text-slate-700">参考列</label>
                    {position === 'after' && existingColumns.length > 0 ? (
                      <Select value={afterColumn} onValueChange={setAfterColumn}>
                        <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 px-4 shadow-sm">
                          <SelectValue placeholder="选择插入位置..." />
                        </SelectTrigger>
                        <SelectContent>
                          {existingColumns.map((col, idx) => (
                            <SelectItem key={col.name} value={col.name}>
                              <div className="flex items-center gap-2">
                                <span className="w-5 text-[11px] text-slate-400">{idx + 1}</span>
                                <code className="font-mono text-xs text-slate-700">{col.name}</code>
                                <span className="text-[11px] text-slate-400">{col.fullType}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex h-11 items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-sm text-slate-500">
                        {position === 'after'
                          ? '当前表还没有可参考的字段。'
                          : `当前策略：${positionLabel}`}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-emerald-300">
                    <Code2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">SQL 预览</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      提交前先确认语句结构和插入位置。
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      目标表
                    </p>
                    <code className="mt-2 block break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700 shadow-sm">
                      {tableName}
                    </code>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      新增字段
                    </p>
                    <code className="mt-2 block break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700 shadow-sm">
                      {name || 'column_name'}
                    </code>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      类型
                    </p>
                    <code className="mt-2 block rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700 shadow-sm">
                      {dataType}
                    </code>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      位置
                    </p>
                    <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
                      {position === 'after' && afterColumn
                        ? `位于 ${afterColumn} 之后`
                        : positionLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-[0_16px_40px_rgba(15,23,42,0.28)]">
                  <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-4 py-3">
                    <Code2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Generated SQL
                    </span>
                    <span className="ml-auto rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                      ALTER TABLE
                    </span>
                  </div>
                  <div className="overflow-x-auto p-4">
                    <code className="block whitespace-pre-wrap break-all font-mono text-[13px] leading-7 text-emerald-300">
                      {sqlPreview}
                    </code>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
                  {isReadOnly
                    ? '当前连接处于只读模式，样式和预览会正常展示，但不会允许提交执行。'
                    : '确认无误后直接提交即可，系统会按照当前预览的 SQL 执行新增字段。'}
                </div>
              </section>
            </aside>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
          <Button
            variant="outline"
            onClick={handleClose}
            className="h-10 rounded-xl border-slate-200 px-4"
          >
            取消
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!canSubmit}
            className="h-10 rounded-xl bg-slate-950 px-5 text-white hover:bg-slate-800"
          >
            {isAdding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            新增列
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
