import { useState } from 'react';
import { DatabaseConnection, PasswordStorageStrategy } from '@/types';
import { useConnectionStore } from '@/stores/connectionStore';
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
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Database,
  Server,
  Shield,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Lock,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  deleteConnectionPassword,
  saveConnectionPassword,
  testMySQLConnection,
  testRedisConnection,
} from '@/utils/api';

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

const inferPasswordStorage = (connection?: DatabaseConnection): PasswordStorageStrategy => {
  if (!connection) {
    return 'local';
  }

  if (connection.passwordStorage) {
    return connection.passwordStorage;
  }

  // 如果有本地密码，使用 'local'
  if (connection.password?.trim()) {
    return 'local';
  }

  // 默认使用 'local'
  return 'local';
};

export function ConnectionForm({ onClose, initialData }: ConnectionFormProps) {
  const { addConnection, updateConnection, deleteConnection } = useConnectionStore();
  const initialPasswordStorage = inferPasswordStorage(initialData);
  // 如果有本地密码，显示出来；否则留空让用户重新输入
  const initialPassword = initialData?.password?.trim() ? initialData.password : '';
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isSavingSecret, setIsSavingSecret] = useState(false);
  const [clearStoredPassword, setClearStoredPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    type: initialData?.type || ('mysql' as const),
    host: initialData?.host || 'localhost',
    port: initialData?.port || (initialData?.type === 'redis' ? 6379 : 3306),
    username: initialData?.username || '',
    password: initialPassword,
    passwordStorage: initialPasswordStorage,
    database: initialData?.database || '',
    ssl: initialData?.ssl || false,
    readOnly: initialData?.readOnly || false,
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

  const useStoredSecret =
    formData.passwordStorage === 'system' &&
    !!initialData?.id &&
    !!initialData?.hasPassword &&
    !clearStoredPassword &&
    !formData.password.trim();

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
          host: formData.host.trim(),
          port: formData.port,
          username: formData.username.trim() || undefined,
          password: formData.password || undefined,
          database: formData.database.trim() || undefined,
          ssl: formData.ssl,
          connectionId: initialData?.id,
          useStoredSecret,
        });
        setTestStatus(result.success ? 'success' : 'error');
        setTestMessage(result.message);
      } else {
        const result = await testRedisConnection({
          host: formData.host.trim(),
          port: formData.port,
          password: formData.password || undefined,
          connectionId: initialData?.id,
          useStoredSecret,
        });
        setTestStatus(result.success ? 'success' : 'error');
        setTestMessage(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        initialData?.id &&
        useStoredSecret &&
        errorMessage.includes('系统钥匙串中没有找到该连接的已保存密码')
      ) {
        updateConnection(initialData.id, { hasPassword: false });
      }
      setTestStatus('error');
      setTestMessage(errorMessage);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const rawPassword = formData.password;
    const hasTypedPassword = rawPassword.trim() !== '';
    const isSystemStorage = formData.passwordStorage === 'system';
    const hadSystemPassword = initialPasswordStorage === 'system' && !!initialData?.hasPassword;

    // 对于本地存储：如果有输入密码，或者之前没有密码但现在输入了，则保存密码
    const nextHasPassword = isSystemStorage
      ? hasTypedPassword || (!!initialData?.hasPassword && !clearStoredPassword)
      : hasTypedPassword || (!!initialData?.password && !hasTypedPassword);

    if (!isSystemStorage && hadSystemPassword && !hasTypedPassword && !clearStoredPassword) {
      setTestStatus('error');
      setTestMessage('从系统钥匙串切换到本地保存时，请重新输入密码，避免把原有密码丢掉。');
      return;
    }

    setIsSavingSecret(true);

    try {
      const connectionData = {
        ...formData,
        host: formData.host.trim(),
        username: formData.username.trim() === '' ? undefined : formData.username.trim(),
        // 本地存储时，如果有输入密码或之前有密码，保留/保存密码
        password: isSystemStorage
          ? undefined
          : (hasTypedPassword ? rawPassword : initialData?.password),
        hasPassword: nextHasPassword,
        database: formData.database.trim() === '' ? undefined : formData.database.trim(),
      };

      let connectionId = initialData?.id;
      if (initialData) {
        if (isSystemStorage && hasTypedPassword) {
          await saveConnectionPassword(initialData.id, rawPassword);
        } else if (initialPasswordStorage === 'system' && !nextHasPassword) {
          await deleteConnectionPassword(initialData.id);
        } else if (!isSystemStorage && initialPasswordStorage === 'system') {
          await deleteConnectionPassword(initialData.id).catch(() => undefined);
        }

        updateConnection(initialData.id, connectionData);
      } else {
        const createdConnection = addConnection(connectionData);
        connectionId = createdConnection.id;

        if (!connectionId) {
          throw new Error('连接保存失败，未生成有效 ID');
        }

        try {
          if (isSystemStorage && hasTypedPassword) {
            await saveConnectionPassword(connectionId, rawPassword);
          }
        } catch (error) {
          deleteConnection(connectionId);
          throw error;
        }
      }

      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestStatus('error');
      setTestMessage(errorMessage);
    } finally {
      setIsSavingSecret(false);
    }
  };

  const handleTypeChange = (type: 'mysql' | 'redis') => {
    setFormData(prev => ({
      ...prev,
      type,
      port: type === 'redis' ? 6379 : 3306,
    }));
  };

  const handlePasswordStorageChange = (value: PasswordStorageStrategy) => {
    setFormData(prev => ({ ...prev, passwordStorage: value }));
    setClearStoredPassword(false);
  };

  const hasSystemPassword = initialPasswordStorage === 'system' && !!initialData?.hasPassword;
  const storedPasswordStateLabel = useStoredSecret
    ? '继续使用系统钥匙串中的已保存密码'
    : '本次保存时会移除系统钥匙串中的密码';

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="flex h-[min(84vh,840px)] w-[min(720px,86vw)] flex-col overflow-hidden p-0 gap-0 border-border/80 bg-background shadow-2xl">
        <div className="border-b border-border/70 bg-muted/[0.12] px-5 py-3.5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm',
                formData.type === 'mysql'
                  ? 'border-mysql/15 bg-mysql/10 text-mysql'
                  : 'border-redis/15 bg-redis/10 text-redis'
              )}
            >
              {formData.type === 'mysql' ? (
                <Database className="h-5 w-5" />
              ) : (
                <Server className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[20px] font-semibold tracking-tight">
                {initialData ? '编辑连接' : '新建连接'}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                密码默认保存在本地配置，可切换到系统钥匙串。
              </DialogDescription>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                  {formData.passwordStorage === 'local' ? (
                    <HardDrive className="h-3 w-3" />
                  ) : (
                    <KeyRound className="h-3 w-3" />
                  )}
                  <span>{formData.passwordStorage === 'local' ? '本地保存' : '系统钥匙串'}</span>
                </div>
                {formData.readOnly && (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                    <Shield className="h-3 w-3" />
                    <span>只读模式已启用</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col bg-background">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="mx-auto max-w-[620px] space-y-3">
              <section className="rounded-xl border border-border/80 bg-card p-3.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)]">
                <div className="mb-2.5">
                  <h3 className="text-[13px] font-semibold tracking-[0.02em] text-foreground">
                    连接类型
                  </h3>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {(['mysql', 'redis'] as const).map(type => {
                    const isSelected = formData.type === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleTypeChange(type)}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-[14px] font-semibold transition-all',
                          isSelected
                            ? type === 'mysql'
                              ? 'border-mysql/35 bg-mysql/8 text-mysql shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                              : 'border-redis/35 bg-redis/8 text-redis shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                            : 'border-border/80 bg-background text-muted-foreground hover:bg-muted/35'
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
              </section>

              <section className="rounded-xl border border-border/80 bg-card p-3.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)]">
                <div className="mb-2.5">
                  <h3 className="text-[13px] font-semibold tracking-[0.02em] text-foreground">
                    基础信息
                  </h3>
                </div>
                <div className="space-y-3">
                  <div className="max-w-[440px] space-y-2">
                    <Label className="text-[13px] font-medium">连接名称</Label>
                    <Input
                      placeholder="例如：生产环境"
                      value={formData.name}
                      onChange={e => {
                        setFormData({ ...formData, name: e.target.value });
                        if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
                      }}
                      className={cn(
                        'h-10 rounded-lg border-border/80 bg-background px-3 text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]',
                        formErrors.name && 'border-destructive'
                      )}
                    />
                    {formErrors.name && (
                      <p className="text-xs text-destructive">{formErrors.name}</p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_128px]">
                    <div className="space-y-2">
                      <Label className="text-[13px] font-medium">主机</Label>
                      <Input
                        placeholder="localhost"
                        value={formData.host}
                        onChange={e => {
                          setFormData({ ...formData, host: e.target.value });
                          if (formErrors.host) setFormErrors({ ...formErrors, host: undefined });
                        }}
                        className={cn(
                          'h-10 rounded-lg border-border/80 bg-background px-3 font-mono text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]',
                          formErrors.host && 'border-destructive'
                        )}
                      />
                      {formErrors.host && (
                        <p className="text-xs text-destructive">{formErrors.host}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[13px] font-medium">端口</Label>
                      <Input
                        type="number"
                        value={formData.port}
                        onChange={e => {
                          setFormData({ ...formData, port: parseInt(e.target.value, 10) || 0 });
                          if (formErrors.port) setFormErrors({ ...formErrors, port: undefined });
                        }}
                        className={cn(
                          'h-10 rounded-lg border-border/80 bg-background px-3 font-mono text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]',
                          formErrors.port && 'border-destructive'
                        )}
                      />
                      {formErrors.port && (
                        <p className="text-xs text-destructive">{formErrors.port}</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border/80 bg-card p-3.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)]">
                <div className="mb-2.5">
                  <h3 className="text-[13px] font-semibold tracking-[0.02em] text-foreground">
                    密码存储策略
                  </h3>
                </div>
                <div className="max-w-[320px] space-y-2">
                  <Select
                    value={formData.passwordStorage}
                    onValueChange={value =>
                      handlePasswordStorageChange(value as PasswordStorageStrategy)
                    }
                  >
                    <SelectTrigger className="h-10 rounded-lg border-border/80 bg-background px-3 text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]">
                      <SelectValue placeholder="选择密码保存策略" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">本地配置</SelectItem>
                      <SelectItem value="system">系统钥匙串</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>

              {formData.type === 'mysql' && (
                <section className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)] animate-fade-in">
                  <div>
                    <h3 className="text-[13px] font-semibold tracking-[0.02em] text-foreground">
                      认证与数据库
                    </h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="max-w-[280px] space-y-2">
                      <Label className="text-[13px] font-medium">用户名</Label>
                      <Input
                        placeholder="root"
                        value={formData.username}
                        onChange={e => setFormData({ ...formData, username: e.target.value })}
                        className="h-10 rounded-lg border-border/80 bg-background px-3 text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]"
                      />
                    </div>
                    <div className="max-w-[320px] space-y-2">
                      <Label className="text-[13px] font-medium">密码</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder={
                            formData.passwordStorage === 'system'
                              ? useStoredSecret
                                ? '留空则继续使用系统钥匙串中的密码'
                                : '输入后将写入系统钥匙串'
                              : '默认保存在本地连接配置'
                          }
                          value={formData.password}
                          onChange={e => {
                            setFormData({ ...formData, password: e.target.value });
                            if (e.target.value.trim()) {
                              setClearStoredPassword(false);
                            }
                          }}
                          className="h-10 rounded-lg border-border/80 bg-background px-3 pr-10 text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {formData.passwordStorage === 'system' && (
                        <p className="text-[11px] leading-5 text-muted-foreground">
                          留空则继续使用已保存密码。
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="max-w-[440px] space-y-2">
                    <Label className="text-[13px] font-medium">数据库</Label>
                    <Input
                      placeholder="database_name"
                      value={formData.database}
                      onChange={e => setFormData({ ...formData, database: e.target.value })}
                      className="h-10 rounded-lg border-border/80 bg-background px-3 text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]"
                    />
                  </div>
                </section>
              )}

              {formData.type === 'redis' && (
                <section className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)] animate-fade-in">
                  <div>
                    <h3 className="text-[13px] font-semibold tracking-[0.02em] text-foreground">
                      认证信息
                    </h3>
                  </div>
                  <div className="max-w-[320px] space-y-2">
                    <Label className="text-[13px] font-medium">密码（可选）</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={
                          formData.passwordStorage === 'system'
                            ? useStoredSecret
                              ? '留空则继续使用系统钥匙串中的密码'
                              : '输入后将写入系统钥匙串'
                            : '默认保存在本地连接配置'
                        }
                        value={formData.password}
                        onChange={e => {
                          setFormData({ ...formData, password: e.target.value });
                          if (e.target.value.trim()) {
                            setClearStoredPassword(false);
                          }
                        }}
                        className="h-10 rounded-lg border-border/80 bg-background px-3 pr-10 text-[14px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {formData.passwordStorage === 'system' && (
                      <p className="text-[11px] leading-5 text-muted-foreground">
                        留空则继续使用已保存密码。
                      </p>
                    )}
                  </div>
                </section>
              )}

              {hasSystemPassword && (
                <section className="rounded-xl border border-border/80 bg-card p-3.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)]">
                  <div className="mb-2.5">
                    <h3 className="text-[13px] font-semibold tracking-[0.02em] text-foreground">
                      密码存储
                    </h3>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/[0.16] px-3.5 py-2.5 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5" />
                        <span>{storedPasswordStateLabel}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg px-2.5 text-xs"
                        onClick={() => {
                          setClearStoredPassword(prev => !prev);
                          setFormData(prev => ({ ...prev, password: '' }));
                        }}
                      >
                        {clearStoredPassword ? '保留密码' : '移除密码'}
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              <section className="rounded-xl border border-border/80 bg-card p-3.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)]">
                <div className="mb-2.5">
                  <h3 className="text-[13px] font-semibold tracking-[0.02em] text-foreground">
                    高级选项
                  </h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/[0.14] px-3.5 py-3">
                    <div>
                      <Label className="flex cursor-pointer items-center gap-2 text-[14px] font-medium">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        SSL 加密连接
                      </Label>
                    </div>
                    <Switch
                      checked={formData.ssl}
                      onCheckedChange={checked => setFormData({ ...formData, ssl: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/[0.14] px-3.5 py-3">
                    <div>
                      <Label className="text-[14px] font-medium">只读连接</Label>
                    </div>
                    <Switch
                      checked={formData.readOnly}
                      onCheckedChange={checked => setFormData({ ...formData, readOnly: checked })}
                    />
                  </div>
                </div>
              </section>

              {(testStatus === 'success' || testStatus === 'error') && (
                <div
                  className={cn(
                    'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
                    testStatus === 'success'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  )}
                >
                  {testStatus === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="leading-6">{testMessage}</span>
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-border/80 bg-muted/[0.08] px-5 py-3.5 shadow-[0_-1px_0_rgba(255,255,255,0.7)]">
            <div className="mx-auto flex max-w-[640px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-muted-foreground">建议先测试连接。</p>
              <div className="flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 min-w-[100px] rounded-lg border-border/80 bg-background px-4"
                  onClick={onClose}
                  disabled={testStatus === 'testing' || isSavingSecret}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 rounded-lg border border-border/70 bg-secondary px-4"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing' || isSavingSecret || !formData.host}
                >
                  {testStatus === 'testing' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      测试中
                    </>
                  ) : (
                    '测试连接'
                  )}
                </Button>
                <Button
                  type="submit"
                  className={cn(
                    'h-9 min-w-[116px] rounded-lg px-4.5 shadow-[0_8px_18px_-10px_rgba(37,99,235,0.55)]',
                    formData.type === 'mysql'
                      ? 'bg-mysql hover:bg-mysql/90'
                      : 'bg-redis hover:bg-redis/90'
                  )}
                  disabled={isSavingSecret}
                >
                  {isSavingSecret ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      保存中
                    </>
                  ) : initialData ? (
                    '保存'
                  ) : (
                    '创建'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
