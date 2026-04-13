---
name: ui-header-optimization
overview: 将 TitleBar + App Header 两行合并为一行，消除顶部视觉冗余，释放内容区空间，整体布局更协调紧凑。
design:
  architecture:
    framework: react
    component: shadcn
  styleKeywords:
    - 紧凑
    - 简洁
    - 扁平化
    - 高效
  fontSystem:
    fontFamily: PingFang-SC
    heading:
      size: 18px
      weight: 600
    subheading:
      size: 14px
      weight: 500
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#3730A3"
      - "#4F46E5"
    background:
      - "#FFFFFF"
      - "#F8FAFC"
    text:
      - "#1E293B"
      - "#64748B"
    functional:
      - "#EF4444"
      - "#22C55E"
todos:
  - id: simplify-app-header
    content: 简化 App.tsx 的 Header 区域：缩减高度、移除光晕和副标题
    status: completed
  - id: adjust-sidebar-width
    content: 调整左侧边栏宽度从 280px 到 240px，更新折叠按钮位置
    status: completed
    dependencies:
      - simplify-app-header
  - id: remove-unused-titlebar
    content: 删除未使用的 TitleBar.tsx 及相关 CSS 样式
    status: completed
    dependencies:
      - simplify-app-header
  - id: test-layout
    content: 测试验证布局优化效果
    status: completed
    dependencies:
      - adjust-sidebar-width
      - remove-unused-titlebar
---

## 用户需求

优化 SkylarkDB 桌面应用的 UI 布局，解决"上面一行很占视野、整体看起来不协调"的问题。

## 核心问题分析

1. **顶部区域冗余臃肿**

- App.tsx 的 header（h-14 = 56px）包含：大 Logo + 光晕效果 + 副标题 + SettingsDialog
- TitleBar.tsx（h-9 = 36px）独立存在，包含：Logo + SettingsDialog + 窗口控制按钮
- 实际只有 App.tsx 的 header 被渲染，TitleBar 未被使用（可能是遗留代码）
- 两处 SettingsDialog 重复

2. **Header 设计过于繁重**

- Logo 区域有多层光晕效果
- "数据库管理工具" 副标题占据额外空间
- 整体高度 56px 对于功能栏来说过高

3. **左侧边栏宽度偏大**

- 当前固定宽度 280px（展开时）
- 对于简单的连接列表来说空间利用率低

4. **视觉重心失衡**

- 顶部占用约 92px 固定空间
- 内容区被压缩
- 整体比例不协调

## 优化目标

- 精简顶部区域，释放更多垂直空间给内容区
- 移除重复元素，统一视觉语言
- 优化布局比例，使整体更紧凑协调
- 保持功能完整性和用户体验

## 技术方案

### 技术栈

- React + TypeScript
- Tailwind CSS
- Lucide React 图标库
- Tauri 桌面框架

### 优化策略

#### 1. 简化 App.tsx Header（核心改动）

- **高度优化**：从 `h-14`（56px）缩减至 `h-12`（48px）
- **Logo 区域精简**：
- 移除多层光晕效果（blur-xl 等）
- 仅保留单层轻微光晕或完全移除
- 图标尺寸从 `h-6 w-6` 保持不变
- **文字精简**：
- 主标题 "SkylarkDB" 保持
- 删除副标题 "数据库管理工具"
- **布局调整**：
- 左侧 Logo 区域更紧凑
- 右侧功能按钮更紧凑

#### 2. 统一功能入口

- 移除 App.tsx header 中的 SettingsDialog
- 考虑将设置入口整合到左侧边栏底部（如果用户同意）
- 保留主题切换按钮

#### 3. 优化左侧边栏宽度

- 从固定 280px（`left-[320px]`）缩减至 240px
- 相应调整折叠按钮位置
- 搜索框和功能按钮更紧凑

#### 4. 清理未使用代码

- 删除 TitleBar.tsx（未被 main.tsx 或 App.tsx 引用）
- 清理 index.css 中 titlebar 相关样式

### 性能考量

- 移除光晕效果可减少重绘开销
- 布局改动影响范围可控，无性能风险
- 无需修改状态管理或数据流

## 设计优化方案

### 优化后的布局结构

```
+------------------------------------------------------------------+
|  [Logo] SkylarkDB                    [主题] [设置]  (h-12: 48px) |
+------------------------------------------------------------------+
|  [折叠] |  连接列表 (w-60: 240px)  |   主内容区                    |
|  按钮   |                          |                              |
|        |  [搜索框]                  |   数据库浏览器/欢迎页           |
|        |  [+ 新建连接]              |                              |
|        |  连接项1                    |                              |
|        |  连接项2                    |                              |
|        |  ...                       |                              |
+------------------------------------------------------------------+
```

### 设计风格关键词

- **紧凑高效**：减少视觉冗余，提升信息密度
- **简洁专业**：移除装饰性光晕，保持专业感
- **扁平化**：减少层次感，让内容更突出

### 优化细节

1. **Header 区域**

- 高度：48px（原 56px）
- Logo：移除光晕，保留图标和主标题
- 功能按钮：主题切换 + 设置按钮，尺寸紧凑

2. **左侧边栏**

- 宽度：240px（原 280px）
- 搜索框高度精简
- 连接项间距优化

3. **整体比例**

- 顶部固定区域从 92px 降至 48px
- 内容区获得更多垂直空间
- 左右比例更协调