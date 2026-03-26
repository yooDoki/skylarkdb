import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Download, Upload, Database, FileJson, FileCode, FileSpreadsheet } from 'lucide-react';
import type { ExportOptions, ExportResult, ImportOptions, ImportResult, SakilaInitOptions, SakilaInitResult } from '@/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  database?: string;
}

export function ImportExportModal({ isOpen, onClose, connectionId, database }: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'sakila'>('export');
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">数据导入 / 导出</h2>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 flex items-center gap-2 ${activeTab === 'export' ? 'border-b-2 border-primary' : ''}`}
          >
            <Download className="w-4 h-4" />
            导出
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 flex items-center gap-2 ${activeTab === 'import' ? 'border-b-2 border-primary' : ''}`}
          >
            <Upload className="w-4 h-4" />
            导入
          </button>
          <button
            onClick={() => setActiveTab('sakila')}
            className={`px-4 py-2 flex items-center gap-2 ${activeTab === 'sakila' ? 'border-b-2 border-primary' : ''}`}
          >
            <Database className="w-4 h-4" />
            Sakila 示例
          </button>
        </div>
        
        <div className="p-6">
          {activeTab === 'export' && (
            <ExportPanel connectionId={connectionId} database={database} onClose={onClose} />
          )}
          {activeTab === 'import' && (
            <ImportPanel connectionId={connectionId} database={database} onClose={onClose} />
          )}
          {activeTab === 'sakila' && (
            <SakilaPanel onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

// Export Panel Component
function ExportPanel({ connectionId, database, onClose }: { connectionId: string; database?: string; onClose: () => void }) {
  const [options, setOptions] = useState<Partial<ExportOptions>>({
    connectionId,
    database: database || '',
    tables: [],
    format: 'Json',
    includeStructure: true,
    includeData: true,
    outputPath: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  const formatIcons: Record<string, React.ReactNode> = {
    Json: <FileJson className="w-4 h-4" />,
    Sql: <FileCode className="w-4 h-4" />,
    Csv: <FileSpreadsheet className="w-4 h-4" />,
  };

  const handleExport = async () => {
    if (!options.database || !options.outputPath || options.tables?.length === 0) {
      alert('请填写完整的导出选项');
      return;
    }

    setLoading(true);
    try {
      const result = await invoke<ExportResult>('export_mysql_data', {
        options: {
          connectionId: options.connectionId,
          database: options.database,
          tables: options.tables,
          format: options.format,
          includeStructure: options.includeStructure,
          includeData: options.includeData,
          outputPath: options.outputPath,
        },
      });
      setResult(result);
    } catch (error) {
      alert(`导出失败：${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">导出选项</CardTitle>
          <CardDescription>配置数据导出参数</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>数据库名</Label>
            <Input
              value={options.database}
              onChange={(e) => setOptions({ ...options, database: e.target.value })}
              placeholder="输入数据库名"
            />
          </div>

          <div>
            <Label>输出路径</Label>
            <Input
              value={options.outputPath}
              onChange={(e) => setOptions({ ...options, outputPath: e.target.value })}
              placeholder="例如：/path/to/export/table.json"
            />
            <p className="text-sm text-muted-foreground mt-1">
              支持 .json, .sql, .csv 格式
            </p>
          </div>

          <div>
            <Label>导出格式</Label>
            <div className="flex gap-2 mt-2">
              {(['Json', 'Sql', 'Csv'] as const).map((format) => (
                <Button
                  key={format}
                  variant={options.format === format ? 'default' : 'outline'}
                  onClick={() => setOptions({ ...options, format })}
                  className="flex items-center gap-2"
                >
                  {formatIcons[format]}
                  {format}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.includeStructure}
                onChange={(e) => setOptions({ ...options, includeStructure: e.target.checked })}
              />
              <span>包含表结构</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.includeData}
                onChange={(e) => setOptions({ ...options, includeData: e.target.checked })}
              />
              <span>包含数据</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className={result.success ? 'border-green-500' : 'border-red-500'}>
          <CardHeader>
            <CardTitle className={result.success ? 'text-green-600' : 'text-red-600'}>
              {result.success ? '导出成功' : '导出失败'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{result.message}</p>
            <p className="text-sm text-muted-foreground mt-2">
              导出表数：{result.exportedTables} | 导出行数：{result.exportedRows}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              文件路径：{result.filePath}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>关闭</Button>
        <Button onClick={handleExport} disabled={loading}>
          {loading ? '导出中...' : '开始导出'}
        </Button>
      </div>
    </div>
  );
}

// Import Panel Component
function ImportPanel({ connectionId, database, onClose }: { connectionId: string; database?: string; onClose: () => void }) {
  const [options, setOptions] = useState<Partial<ImportOptions>>({
    connectionId,
    database: database || '',
    filePath: '',
    format: 'Json',
    tableMapping: [],
    onConflict: 'Skip',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    if (!options.database || !options.filePath) {
      alert('请填写完整的导入选项');
      return;
    }

    setLoading(true);
    try {
      const result = await invoke<ImportResult>('import_mysql_data', {
        options: {
          connectionId: options.connectionId,
          database: options.database,
          filePath: options.filePath,
          format: options.format,
          tableMapping: options.tableMapping || [],
          onConflict: options.onConflict,
        },
      });
      setResult(result);
    } catch (error) {
      alert(`导入失败：${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">导入选项</CardTitle>
          <CardDescription>配置数据导入参数</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>目标数据库名</Label>
            <Input
              value={options.database}
              onChange={(e) => setOptions({ ...options, database: e.target.value })}
              placeholder="输入数据库名"
            />
          </div>

          <div>
            <Label>导入文件路径</Label>
            <Input
              value={options.filePath}
              onChange={(e) => setOptions({ ...options, filePath: e.target.value })}
              placeholder="例如：/path/to/import/data.json"
            />
          </div>

          <div>
            <Label>导入格式</Label>
            <div className="flex gap-2 mt-2">
              {(['Json', 'Sql', 'Csv'] as const).map((format) => (
                <Button
                  key={format}
                  variant={options.format === format ? 'default' : 'outline'}
                  onClick={() => setOptions({ ...options, format })}
                  className="flex items-center gap-2"
                >
                  {formatIcons[format]}
                  {format}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label>冲突处理策略</Label>
            <div className="flex gap-2 mt-2">
              {(['Skip', 'Update', 'Error'] as const).map((strategy) => (
                <Button
                  key={strategy}
                  variant={options.onConflict === strategy ? 'default' : 'outline'}
                  onClick={() => setOptions({ ...options, onConflict: strategy })}
                >
                  {strategy === 'Skip' ? '跳过' : strategy === 'Update' ? '更新' : '报错'}
                </Button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">MySQL 类型映射规则</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 字符串默认映射为 VARCHAR(255)</li>
              <li>• 长文本映射为 TEXT</li>
              <li>• 整数根据范围映射为 TINYINT/SMALLINT/INT/BIGINT</li>
              <li>• 浮点数映射为 DOUBLE</li>
              <li>• 布尔值映射为 TINYINT(1)</li>
              <li>• 日期时间自动识别映射</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className={result.success ? 'border-green-500' : 'border-red-500'}>
          <CardHeader>
            <CardTitle className={result.success ? 'text-green-600' : 'text-red-600'}>
              {result.success ? '导入成功' : '导入完成（有错误）'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{result.message}</p>
            <p className="text-sm text-muted-foreground mt-2">
              导入表数：{result.importedTables} | 导入行数：{result.importedRows}
            </p>
            {result.errors.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-red-600 font-medium">错误详情：</p>
                {result.errors.map((error, i) => (
                  <p key={i} className="text-sm text-red-500">
                    表 {error.table}: {error.message}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>关闭</Button>
        <Button onClick={handleImport} disabled={loading}>
          {loading ? '导入中...' : '开始导入'}
        </Button>
      </div>
    </div>
  );
}

// Sakila Panel Component
function SakilaPanel({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<Partial<SakilaInitOptions>>({
    mysqlVersion: '5.7',
    dockerContainerName: 'skylarkdb-sakila',
    hostPort: 3307,
    containerPort: 3306,
    rootPassword: 'root123',
    databaseName: 'sakila',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SakilaInitResult | null>(null);
  const [composeContent, setComposeContent] = useState<string>('');

  const handleInitDocker = async () => {
    setLoading(true);
    try {
      const result = await invoke<SakilaInitResult>('init_sakila_docker', {
        options: {
          mysqlVersion: options.mysqlVersion,
          dockerContainerName: options.dockerContainerName,
          hostPort: options.hostPort,
          containerPort: options.containerPort,
          rootPassword: options.rootPassword,
          databaseName: options.databaseName,
        },
      });
      setResult(result);
    } catch (error) {
      alert(`初始化失败：${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCompose = async () => {
    try {
      const content = await invoke<string>('generate_sakila_docker_compose', {
        options: {
          mysqlVersion: options.mysqlVersion,
          dockerContainerName: options.dockerContainerName,
          hostPort: options.hostPort,
          containerPort: options.containerPort,
          rootPassword: options.rootPassword,
          databaseName: options.databaseName,
        },
      });
      setComposeContent(content);
    } catch (error) {
      alert(`生成失败：${error}`);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sakila 示例数据库</CardTitle>
          <CardDescription>
            快速初始化 MySQL Sakila 示例数据库（兼容 MySQL 5.6+/5.7+）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>MySQL 版本</Label>
              <select
                className="w-full p-2 border rounded"
                value={options.mysqlVersion}
                onChange={(e) => setOptions({ ...options, mysqlVersion: e.target.value })}
              >
                <option value="5.6">MySQL 5.6</option>
                <option value="5.7">MySQL 5.7</option>
                <option value="8.0">MySQL 8.0</option>
              </select>
            </div>

            <div>
              <Label>容器名称</Label>
              <Input
                value={options.dockerContainerName}
                onChange={(e) => setOptions({ ...options, dockerContainerName: e.target.value })}
              />
            </div>

            <div>
              <Label>主机端口</Label>
              <Input
                type="number"
                value={options.hostPort}
                onChange={(e) => setOptions({ ...options, hostPort: parseInt(e.target.value) })}
              />
            </div>

            <div>
              <Label>容器端口</Label>
              <Input
                type="number"
                value={options.containerPort}
                onChange={(e) => setOptions({ ...options, containerPort: parseInt(e.target.value) })}
              />
            </div>

            <div>
              <Label>Root 密码</Label>
              <Input
                type="password"
                value={options.rootPassword}
                onChange={(e) => setOptions({ ...options, rootPassword: e.target.value })}
              />
            </div>

            <div>
              <Label>数据库名</Label>
              <Input
                value={options.databaseName}
                onChange={(e) => setOptions({ ...options, databaseName: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleInitDocker} disabled={loading}>
              {loading ? '初始化中...' : '一键初始化 (Docker)'}
            </Button>
            <Button variant="outline" onClick={handleGenerateCompose}>
              生成 Docker Compose
            </Button>
          </div>

          {composeContent && (
            <div className="mt-4">
              <Label>Docker Compose 配置</Label>
              <pre className="mt-2 p-4 bg-muted rounded-lg overflow-x-auto text-sm">
                {composeContent}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className={result.success ? 'border-green-500' : 'border-red-500'}>
          <CardHeader>
            <CardTitle className={result.success ? 'text-green-600' : 'text-red-600'}>
              {result.success ? '初始化成功' : '初始化失败'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{result.message}</p>
            {result.containerId && (
              <p className="text-sm text-muted-foreground mt-2">
                容器 ID: {result.containerId}
              </p>
            )}
            {result.connectionString && (
              <p className="text-sm text-muted-foreground mt-1">
                连接字符串：{result.connectionString}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>关闭</Button>
      </div>
    </div>
  );
}

const formatIcons: Record<string, React.ReactNode> = {
  Json: <FileJson className="w-4 h-4" />,
  Sql: <FileCode className="w-4 h-4" />,
  Csv: <FileSpreadsheet className="w-4 h-4" />,
};
