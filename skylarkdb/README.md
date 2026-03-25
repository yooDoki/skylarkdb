# SkylarkDB

一个现代化的 macOS 数据库管理工具，支持 MySQL 和 Redis。

## 功能特性

- 🎨 现代化的 UI 设计，支持深色/浅色主题
- 🔌 支持 MySQL 和 Redis 数据库
- 📝 SQL 编辑器，支持语法高亮和自动补全
- 📊 可视化数据浏览和编辑
- 🔍 强大的搜索和过滤功能
- 🚀 快速连接管理
- 💾 连接配置持久化存储

## 技术栈

- **前端**: React + TypeScript + Tailwind CSS
- **桌面框架**: Tauri (Rust)
- **状态管理**: Zustand
- **UI 组件**: Radix UI + 自定义组件

## 开发环境要求

- Node.js 18+
- Rust 1.70+
- macOS 10.15+

## 快速开始

### 1. 安装依赖

```bash
# 安装前端依赖
npm install

# 安装 Rust 依赖（会自动执行）
```

### 2. 开发模式运行

```bash
# 启动开发服务器
npm run tauri:dev
```

### 3. 构建应用

```bash
# 构建生产版本
npm run tauri:build
```

## 项目结构

```
skylarkdb/
├── src/                    # 前端源代码
│   ├── components/         # React 组件
│   ├── stores/            # Zustand 状态管理
│   ├── types/             # TypeScript 类型定义
│   ├── utils/             # 工具函数
│   ├── App.tsx            # 主应用组件
│   └── main.tsx           # 入口文件
├── src-tauri/             # Tauri 后端源代码
│   ├── src/               # Rust 源代码
│   │   ├── commands/      # Tauri 命令
│   │   ├── database/      # 数据库连接管理
│   │   ├── models/        # 数据模型
│   │   └── main.rs        # 入口文件
│   ├── Cargo.toml         # Rust 依赖配置
│   └── tauri.conf.json    # Tauri 配置
├── package.json           # Node.js 依赖配置
├── tailwind.config.js     # Tailwind CSS 配置
└── tsconfig.json          # TypeScript 配置
```

## 功能模块

### 连接管理
- 创建、编辑、删除数据库连接
- 支持 MySQL 和 Redis
- 连接状态实时显示
- SSL 连接支持

### MySQL 浏览器
- 数据表列表展示
- 表结构查看
- SQL 查询编辑器
- 查询结果表格展示
- 执行时间统计

### Redis 浏览器
- Key 搜索和过滤
- 支持多种数据类型（String、Hash、List、Set、ZSet）
- Key 值查看和编辑
- TTL 管理
- 服务器信息监控

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
