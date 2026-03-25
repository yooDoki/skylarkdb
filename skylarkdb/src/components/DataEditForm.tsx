import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Save, RotateCcw, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  extra: string;
  isPrimary?: boolean;
}

interface DataEditFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  columns: ColumnInfo[];
  initialData?: Record<string, any>;
  tableName: string;
  mode: 'create' | 'edit';
}

export function DataEditForm({
  isOpen,
  onClose,
  onSubmit,
  columns,
  initialData,
  tableName,
  mode,
}: DataEditFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Initialize form data
      const initial: Record<string, any> = {};
      columns.forEach((col) => {
        if (mode === 'edit' && initialData) {
          initial[col.name] = initialData[col.name] ?? '';
        } else {
          initial[col.name] = col.default ?? '';
        }
      });
      setFormData(initial);
      setErrors({});
    } else {
      setIsVisible(false);
    }
  }, [isOpen, columns, initialData, mode]);

  const validateField = (col: ColumnInfo, value: any): string | null => {
    if (!col.nullable && (value === '' || value === null || value === undefined)) {
      return `${col.name} 不能为空`;
    }

    // Type validation
    if (value !== '' && value !== null) {
      if (col.type.includes('int') && !/^-?\d+$/.test(String(value))) {
        return `${col.name} 必须是整数`;
      }
      if (col.type.includes('decimal') || col.type.includes('float') || col.type.includes('double')) {
        if (!/^-?\d*\.?\d+$/.test(String(value))) {
          return `${col.name} 必须是数字`;
        }
      }
      if (col.type.includes('datetime') || col.type.includes('timestamp')) {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return `${col.name} 必须是有效的日期时间`;
        }
      }
    }

    return null;
  };

  const handleChange = (colName: string, value: any) => {
    setFormData((prev) => ({ ...prev, [colName]: value }));
    // Clear error when user starts typing
    if (errors[colName]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[colName];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const newErrors: Record<string, string> = {};
    columns.forEach((col) => {
      const error = validateField(col, formData[col.name]);
      if (error) {
        newErrors[col.name] = error;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Submit failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    const initial: Record<string, any> = {};
    columns.forEach((col) => {
      if (mode === 'edit' && initialData) {
        initial[col.name] = initialData[col.name] ?? '';
      } else {
        initial[col.name] = col.default ?? '';
      }
    });
    setFormData(initial);
    setErrors({});
  };

  const getInputType = (colType: string): string => {
    if (colType.includes('int') || colType.includes('decimal') || colType.includes('float')) {
      return 'number';
    }
    if (colType.includes('datetime') || colType.includes('timestamp') || colType.includes('date')) {
      return 'datetime-local';
    }
    if (colType.includes('time')) {
      return 'time';
    }
    return 'text';
  };

  const formatValue = (value: any, colType: string): string => {
    if (value === null || value === undefined) return '';
    if (colType.includes('datetime') || colType.includes('timestamp')) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 16);
      }
    }
    return String(value);
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200',
        isVisible ? 'opacity-100' : 'opacity-0'
      )}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full max-w-2xl max-h-[90vh] bg-card rounded-2xl shadow-2xl border transition-all duration-200 overflow-hidden',
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <CardHeader className="pb-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-mysql/10">
                <Badge variant="outline" className="text-mysql font-mono">
                  {tableName}
                </Badge>
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">
                  {mode === 'create' ? '新增记录' : '编辑记录'}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {mode === 'create' ? '填写以下字段创建新记录' : '修改字段值并保存'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-9 w-9 rounded-full hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="overflow-auto">
          <CardContent className="p-6 space-y-4 max-h-[60vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {columns.map((col) => {
                const hasError = errors[col.name];
                const isPrimary = col.extra.includes('auto_increment') || col.isPrimary;

                return (
                  <div
                    key={col.name}
                    className={cn(
                      'space-y-2',
                      col.type.includes('text') || col.type.includes('varchar') && col.type.match(/\d+/) && parseInt(col.type.match(/\d+/)![0]) > 100
                        ? 'md:col-span-2'
                        : ''
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        {col.name}
                        {!col.nullable && <span className="text-destructive">*</span>}
                        {isPrimary && (
                          <Badge variant="secondary" className="text-[10px]">
                            主键
                          </Badge>
                        )}
                      </Label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {col.type}
                      </span>
                    </div>

                    {col.type.includes('text') || (col.type.includes('varchar') && parseInt(col.type.match(/\d+/)?.[0] || '0') > 255) ? (
                      // Textarea for long text
                      <textarea
                        value={formatValue(formData[col.name], col.type)}
                        onChange={(e) => handleChange(col.name, e.target.value)}
                        disabled={isPrimary && mode === 'edit'}
                        placeholder={col.nullable ? '可为空' : '必填'}
                        className={cn(
                          'w-full min-h-[80px] p-3 rounded-lg border bg-muted/30 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all',
                          hasError && 'border-destructive focus:border-destructive focus:ring-destructive/20',
                          isPrimary && mode === 'edit' && 'opacity-50 cursor-not-allowed'
                        )}
                      />
                    ) : (
                      // Input for other types
                      <Input
                        type={getInputType(col.type)}
                        value={formatValue(formData[col.name], col.type)}
                        onChange={(e) => handleChange(col.name, e.target.value)}
                        disabled={isPrimary && mode === 'edit'}
                        placeholder={col.nullable ? '可为空' : '必填'}
                        className={cn(
                          'h-10 rounded-lg font-mono text-sm',
                          hasError && 'border-destructive focus:border-destructive focus:ring-destructive/20',
                          isPrimary && mode === 'edit' && 'opacity-50 cursor-not-allowed'
                        )}
                      />
                    )}

                    {hasError && (
                      <div className="flex items-center gap-1 text-destructive text-xs">
                        <AlertCircle className="h-3 w-3" />
                        {errors[col.name]}
                      </div>
                    )}

                    {col.default && (
                      <p className="text-[10px] text-muted-foreground">
                        默认值: {col.default}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t bg-muted/30">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="h-10 rounded-lg"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              重置
            </Button>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="h-10 rounded-lg"
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-10 rounded-lg bg-mysql hover:bg-mysql/90"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {mode === 'create' ? '创建' : '保存'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
