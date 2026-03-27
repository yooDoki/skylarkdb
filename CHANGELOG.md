# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 自动更新功能集成
- 自动滚动到选中表功能
- 表列表美化滚动条样式
- 版本号动态获取（从 Tauri API）

### Changed
- 优化表列表滚动体验
- CI/CD 工作流配置更新

### Fixed
- 修复版本号硬编码问题
- 修复 tauri-action 配置参数

## [0.1.4] - 2024-03-27

### Added
- MySQL 数据库连接支持
- Redis 数据库连接支持
- 表数据浏览功能
- 行内编辑功能
- 表结构管理功能
- SQL 查询编辑器
- 设置对话框
- 主题切换（浅色/深色/跟随系统）
- 连接管理功能

### Security
- 添加数据库连接密码加密存储

## [0.1.3] - 2024-03-26

### Added
- 初始版本发布
- 基础 UI 框架搭建

[Unreleased]: https://github.com/yooDoki/skylarkdb/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/yooDoki/skylarkdb/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/yooDoki/skylarkdb/releases/tag/v0.1.3
