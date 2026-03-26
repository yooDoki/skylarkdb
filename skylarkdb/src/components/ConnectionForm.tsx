import { useState, useEffect } from 'react';
import { DatabaseConnection } from '@/types';
import { useConnectionStore } from '@/stores/connectionStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, Server, Lock, Key, X, Shield, Check, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { testMySQLConnection, testRedisConnection } from '@/utils/api';

interface ConnectionFormProps {
  onClose: () => void;
  initialData?: DatabaseConnection;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export function ConnectionForm({ onClose, initialData }: ConnectionFormProps) {
  const { addConnection, updateConnection } = useConnectionStore();
  const [isVisible, setIsVisible] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');
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

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');

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

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 150);
  };

  const getTypeButton = (type: 'mysql' | 'redis') => {
    const isSelected = formData.type === type;
    const isMysql = type === 'mysql';
    
    return (
      <button
        type="button"
        onClick={() => handleTypeChange(type)}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all duration-200",
          isSelected
            ? isMysql
              ? "border-mysql bg-mysql/10 text-mysql"
              : "border-redis bg-redis/10 text-redis"
            : "border-border bg-card hover:border-muted-foreground/30"
        )}
      >
        {isMysql ? (
          <Database className={cn("h-5 w-5", isSelected && "text-mysql")} />
        ) : (
          <Server className={cn("h-5 w-5", isSelected && "text-redis")} />
        )}
        <span className="font-semibold">{type.toUpperCase()}</span>
        {isSelected && <Check className="h-4 w-4 ml-1" />}
      </button>
    );
  };

  return (
    <div 
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-150",
        isVisible ? "opacity-100" : "opacity-0"
      )}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      
      {/* Modal */}
      <div 
        className={cn(
          "relative w-full max-w-lg max-h-[90vh] bg-card rounded-2xl shadow-2xl border transition-all duration-200 flex flex-col",
          isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              formData.type === 'mysql' ? "bg-mysql/10" : "bg-redis/10"
            )}>
              {formData.type === 'mysql' ? (
                <Database className="h-5 w-5 text-mysql" />
              ) : (
                <Server className="h-5 w-5 text-redis" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {initialData ? '编辑连接' : '新建连接'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {formData.type === 'mysql' ? 'MySQL 数据库' : 'Redis 服务器'}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleClose}
            className="h-9 w-9 rounded-full hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Type Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">数据库类型</Label>
            <div className="flex gap-3">
              {getTypeButton('mysql')}
              {getTypeButton('redis')}
            </div>
          </div>

          {/* Connection Name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">连接名称</Label>
            <Input
              placeholder="例如：生产环境数据库"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="h-11 rounded-lg"
            />
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label className="text-sm font-medium">主机地址</Label>
              <Input
                placeholder="localhost"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                required
                className="h-11 rounded-lg font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">端口</Label>
              <Input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                required
                className="h-11 rounded-lg font-mono text-sm"
              />
            </div>
          </div>

          {/* MySQL Specific Fields */}
          {formData.type === 'mysql' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">用户名</Label>
                  <div className="relative">
                    <Input
                      placeholder="root"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="h-11 rounded-lg pr-10"
                    />
                    <Database className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">密码</Label>
                  <div className="relative">
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="h-11 rounded-lg pr-10"
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">默认数据库</Label>
                <Input
                  placeholder="database_name"
                  value={formData.database}
                  onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                  className="h-11 rounded-lg"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  建议填写要操作的库名；留空时执行 SQL 需使用 <span className="font-mono">库名.表名</span> 或先写{' '}
                  <span className="font-mono">USE 库名</span>，否则可能报 No database selected。
                </p>
              </div>
            </div>
          )}

          {/* Redis Specific Fields */}
          {formData.type === 'redis' && (
            <div className="space-y-2 animate-fade-in">
              <Label className="text-sm font-medium">密码（可选）</Label>
              <div className="relative">
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-11 rounded-lg pr-10"
                />
                <Key className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          )}

          {/* SSL Toggle */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, ssl: !formData.ssl })}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
                formData.ssl ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
                  formData.ssl ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm cursor-pointer" onClick={() => setFormData({ ...formData, ssl: !formData.ssl })}>
                使用 SSL 加密连接
              </Label>
            </div>
          </div>

          {/* Test Result */}
          {(testStatus === 'success' || testStatus === 'error') && (
            <div className={cn(
              "flex items-center gap-2 p-3 rounded-lg text-sm animate-fade-in",
              testStatus === 'success' 
                ? "bg-green-500/10 text-green-600 border border-green-500/20" 
                : "bg-red-500/10 text-red-600 border border-red-500/20"
            )}>
              {testStatus === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span>{testMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11 rounded-lg"
              onClick={handleClose}
              disabled={testStatus === 'testing'}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-11 rounded-lg"
              onClick={handleTestConnection}
              disabled={testStatus === 'testing' || !formData.host}
            >
              {testStatus === 'testing' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  测试中...
                </>
              ) : (
                '测试连接'
              )}
            </Button>
            <Button
              type="submit"
              className={cn(
                "flex-1 h-11 rounded-lg transition-all duration-200",
                formData.type === 'mysql'
                  ? "bg-mysql hover:bg-mysql/90"
                  : "bg-redis hover:bg-redis/90"
              )}
            >
              {initialData ? '保存修改' : '创建连接'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
