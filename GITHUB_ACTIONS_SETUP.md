# GitHub Actions 权限配置指南

## 问题
GitHub Actions 构建成功但无法创建 Release，报错：
```
Error: Resource not accessible by integration
```

## 解决方案

### 方法 1：在 GitHub 仓库设置中启用权限（推荐）

1. 打开仓库设置页面：
   - 访问 https://github.com/yooDoki/skylarkdb/settings/actions

2. 找到 **Workflow permissions** 部分

3. 选择 **Read and write permissions**

4. 勾选 **Allow GitHub Actions to create and approve pull requests**

5. 点击 **Save** 保存设置

### 方法 2：检查 Workflow 配置

确保 `.github/workflows/ci.yml` 中包含正确的权限配置：

```yaml
jobs:
  build:
    permissions:
      contents: write      # 创建 Release 需要
      packages: write      # 上传包需要
      actions: read        # 读取 Actions 状态需要
```

### 方法 3：使用 Personal Access Token（备选）

如果上述方法都无效，可以创建 Personal Access Token：

1. 访问 https://github.com/settings/tokens
2. 创建新的 token，勾选以下权限：
   - `repo` (完整权限)
   - `workflow`
3. 复制 token
4. 在仓库 Settings → Secrets and variables → Actions 中添加 Secret：
   - Name: `GITHUB_TOKEN_CUSTOM`
   - Value: 粘贴你的 token

## 验证配置

推送新的 tag 后，检查 GitHub Actions：
- 访问 https://github.com/yooDoki/skylarkdb/actions
- 查看最新的 CI/CD 运行记录
- 确认 "Build the app" 步骤成功创建 Release

## 常见问题

### Q: 为什么已经配置了 permissions 还是报错？
A: 这是因为仓库级别的 Workflow 权限默认是只读的，需要在仓库设置中手动开启写入权限。

### Q: 开启权限后需要重新推送 tag 吗？
A: 是的，需要删除并重新推送 tag，或者创建新的 tag 来触发新的构建。

### Q: 如何重新推送 tag？
```bash
# 删除本地和远程 tag
git tag -d v0.1.8
git push origin :refs/tags/v0.1.8

# 重新创建并推送
git tag v0.1.8
git push origin v0.1.8
```
