import { useState, useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { RedisKey, RedisInfo } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
        alert(`键 "${key}" 已删除`);
      } else {
        alert(`键 "${key}" 不存在或删除失败`);
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
        <div className="text-center">
          <Server className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">等待连接</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Keys Sidebar */}
      <div className="w-60 flex-shrink-0 flex flex-col border-r border-border/50 bg-muted/20">
        <div className="flex-shrink-0 px-3 py-2 border-b border-border/50 space-y-2">
          <div className="flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-redis" />
            <span className="text-sm font-medium">Keys</span>
            {redisInfo && (
              <Badge variant="secondary" className="ml-auto text-[10px] h-5">
                {redisInfo.total_keys.toLocaleString()}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Database className="h-3 w-3 text-muted-foreground" />
            <select
              value={selectedDb}
              onChange={e => handleDatabaseChange(Number(e.target.value))}
              disabled={loading || databases.length === 0}
              className="flex-1 h-7 text-[11px] px-2 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-redis/20"
            >
              {databases.map(db => (
                <option key={db.index} value={db.index}>
                  {db.name} ({db.keyCount.toLocaleString()})
                </option>
              ))}
            </select>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowAddDialog(true)}
              disabled={isReadOnly}
              className="h-7 w-7"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowImportDialog(true)}
              disabled={isReadOnly}
              className="h-7 w-7"
            >
              <Upload className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="搜索键..."
                value={searchPattern}
                onChange={e => setSearchPattern(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="h-7 pl-6 text-xs rounded-md"
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSearch}
              disabled={loading}
              className="h-7 w-7"
            >
              {loading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              size="icon"
              variant={isSelectMode ? 'default' : 'ghost'}
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                setSelectedKeys(new Set());
              }}
              className="h-7 w-7"
            >
              <Layers className="h-3.5 w-3.5" />
            </Button>
          </div>

          {isSelectMode && selectedKeys.size > 0 && (
            <div className="flex gap-1 pt-1.5 border-t border-border/50">
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleSelectAll}
                className="flex-1 h-6 text-[10px]"
              >
                {selectedKeys.size === keys.length ? '取消' : '全选'} ({selectedKeys.size}/{keys.length})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleBatchExport('json')}
                disabled={exporting}
                className="h-6 px-2 text-[10px]"
              >
                导出
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBatchDelete}
                disabled={isReadOnly}
                className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
              >
                删除
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-2 py-1">
          <div className="space-y-0.5">
            {keys.map(key => (
              <div
                key={key.key}
                className={cn(
                  'group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors',
                  selectedKey === key.key
                    ? 'bg-redis/10 text-redis'
                    : 'hover:bg-muted/60'
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
                    className="h-3 w-3 rounded border-border"
                  />
                )}
                {getTypeIcon(key.type)}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{key.key}</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {getTypeBadge(key.type)}
                    <span>{formatBytes(key.size)}</span>
                    {key.ttl !== -1 && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTTL(key.ttl)}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={e => {
                    e.stopPropagation();
                    handleDeleteKey(key.key);
                  }}
                  disabled={isReadOnly}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Info Bar */}
        {redisInfo && (
          <div className="flex-shrink-0 border-b border-border/50 px-4 py-2">
            <div className="grid grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-redis" />
                <div>
                  <div className="text-xs font-medium">{redisInfo.version}</div>
                  <div className="text-[10px] text-muted-foreground">版本</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5 text-primary" />
                <div>
                  <div className="text-xs font-medium">{redisInfo.used_memory}</div>
                  <div className="text-[10px] text-muted-foreground">内存</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-green-500" />
                <div>
                  <div className="text-xs font-medium">{redisInfo.connected_clients}</div>
                  <div className="text-[10px] text-muted-foreground">连接</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-blue-500" />
                <div>
                  <div className="text-xs font-medium">{redisInfo.total_keys.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">键总数</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedKey && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Key Header */}
            <div className="flex-shrink-0 border-b border-border/50 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {getTypeIcon(keys.find(k => k.key === selectedKey)?.type || 'string')}
                <div className="min-w-0">
                  <span className="text-sm font-mono font-medium truncate block">{selectedKey}</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                    {getTypeBadge(keys.find(k => k.key === selectedKey)?.type || 'string')}
                    <span>{formatBytes(keys.find(k => k.key === selectedKey)?.size || 0)}</span>
                    {isReadOnly && (
                      <Badge variant="outline" className="text-[9px] h-4 border-amber-300 text-amber-600">只读</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowEditDialog(true)} disabled={isReadOnly}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCopy}>
                  {copied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleExport('json')} disabled={exporting}>
                  <Download className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRefresh} disabled={loading}>
                  <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteKey(selectedKey)} disabled={isReadOnly}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {/* Key Value */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs font-mono whitespace-pre-wrap">{keyValue}</pre>
            </div>
          </div>
        )}

        {!selectedKey && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Terminal className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p className="text-xs">点击键查看详情</p>
            </div>
          </div>
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
