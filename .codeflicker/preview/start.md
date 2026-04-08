# SkylarkDB 启动指南

## 项目概述
SkylarkDB 是一个基于 Tauri v2 构建的跨平台桌面数据库管理工具，前端使用 React + Vite + TypeScript + TailwindCSS。

## skylarkdb - 桌面应用

### 快速启动

```bash
cd skylarkdb
npm run tauri:dev
```

**启动后**：桌面应用窗口将自动打开，前端开发服务器运行在 http://localhost:1420

```yaml
subProjectPath: skylarkdb
command: npm run tauri:dev
cwd: skylarkdb
port: 1420
previewUrl: null
description: Tauri 桌面数据库管理工具，启动后会自动打开应用窗口
```

### 仅启动前端开发服务器

如果只需要开发前端界面，可以单独启动 Vite 开发服务器：

```bash
cd skylarkdb
npm run dev
```

**访问地址**：http://localhost:1420

```yaml
subProjectPath: skylarkdb
command: npm run dev
cwd: skylarkdb
port: 1420
previewUrl: http://localhost:1420
description: 仅启动前端开发服务器，用于 UI 开发调试
```
