# 版本发布流程

本文档描述了 SkylarkDB 的版本发布流程，确保每次发布都是规范、可追溯的。

## 目录

- [版本号规范](#版本号规范)
- [发布前准备](#发布前准备)
- [发布流程](#发布流程)
- [发布后验证](#发布后验证)
- [紧急修复流程](#紧急修复流程)

---

## 版本号规范

SkylarkDB 遵循 [语义化版本 2.0.0](https://semver.org/spec/v2.0.0.html) 规范：

```
MAJOR.MINOR.PATCH

MAJOR: 不兼容的 API 变更
MINOR: 向后兼容的新增功能
PATCH: 向后兼容的问题修复
```

### 示例

- `0.1.5` → `0.1.6`: 添加新功能或修复问题（PATCH/Minor）
- `0.1.5` → `0.2.0`: 添加重要新功能（Minor）
- `0.1.5` → `1.0.0`: 正式版发布（Major）

### 预发布版本

- `0.1.5-alpha.1`: Alpha 测试版
- `0.1.5-beta.1`: Beta 测试版
- `0.1.5-rc.1`: 候选发布版

---

## 发布前准备

### 1. 更新 CHANGELOG.md

```bash
# 将 [Unreleased] 中的内容移动到新的版本号下
# 使用格式：## [版本号] - YYYY-MM-DD
```

### 2. 更新版本号

```bash
# 更新 package.json
"version": "0.1.5"

# 更新 src-tauri/tauri.conf.json
"version": "0.1.5"

# 确保两个文件版本号一致
```

### 3. 本地构建测试

```bash
cd skylarkdb
npm install
npm run tauri:build
```

### 4. 测试安装包

- 在本地测试安装包是否能正常安装
- 验证所有核心功能正常
- 检查自动更新功能是否正常

### 5. 准备发布说明

准备以下内容：
- 版本亮点（3-5 个）
- 新增功能
- 改进内容
- 修复的问题
- 已知问题（如果有）

---

## 发布流程

### 步骤 1: 提交所有更改

```bash
# 检查当前状态
git status

# 添加所有更改
git add .

# 提交更改
git commit -m "chore: bump version to 0.1.5"
```

### 步骤 2: 推送到远程

```bash
git push origin main
```

### 步骤 3: 创建版本标签

```bash
# 创建带注释的标签
git tag -a v0.1.5 -m "Release v0.1.5

- 亮点功能 1
- 亮点功能 2
- 亮点功能 3

详细说明：
- 新增功能描述
- 改进内容描述
- 修复问题描述"

# 查看标签
git show v0.1.5
```

### 步骤 4: 推送标签

```bash
# 推送标签到远程（触发 CI/CD）
git push origin v0.1.5
```

### 步骤 5: 监控 CI/CD

访问 GitHub Actions 页面：
1. 检查构建是否成功
2. 确认所有平台（macOS、Ubuntu、Windows）都构建成功
3. 验证更新器资源（latest.json、签名文件）是否正确生成

---

## 发布后验证

### 1. 检查 GitHub Release

访问 GitHub Releases 页面：
- [ ] 版本标签正确
- [ ] 发布说明完整
- [ ] 所有平台的安装包已上传
- [ ] latest.json 文件已上传
- [ ] 签名文件已上传

### 2. 测试自动更新

```bash
# 在旧版本应用中点击"检查更新"
# 验证是否能检测到新版本
# 验证下载和安装过程
```

### 3. 测试新版本

- [ ] 正常启动
- [ ] 数据库连接正常
- [ ] 核心功能正常
- [ ] 设置功能正常
- [ ] UI 显示正常

### 4. 更新文档

如果发布了新功能，更新：
- README.md
- 用户文档
- API 文档

---

## 紧急修复流程

如果发现严重问题需要紧急修复：

### 1. 创建修复分支

```bash
git checkout -b hotfix/critical-issue
```

### 2. 修复问题并测试

```bash
# 修复代码
# 本地测试
npm run tauri:build
```

### 3. 提交修复

```bash
git add .
git commit -m "fix: 修复严重问题描述"
```

### 4. 合并到主分支

```bash
git checkout main
git merge hotfix/critical-issue
```

### 5. 创建修复版本

```bash
# 更新版本号（PATCH 版本）
# 例如：0.1.5 → 0.1.5.1
git commit -m "chore: bump version to 0.1.5.1"

# 创建标签
git tag -a v0.1.5.1 -m "Hotfix v0.1.5.1

紧急修复：问题描述"
```

### 6. 推送发布

```bash
git push origin main
git push origin v0.1.5.1
```

---

## 注意事项

### ⚠️ 禁止事项

1. **不要随意创建标签**
   - 必须经过完整的测试流程
   - 必须更新 CHANGELOG.md
   - 必须本地构建测试通过

2. **不要跳过版本号**
   - 严格按照语义化版本规范
   - 例如：不要从 0.1.4 直接跳到 0.1.6

3. **不要发布未测试的代码**
   - 所有代码必须经过本地测试
   - 确保构建成功

4. **不要使用过时的 CI 配置**
   - 检查 tauri-action 最新参数
   - 确保配置正确

### ✅ 最佳实践

1. **使用有意义的提交信息**
   ```
   fix: 修复版本号硬编码问题
   feat: 添加自动更新功能
   chore: bump version to 0.1.5
   ```

2. **保持版本号一致**
   - package.json
   - tauri.conf.json
   - 必须保持一致

3. **详细的发布说明**
   - 至少 3 个亮点
   - 详细的功能描述
   - 清晰的修复说明

4. **测试覆盖**
   - 本地构建测试
   - 功能测试
   - 自动更新测试

---

## 常用命令

```bash
# 查看所有标签
git tag -l

# 查看最新标签
git describe --tags --abbrev=0

# 删除本地标签
git tag -d v0.1.6

# 删除远程标签
git push origin :refs/tags/v0.1.6

# 查看标签详情
git show v0.1.5

# 比较两个版本
git diff v0.1.4 v0.1.5

# 查看版本之间的提交
git log v0.1.4..v0.1.5 --oneline
```

---

## 参考资源

- [语义化版本](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Tauri 发布指南](https://tauri.app/v1/guides/distribution/updater/)
- [GitHub Actions](https://docs.github.com/en/actions)
