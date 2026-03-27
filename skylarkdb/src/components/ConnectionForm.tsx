import { useState } from 'react';
import { DatabaseConnection } from '@/types';
import { useConnectionStore } from '@/stores/connectionStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Database, Server, Shield, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/cn';
import { testMySQLConnection, testRedisConnection } from '@/utils/api';

interface ConnectionFormProps {
  onClose: () => void;
  initialData?: DatabaseConnection;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface FormErrors {
  name?: string;
  host?: string;
  port?: string;
}

export function ConnectionForm({ onClose, initialData }: ConnectionFormProps) {
  const { addConnection, updateConnection } = useConnectionStore();
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    type: initialData?.type || 'mysql' as const,
    host: initialData?.host || 'localhost',
    port: initialData?.port || (initialData?.type === 'redis' ? 6379 : 3306),
    username: initialData?.username || '',
    password: initialData?.password || '',
    database: initialData?.database || '',
    ssl: initialData?.ssl || false,
  });

  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    
    if (!formData.name.trim()) {
      errors.name = '请输入连接名称';
    }
    
    if (!formData.host.trim()) {
      errors.host = '请输入主机地址';
    }
    
    if (formData.port < 1 || formData.port > 65535) {
      errors.port = '端口号必须在 1-65535 之间';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!validateForm()) {
      return;
    }
    
    setTestStatus('testing');
    setTestMessage('');
    setFormErrors({});

    try {
      if (formData.type === 'mysql') {
        const result = await testMySQLConnection({
          host: formData.host,
          port: formData.port,
          username: formData.username || undefined,
          password: formData.password || undefined,
          database: formData.database || undefined,
          ssl: formData.ssl,
        });
        setTestStatus(result.success ? 'success' : 'error');
        setTestMessage(result.message);
      } else {
        const result = await testRedisConnection({
          host: formData.host,
          port: formData.port,
          password: formData.password || undefined,
        });
        setTestStatus(result.success ? 'success' : 'error');
        setTestMessage(result.message);
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(error instanceof Error ? error.message : 'Connection failed');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const connectionData = {
      ...formData,
      username: formData.username.trim() === '' ? undefined : formData.username,
      password: formData.password.trim() === '' ? undefined : formData.password,
      database: formData.database.trim() === '' ? undefined : formData.database,
    };

    if (initialData) {
      updateConnection(initialData.id, connectionData);
    } else {
      addConnection(connectionData);
    }
    onClose();
  };

  const handleTypeChange = (type: 'mysql' | 'redis') => {
    setFormData(prev => ({
      ...prev,
      type,
      port: type === 'redis' ? 6379 : 3306,
    }));
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="w-[380px] p-0 gap-0">
        <div className="flex items-center gap-3 px-5 py-4 border-b">
          <div className={cn(
            "p-2 rounded-lg",
            formData.type === 'mysql' ? "bg-mysql/15" : "bg-redis/15"
          )}>
            {formData.type === 'mysql' ? (
              <Database className="h-4.5 w-4.5 text-mysql" />
            ) : (
              <Server className="h-4.5 w-4.5 text-redis" />
            )}
          </div>
          <DialogTitle className="text-base font-semibold">
            {initialData ? '编辑连接' : '新建连接'}
          </DialogTitle>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex gap-2.5">
            {(['mysql', 'redis'] as const).map((type) => {
              const isSelected = formData.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
                    isSelected
                      ? type === 'mysql'
                        ? "border-mysql/50 bg-mysql/10 text-mysql"
                        : "border-redis/50 bg-redis/10 text-redis"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  {type === 'mysql' ? (
                    <Database className="h-4 w-4" />
                  ) : (
                    <Server className="h-4 w-4" />
                  )}
                  {type.toUpperCase()}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label className="text-sm">连接名称</Label>
            <Input
              placeholder="例如：生产环境"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
              }}
              className={cn("h-9", formErrors.name && "border-destructive")}
            />
            {formErrors.name && (
              <p className="text-xs text-destructive">{formErrors.name}</p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label className="text-sm">主机</Label>
              <Input
                placeholder="localhost"
                value={formData.host}
                onChange={(e) => {
                  setFormData({ ...formData, host: e.target.value });
                  if (formErrors.host) setFormErrors({ ...formErrors, host: undefined });
                }}
                className={cn("h-9 font-mono", formErrors.host && "border-destructive")}
              />
              {formErrors.host && (
                <p className="text-xs text-destructive">{formErrors.host}</p>
              )}
            </div>
            <div className="w-24 space-y-2">
              <Label className="text-sm">端口</Label>
              <Input
                type="number"
                value={formData.port}
                onChange={(e) => {
                  setFormData({ ...formData, port: parseInt(e.target.value) || 0 });
                  if (formErrors.port) setFormErrors({ ...formErrors, port: undefined });
                }}
                className={cn("h-9 font-mono", formErrors.port && "border-destructive")}
              />
            </div>
          </div>

          {formData.type === 'mysql' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex gap-3">
                <div className="flex-1 space-y-2">
                  <Label className="text-sm">用户名</Label>
                  <Input
                    placeholder="root"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label className="text-sm">密码</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="h-9 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">数据库</Label>
                <Input
                  placeholder="database_name"
                  value={formData.database}
                  onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
          )}

          {formData.type === 'redis' && (
            <div className="space-y-2 animate-fade-in">
              <Label className="text-sm">密码（可选）</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-9 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 py-1">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, ssl: !formData.ssl })}
              className={cn(
                "relative w-9 h-5 rounded-full transition-colors",
                formData.ssl ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                  formData.ssl && "translate-x-4"
                )}
              />
            </button>
            <Label className="text-sm flex items-center gap-2 cursor-pointer">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              SSL 加密连接
            </Label>
          </div>

          {(testStatus === 'success' || testStatus === 'error') && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm",
              testStatus === 'success' 
                ? "bg-green-500/10 text-green-600" 
                : "bg-red-500/10 text-red-600"
            )}>
              {testStatus === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span>{testMessage}</span>
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 h-9"
              onClick={onClose}
              disabled={testStatus === 'testing'}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 px-4"
              onClick={handleTestConnection}
              disabled={testStatus === 'testing' || !formData.host}
            >
              {testStatus === 'testing' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  测试中
                </>
              ) : (
                '测试连接'
              )}
            </Button>
            <Button
              type="submit"
              size="sm"
              className={cn(
                "flex-1 h-9",
                formData.type === 'mysql'
                  ? "bg-mysql hover:bg-mysql/90"
                  : "bg-redis hover:bg-redis/90"
              )}
            >
              {initialData ? '保存' : '创建'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
