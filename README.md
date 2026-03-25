需要查看项目的根目录结构，以获取更多关于项目的信息，包括技术栈、依赖等。
        
            
toolName: view_folder
            
status: success
          
/Users/tunan/Documents/开发/开发/skylarkdb
          
需要查看项目的关键配置文件，包括package.json和README.md，以了解项目的技术栈和功能。
        
            
toolName: view_files
            
status: success
          
            
filePath: /Users/tunan/Documents/开发/开发/skylarkdb/skylarkdb/package.json
          
需要查看README.md文件，了解项目的详细描述和功能。
        
            
toolName: view_files
            
status: success
          
            
filePath: /Users/tunan/Documents/开发/开发/skylarkdb/skylarkdb/README.md
          
# SkylarkDB 项目描述

## 项目概述

SkylarkDB 是一款现代化的 macOS 数据库管理工具，专注于提供直观、高效的数据库操作体验。它支持 MySQL 和 Redis 两种主流数据库，为开发者和数据库管理员提供了一个统一的管理界面。

## 核心功能

- **现代化用户界面**：采用简洁美观的设计风格，支持深色/浅色主题切换，提供愉悦的视觉体验
- **多数据库支持**：同时支持 MySQL 和 Redis 数据库，满足不同场景的需求
- **SQL 编辑器**：内置功能强大的 SQL 编辑器，支持语法高亮和自动补全
- **可视化数据管理**：通过直观的表格形式展示数据，支持数据浏览和编辑
- **强大的搜索功能**：提供灵活的搜索和过滤能力，快速定位所需数据
- **连接管理**：支持创建、编辑、删除数据库连接，连接状态实时显示
- **配置持久化**：自动保存连接配置，无需重复设置

## 技术架构

SkylarkDB 采用现代化的技术栈，确保性能和用户体验：

- **前端**：React + TypeScript + Tailwind CSS，提供响应式、美观的用户界面
- **桌面框架**：Tauri (Rust)，实现轻量级、高性能的桌面应用
- **状态管理**：Zustand，提供简洁高效的状态管理方案
- **UI 组件**：Radix UI + 自定义组件，确保界面一致性和交互体验

## 功能模块

### 连接管理
- 创建、编辑、删除数据库连接
- 支持 MySQL 和 Redis 连接配置
- 连接状态实时监控
- SSL 连接支持

### MySQL 浏览器
- 数据表列表展示
- 表结构详细查看
- SQL 查询编辑器
- 查询结果表格展示
- 执行时间统计
- 分页功能

### Redis 浏览器
- Key 搜索和过滤
- 支持多种数据类型（String、Hash、List、Set、ZSet）
- Key 值查看和编辑
- TTL 管理
- 服务器信息监控

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

## 开发环境要求

- Node.js 18+
- Rust 1.70+
- macOS 10.15+

## 应用场景

SkylarkDB 适用于以下场景：

- **开发环境**：快速查看和修改数据库数据，执行 SQL 查询
- **测试环境**：验证数据结构和内容，进行数据调试
- **生产环境**：安全地浏览生产数据，执行必要的管理操作
- **学习环境**：了解数据库结构和操作，学习 SQL 语法

## 优势特点

- **轻量级**：基于 Tauri 框架，应用体积小，启动速度快
- **跨平台**：虽然主要针对 macOS，但其架构支持其他平台
- **安全可靠**：Rust 后端确保性能和安全性
- **用户友好**：直观的界面设计，降低使用门槛
- **高度可扩展**：模块化架构，便于添加新功能和支持新数据库类型

SkylarkDB 旨在成为开发者和数据库管理员的得力助手，通过简化数据库管理操作，提高工作效率，让数据库管理变得更加轻松愉快。
