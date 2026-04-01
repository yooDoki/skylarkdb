import { useState, useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { RedisKey, RedisInfo } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Server,
  Search,
  Trash2,
  RefreshCw,
  Key,
  Hash,
  List,
  Database,
  HardDrive,
  Users,
  Clock,
  Zap,
  Copy,
  CheckCircle2,
  Terminal,
  Layers,
  Plus,
  Pencil,
  Download,
  Upload,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { logError } from '@/utils/errorHandler';
import {
  getRedisKeys,
  getRedisValue,
  deleteRedisKey,
  getRedisInfo,
  getRedisDatabases,
  selectRedisDatabase,
  getSelectedRedisDatabase,
  RedisDatabase,
  exportRedisKey,
} from '@/utils/api';
import { AddKeyDialog } from '@/components/AddKeyDialog';
import { EditKeyDialog } from '@/components/EditKeyDialog';
import { ImportRedisDataDialog } from '@/components/ImportRedisDataDialog';

export function RedisExplorer() {
  const { activeConnection } = useConnectionStore();
  const isReadOnly = !!activeConnection.connection?.readOnly;
  const [keys, setKeys] = useState<RedisKey[]>([]);
  const [searchPattern, setSearchPattern] = useState('*');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [redisInfo, setRedisInfo] = useState<RedisInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [databases, setDatabases] = useState<RedisDatabase[]>([]);
  const [selectedDb, setSelectedDb] = useState<number>(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  useEffect(() => {
    if (activeConnection.status === 'connected' && activeConnection.connection) {
      loadRedisData();
      loadDatabases();
    }
  }, [activeConnection.status, activeConnection.connection]);

  const loadDatabases = async () => {
    if (!activeConnection.connection) return;
    try {
      const dbs = await getRedisDatabases(activeConnection.connection.id);
      setDatabases(dbs);
      const currentDb = await getSelectedRedisDatabase(activeConnection.connection.id);
      setSelectedDb(currentDb);
    } catch (error) {
      logError('Redis Explorer - Load Databases', error);
    }
  };

  const loadRedisData = async () => {
    if (!activeConnection.connection) return;
    setLoading(true);
    try {
      const keysData = await getRedisKeys(activeConnection.connection.id, searchPattern);
      setKeys(keysData);
      const infoData = await getRedisInfo(activeConnection.connection.id);
      setRedisInfo(infoData);
    } catch (error) {
      logError('Redis Explorer - Load Data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDatabaseChange = async (dbIndex: number) => {
    if (!activeConnection.connection || dbIndex === selectedDb) return;
    setLoading(true);
    try {
      await selectRedisDatabase(activeConnection.connection.id, dbIndex);
      setSelectedDb(dbIndex);
      const keysData = await getRedisKeys(activeConnection.connection.id, searchPattern);
      setKeys(keysData);
      const infoData = await getRedisInfo(activeConnection.connection.id);
      setRedisInfo(infoData);
      setSelectedKey(null);
      setKeyValue('');
    } catch (error) {
      logError('Redis Explorer - Switch Database', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => loadRedisData();

  const handleKeyClick = async (key: string) => {
    setSelectedKey(key);
    setLoading(true);
    try {
      if (!activeConnection.connection) return;
      const value = await getRedisValue(activeConnection.connection.id, key);
      try {
        const parsed = JSON.parse(value);
        setKeyValue(JSON.stringify(parsed, null, 2));
      } catch {
        setKeyValue(value);
      }
    } catch (error) {
      logError('Redis Explorer - Get Key Value', error);
      setKeyValue('Error loading value');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (key: string) => {
    if (isReadOnly) return;
    if (!confirm(`确定要删除键 "${key}" 吗？`)) return;
    try {
      if (!activeConnection.connection) return;
      const success = await deleteRedisKey(activeConnection.connection.id, key);
      if (success) {
        setKeys(prev => prev.filter(k => k.key !== key));
        if (selectedKey === key) {
          setSelectedKey(null);
          setKeyValue('');
        }
        const infoData = await getRedisInfo(activeConnection.connection.id);
        setRedisInfo(infoData);
      }
    } catch (error) {
      logError('Redis Explorer - Delete Key', error);
      alert(`删除失败：${error}`);
    }
  };

  const handleCopy = async () => {
    try {
      // 尝试使用现代剪贴板 API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(keyValue);
      } else {
        // 回退到旧的 execCommand 方法
        const textArea = document.createElement('textarea');
        textArea.value = keyValue;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
      alert('复制失败，请手动复制');
    }
  };

  const handleRefresh = () => {
    if (selectedKey) handleKeyClick(selectedKey);
    else loadRedisData();
  };

  // 批量删除选中的键
  const handleBatchDelete = async () => {
    if (!activeConnection.connection || selectedKeys.size === 0) return;

    if (!confirm(`确定要删除选中的 ${selectedKeys.size} 个键吗？\n此操作不可恢复！`)) {
      return;
    }

    try {
      let deletedCount = 0;
      for (const key of selectedKeys) {
        await deleteRedisKey(activeConnection.connection.id, key);
        deletedCount++;
      }

      setSelectedKeys(new Set());
      setIsSelectMode(false);
      await loadRedisData();
      alert(`成功删除 ${deletedCount} 个键`);
    } catch (error) {
      logError('Redis Explorer - Batch Delete', error);
      alert('批量删除失败，请重试');
    }
  };

  // 批量导出选中的键
  const handleBatchExport = async (format: 'json' | 'txt') => {
    if (!activeConnection.connection || selectedKeys.size === 0) return;

    setExporting(true);
    try {
      let exportedCount = 0;
      for (const key of selectedKeys) {
        const defaultPath = `${key.replace(/[:\\\/]/g, '_')}-batch.${format}`;
        await exportRedisKey(activeConnection.connection.id, key, format, defaultPath);
        exportedCount++;
      }

      setSelectedKeys(new Set());
      setIsSelectMode(false);
      alert(`成功导出 ${exportedCount} 个键`);
    } catch (error) {
      logError('Redis Explorer - Batch Export', error);
      alert('批量导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  // 切换单个键的选择状态
  const toggleKeySelection = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 切换全选状态
  const toggleSelectAll = () => {
    if (selectedKeys.size > 0) {
      setSelectedKeys(new Set());
    } else {
      const allKeys = new Set(keys.map(k => k.key));
      setSelectedKeys(allKeys);
    }
  };

  const handleExport = async (format: 'json' | 'txt') => {
    if (!selectedKey || !activeConnection.connection) return;

    setExporting(true);
    try {
      // 导出到临时目录
      const fileName = `${selectedKey.replace(/[:\\\/]/g, '_')}.${format}`;
      const filePath = `/tmp/${fileName}`;

      const result = await exportRedisKey(
        activeConnection.connection.id,
        selectedKey,
        format,
        filePath
      );

      if (result.success) {
        const message = `导出成功！\n文件已保存到：${filePath}\n\n文件名：${fileName}`;
        alert(message);
      } else {
        alert(`导出失败：${result.message}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(errorMessage, '导出 Redis 键失败');
      alert(`导出失败：${errorMessage}`);
    } finally {
      setExporting(false);
    }
  };

  const getTypeIcon = (type: string) => {
    const iconClass = 'h-4 w-4';
    switch (type) {
      case 'string':
        return (
          <div className="p-1.5 rounded-md bg-blue-500/10">
            <Key className={cn(iconClass, 'text-blue-500')} />
          </div>
        );
      case 'hash':
        return (
          <div className="p-1.5 rounded-md bg-green-500/10">
            <Hash className={cn(iconClass, 'text-green-500')} />
          </div>
        );
      case 'list':
        return (
          <div className="p-1.5 rounded-md bg-yellow-500/10">
            <List className={cn(iconClass, 'text-yellow-500')} />
          </div>
        );
      case 'set':
        return (
          <div className="p-1.5 rounded-md bg-purple-500/10">
            <Layers className={cn(iconClass, 'text-purple-500')} />
          </div>
        );
      case 'zset':
        return (
          <div className="p-1.5 rounded-md bg-red-500/10">
            <Database className={cn(iconClass, 'text-red-500')} />
          </div>
        );
      default:
        return (
          <div className="p-1.5 rounded-md bg-muted">
            <Key className={cn(iconClass, 'text-muted-foreground')} />
          </div>
        );
    }
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      string: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      hash: 'bg-green-500/10 text-green-600 border-green-500/20',
      list: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      set: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
      zset: 'bg-red-500/10 text-red-600 border-red-500/20',
    };
    return (
      <Badge variant="outline" className={cn('text-[10px] font-medium', styles[type] || '')}>
        {type}
      </Badge>
    );
  };

  const formatTTL = (ttl: number) => {
    if (ttl === -1) return <span className="text-muted-foreground">永久</span>;
    if (ttl < 60) return <span className="text-amber-500">{ttl}s</span>;
    if (ttl < 3600) return <span className="text-amber-500">{Math.floor(ttl / 60)}m</span>;
    if (ttl < 86400) return <span className="text-amber-500">{Math.floor(ttl / 3600)}h</span>;
    return <span className="text-amber-500">{Math.floor(ttl / 86400)}d</span>;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  if (activeConnection.status !== 'connected') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center animate-fade-in">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-redis/20 blur-3xl rounded-full" />
            <Server className="h-20 w-20 mx-auto text-redis/50 relative" />
          </div>
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">等待连接</h3>
          <p className="text-sm text-muted-foreground/70">请先连接 Redis 服务器</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 p-4 animate-fade-in">
      <Card className="w-80 flex-shrink-0 shadow-card border-border/50 flex flex-col">
        <CardHeader className="pb-3 space-y-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-redis/10">
              <Server className="h-4 w-4 text-redis" />
            </div>
            <CardTitle className="text-sm font-semibold">Keys</CardTitle>
            {redisInfo && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {redisInfo.total_keys.toLocaleString()}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={selectedDb}
              onChange={e => handleDatabaseChange(Number(e.target.value))}
              disabled={loading || databases.length === 0}
              className="flex-1 h-8 text-xs px-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-redis/20"
            >
              {databases.map(db => (
                <option key={db.index} value={db.index}>
                  {db.name} ({db.keyCount.toLocaleString()} keys)
                </option>
              ))}
            </select>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setShowAddDialog(true)}
              disabled={isReadOnly}
              className="h-8 w-8 rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowImportDialog(true)}
              disabled={isReadOnly}
              className="h-8 px-3 rounded-lg"
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              导入
            </Button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索键..."
                value={searchPattern}
                onChange={e => setSearchPattern(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="h-9 pl-8 text-xs rounded-lg"
              />
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={handleSearch}
              disabled={loading}
              className="h-9 w-9 rounded-lg"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant={isSelectMode ? 'default' : 'outline'}
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                setSelectedKeys(new Set());
              }}
              className="h-9 px-3 rounded-lg"
            >
              {isSelectMode ? '完成' : '批量'}
            </Button>
          </div>

          {isSelectMode && selectedKeys.size > 0 && (
            <div className="flex gap-2 pt-2 border-t border-border/50">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
                className="flex-1 h-8 text-xs"
              >
                {selectedKeys.size === keys.length ? '取消全选' : '全选'} ({selectedKeys.size}/
                {keys.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBatchExport('json')}
                disabled={exporting}
                className="flex-1 h-8 text-xs"
              >
                导出 JSON
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBatchDelete}
                disabled={isReadOnly}
                className="flex-1 h-8 text-xs"
              >
                删除选中
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="space-y-1 overflow-auto pr-1 flex-1 min-h-0">
            {keys.map(key => (
              <div
                key={key.key}
                className={cn(
                  'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all duration-200',
                  selectedKey === key.key
                    ? 'bg-redis/10 border border-redis/20'
                    : 'hover:bg-muted/50 border border-transparent'
                )}
                onClick={() => {
                  if (isSelectMode) {
                    toggleKeySelection(key.key);
                  } else {
                    handleKeyClick(key.key);
                  }
                }}
              >
                {isSelectMode && (
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(key.key)}
                    onChange={() => toggleKeySelection(key.key)}
                    onClick={e => e.stopPropagation()}
                    className="h-4 w-4 rounded border-border"
                  />
                )}
                {getTypeIcon(key.type)}
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'truncate text-sm font-medium',
                      selectedKey === key.key ? 'text-redis' : 'text-foreground'
                    )}
                  >
                    {key.key}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {getTypeBadge(key.type)}
                    <span className="text-muted-foreground">{formatBytes(key.size)}</span>
                    {key.ttl !== -1 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-amber-500" />
                        {formatTTL(key.ttl)}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                  onClick={e => {
                    e.stopPropagation();
                    handleDeleteKey(key.key);
                  }}
                  disabled={isReadOnly}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {redisInfo && (
          <div className="grid grid-cols-4 gap-3">
            <Card className="shadow-card border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-redis/10">
                    <Zap className="h-4 w-4 text-redis" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">{redisInfo.version}</div>
                    <div className="text-xs text-muted-foreground">版本</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <HardDrive className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">{redisInfo.used_memory}</div>
                    <div className="text-xs text-muted-foreground">内存使用</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Users className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">{redisInfo.connected_clients}</div>
                    <div className="text-xs text-muted-foreground">连接数</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Database className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">{redisInfo.total_keys.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">键总数</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {selectedKey && (
          <Card className="flex-1 flex flex-col overflow-hidden shadow-card border-border/50 animate-fade-in">
            <CardHeader className="pb-3 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getTypeIcon(keys.find(k => k.key === selectedKey)?.type || 'string')}
                  <div>
                    <CardTitle className="text-sm font-semibold font-mono">{selectedKey}</CardTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      {getTypeBadge(keys.find(k => k.key === selectedKey)?.type || 'string')}
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(keys.find(k => k.key === selectedKey)?.size || 0)}
                      </span>
                      {isReadOnly && (
                        <Badge
                          variant="outline"
                          className="text-[10px] border-amber-200 bg-amber-50 text-amber-700"
                        >
                          只读
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={() => setShowEditDialog(true)}
                    disabled={isReadOnly}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {copied ? '已复制' : '复制'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={() => handleExport('json')}
                    disabled={exporting}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={() => handleExport('txt')}
                    disabled={exporting}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    TXT
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={handleRefresh}
                    disabled={loading}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
                    刷新
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 rounded-lg"
                    onClick={() => handleDeleteKey(selectedKey)}
                    disabled={isReadOnly}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    删除
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-auto">
              <pre className="p-4 text-sm font-mono bg-muted/30 min-h-full">{keyValue}</pre>
            </CardContent>
          </Card>
        )}

        {!selectedKey && (
          <Card className="flex-1 flex items-center justify-center shadow-card border-border/50">
            <div className="text-center">
              <div className="p-4 rounded-2xl bg-muted/50 mb-4 mx-auto w-fit">
                <Terminal className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">选择一个键查看详情</p>
              <p className="text-xs text-muted-foreground/70 mt-1">从左侧面板点击任意键</p>
            </div>
          </Card>
        )}
      </div>

      <AddKeyDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => {
          setShowAddDialog(false);
          loadRedisData();
        }}
      />

      {selectedKey && (
        <EditKeyDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          keyName={selectedKey}
          keyType={keys.find(k => k.key === selectedKey)?.type || 'string'}
          currentValue={keyValue}
          currentTTL={keys.find(k => k.key === selectedKey)?.ttl || -1}
          onSuccess={() => {
            setShowEditDialog(false);
            loadRedisData();
            if (activeConnection.connection) {
              getRedisValue(activeConnection.connection.id, selectedKey).then(setKeyValue);
            }
          }}
        />
      )}

      <ImportRedisDataDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={() => {
          setShowImportDialog(false);
          loadRedisData();
        }}
      />
    </div>
  );
}
