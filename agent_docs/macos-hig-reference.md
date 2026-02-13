# macOS HIG 设计规范速查（Web/Tauri 桌面应用适配）

> 本文档基于 Apple Human Interface Guidelines (HIG) 及社区资源整理，
> 面向使用 HTML/CSS 实现 macOS 原生风格的 Tauri 桌面应用。
> 所有 `pt` 值在 @2x Retina 屏幕上等同于 CSS `px`。
>
> 最后更新：2025-02（macOS Sequoia 15 + Tahoe 26 预览）

---

## 1. 排版系统（Typography）

macOS 系统字体为 **SF Pro**（`font-family: system-ui, -apple-system, BlinkMacSystemFont`）。

### 1.1 macOS 内置文本样式

| 样式 | 字号 (pt/px) | 行高 (pt/px) | 字重 | 强调字重 | CSS 近似 |
|------|-------------|-------------|------|---------|---------|
| Large Title | 26 | 32 | Regular (400) | Bold (700) | — |
| Title 1 | 22 | 26 | Regular (400) | Bold (700) | — |
| Title 2 | 17 | 22 | Regular (400) | Bold (700) | — |
| Title 3 | 15 | 20 | Regular (400) | Semibold (600) | — |
| **Headline** | **13** | **16** | **Bold (700)** | Heavy (800) | 侧边栏标题 |
| **Body** | **13** | **16** | Regular (400) | Semibold (600) | 正文、控件文字 |
| Callout | 12 | 15 | Regular (400) | Semibold (600) | 次要说明 |
| Subheadline | 11 | 14 | Regular (400) | Semibold (600) | 标签、badge |
| Footnote | 10 | 13 | Regular (400) | Semibold (600) | 脚注、hint |
| Caption 1 | 10 | 13 | Regular (400) | Medium (500) | 时间戳 |
| Caption 2 | 10 | 13 | Medium (500) | Semibold (600) | — |

**关键结论**：
- macOS 默认正文/控件字号为 **13px**（不是 14px）
- 最小建议字号 **10px**（Footnote/Caption），Widget 中最小 11px
- 行高比 ≈ 1.23（Body 13/16）
- macOS **不支持** Dynamic Type

### 1.2 字体 Letter-Spacing（Tracking）

SF Pro 在不同字号下有内建 tracking 调整（CSS `letter-spacing`）：

| 字号 | Tracking |
|------|---------|
| 10pt | +0.12pt |
| 11pt | +0.06pt |
| 12pt | 0 |
| **13pt** | **-0.08pt** |
| 14pt | -0.15pt |
| 15pt | -0.23pt |
| 17pt | -0.43pt |

> 在 Web 中使用 `system-ui` 时，浏览器会自动应用系统字体的 tracking。
> 如果用自定义字体需手动设置 `letter-spacing`。

---

## 2. 控件尺寸（Control Sizes）

macOS AppKit 提供 4 档控件尺寸。以下为常用控件的参考高度：

### 2.1 尺寸对照表

| 档位 | 字号 | 按钮高度 | 输入框高度 | 分段控件高度 | 适用场景 |
|------|------|---------|----------|------------|---------|
| **Large** | 15px | 28px | 28px | 28px | 主要操作（macOS 11+） |
| **Regular** | 13px | 22px | 22px | 22px | 标准窗口内控件 |
| **Small** | 11px | 19px | 19px | 19px | 工具面板、检查器侧栏 |
| **Mini** | 10px | 15px | 15px | 15px | 底部栏、紧凑工具栏 |

### 2.2 我们的应用推荐

在我们的 Tauri 应用中：
- **主内容区**：使用 Regular 尺寸（13px 字号，22px 控件高度）
- **侧边检查器面板**（如 ModelPropertyPanel）：使用 Small 尺寸（11px 字号，19px 控件高度）或紧凑的 Regular
- **表单弹窗**（如 ModelForm）：使用 Regular 尺寸
- **底部工具栏**：Small 或 Mini

---

## 3. 圆角半径（Corner Radius）

| 元素 | 圆角半径 | 备注 |
|------|---------|------|
| 窗口 | 10px | macOS Big Sur+ 窗口自身圆角 |
| 对话框 / Sheet | 10px | 同窗口 |
| 按钮（Push Button） | 5–6px | 标准矩形按钮 |
| 按钮（Capsule / Pill） | 全圆角 (h/2) | 工具栏胶囊按钮 |
| 输入框（Text Field） | 5px | 标准 rounded border |
| 分段控件（Segmented Control） | 5–6px (外框) | 内部 tab 略小 |
| 弹出菜单 / Popover | 6–8px | — |
| 卡片 / Group Box | 8–10px | 内容容器 |
| 搜索框 | 全圆角 (h/2) | 与 Spotlight 一致 |
| 工具提示（Tooltip） | 4px | — |

### CSS 映射建议

```css
:root {
  --radius-xs: 4px;    /* tooltip, tag */
  --radius-sm: 5px;    /* button, input, segmented */
  --radius-md: 8px;    /* card, group box, popover */
  --radius-lg: 10px;   /* dialog, sheet */
  --radius-full: 9999px; /* pill, search bar */
}
```

---

## 4. 间距系统（Spacing）

macOS 不严格遵循 8pt 网格，而是采用基于 **4pt 增量** 的实用间距。

### 4.1 窗口级间距

| 位置 | 间距 | 备注 |
|------|------|------|
| 窗口边缘 → 内容（左右底） | 20px | 标准窗口边距 |
| 标题栏/工具栏 → 内容 | 14px | 不含 Tab View |
| Tab View 顶部 → 标题栏 | 12px | Tab 窗口 |
| Tab View 内边距 | 16px | 四周 |
| Group Box 内边距 | 16px | 四周 |

### 4.2 控件间距（Regular 尺寸）

| 场景 | 间距 |
|------|------|
| 标签冒号 → 控件 | 6px |
| 垂直堆叠控件之间 | 6px |
| 分隔线上下额外空间 | 12px |
| 控件组之间额外空间 | 8px（在 6px 基础上） |
| 节标题 → 首个控件 | 8px |
| 节与节之间 | 12px |
| 最后控件 → 底部按钮 | 12px |
| 底部按钮行上边距 | 12px |
| 底部按钮行边距（左右底） | 20px |

### 4.3 控件间距（Small 尺寸）

与 Regular 类似，但可适当缩减：
- 控件之间：6px
- 节间距：12px
- 边距：可缩减至 10–16px

### 4.4 控件间距（Mini 尺寸）

- 控件之间：4px
- 节间距：8–12px
- 边距：10px

---

## 5. 表单布局（Form Layout）

### 5.1 Center Equalization（核心原则）

macOS 表单采用 **中心均衡（Center Equalization）** 布局：
- **标签右对齐**（以冒号为基准线）
- **控件左对齐**
- 视觉重心平衡在左右两侧

```
          名称: [___________]
          性别: (男) (女)
      年龄范围: [__] — [__]
          描述: [___________]
               [___________]
```

### 5.2 布局规则

1. 标签以**冒号右对齐**，统一宽度列
2. 控件以**左边缘对齐**
3. 同一行的标签与控件**首基线对齐**（first baseline aligned）
4. 相似类型控件保持**一致宽度**（跨分组也是）
5. 依赖关系的子控件**缩进到父控件文字起始位置**

### 5.3 CSS 实现参考

```css
.form-row {
  display: grid;
  grid-template-columns: var(--label-width, 5rem) 1fr;
  gap: 6px;           /* label ↔ control */
  padding: 6px 20px;  /* 垂直 + 水平边距 */
  align-items: first baseline; /* 首基线对齐 */
}

.form-label {
  text-align: right;
  font-size: 13px;
  color: var(--secondary-label-color);
}
```

### 5.4 辅助说明文字

- 使用 **Small** 尺寸（11px）
- 颜色为 **secondary label color**（更淡）
- 左对齐到控件文字起始位置
- 与控件间距 **4px**

---

## 6. 按钮（Buttons）

### 6.1 按钮类型

| 类型 | 用途 | 样式特征 |
|------|------|---------|
| Push Button (Bordered) | 标准操作按钮 | 带边框和背景，圆角 5px |
| Push Button (Primary) | 主要操作 | 强调色填充（蓝色） |
| Borderless | 工具栏/内联操作 | 无边框，hover 显示背景 |
| Destructive | 删除/危险操作 | 红色文字或红色填充 |

### 6.2 按钮底部栏规则

- OK/确认按钮始终在**取消按钮右侧**
- 确认按钮宽度 ≥ 取消按钮宽度
- Help 按钮固定在**左下角**
- 确认按钮可通过 Return 键触发

### 6.3 底部栏尺寸

| 栏尺寸 | 栏高 | 按钮尺寸 | 按钮宽 | 按钮高 | 按钮边距 | 按钮间距 |
|--------|------|---------|-------|-------|---------|---------|
| Large | 32px | Regular | ≥31px | 18px | 8px | 1px |
| Small | 22px | Mini | ≥25px | 14px | 6px | 1px |

---

## 7. 分段控件（Segmented Control）

### 7.1 设计规范

- 各段**宽度相等**
- 段数控制在 **5–7 个以内**
- 与同尺寸按钮**等高**
- 圆角与按钮一致（5–6px 外框）

### 7.2 CSS 实现要点

```css
.segmented-control {
  display: inline-flex;
  width: fit-content;
  background: var(--control-background); /* 淡灰底色 */
  border-radius: 6px;
  padding: 1px;
}

.segmented-control button {
  border-radius: 5px;
  font-size: 13px;      /* Regular */
  padding: 2px 10px;
  font-weight: 500;
}

.segmented-control button[aria-selected="true"] {
  background: white;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}
```

---

## 8. 输入框（Text Fields）

### 8.1 设计规范

- 高度随控件尺寸变化（Regular 22px, Small 19px）
- 圆角 **5px**
- 边框颜色：`border-color: var(--separator-color)`
- Focus ring：系统强调色（默认蓝色），**3–4px 外扩**，圆角匹配
- 宽度应与预期输入量匹配
- 多个输入框**等距垂直排列**，宽度保持一致

### 8.2 Focus Ring CSS

```css
input:focus-visible,
textarea:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.35); /* 系统蓝 35% 透明 */
  /* 或使用 ring utility: ring-2 ring-ring/40 ring-offset-0 */
}
```

> macOS 原生 focus ring 是 **外扩** 样式，不占用控件内部空间。
> 在 Web 中用 `box-shadow` 模拟最为接近。

---

## 9. 颜色与材质（Colors & Materials）

### 9.1 语义颜色

| 用途 | macOS 语义 | Tailwind 近似 |
|------|-----------|--------------|
| 主文字 | labelColor | `text-foreground` |
| 次要文字 | secondaryLabelColor | `text-muted-foreground` |
| 三级文字 | tertiaryLabelColor | `text-muted-foreground/60` |
| 占位符 | placeholderTextColor | `text-muted-foreground/50` |
| 控件背景 | controlBackgroundColor | `bg-background` |
| 窗口背景 | windowBackgroundColor | `bg-background` |
| 分隔线 | separatorColor | `border-border/40` |
| 强调色 | controlAccentColor | `bg-primary` |
| 选中背景 | selectedContentBackgroundColor | `bg-accent` |

### 9.2 毛玻璃与透明度（Vibrancy）

macOS 侧边栏和工具栏常使用 **Vibrant** 材质（毛玻璃效果）：
- 侧边栏背景：半透明 + 模糊
- 使用 `backdrop-filter: blur()` 近似
- 遵循 Reduce Transparency 无障碍设置

---

## 10. macOS Tahoe (26) — Liquid Glass 设计语言

> macOS 26 Tahoe (WWDC 2025) 引入了 **Liquid Glass** 设计语言，
> 是 macOS 有史以来最大的视觉更新。以下是关键变化：

### 10.1 主要变化

| 变化 | 描述 |
|------|------|
| **更大圆角** | 窗口和控件圆角明显增大 |
| **透明菜单栏** | 菜单栏变为透明，桌面/窗口可见 |
| **Liquid Glass 材质** | 新的半透明玻璃质感材质，取代部分 Vibrancy |
| **图标风格** | 更多使用细线/轮廓风格图标 |
| **更强调内容** | 界面元素更轻量，让内容成为焦点 |

### 10.2 对我们的影响

当前项目基于 macOS Sequoia (15) 设计。Tahoe 的变化主要影响：
- 圆角值可能需要增大
- 可考虑更多使用透明/半透明效果
- 暂不需要立即适配，等 Tahoe 正式发布后再评估

---

## 11. 分组方式（Grouping Controls）

macOS 提供三种控件分组方式：

### 11.1 空白间距分组

- 最轻量，适合少量控件
- 组间距 12–24px
- 推荐作为默认方式

### 11.2 分隔线分组

- 适合空间紧凑的场景
- 分隔线上下各 12px（Regular 控件）
- 分隔线颜色使用 `separatorColor`

### 11.3 Group Box 分组

- 最强视觉分隔
- 内边距 16px 四周
- 占用空间最大
- 组标题取代节标题

---

## 12. 快速参考：CSS Token 映射

以下是我们项目中推荐的 CSS 变量/Tailwind 配置：

```css
/* 控件尺寸 */
--control-height-lg: 28px;     /* Large */
--control-height: 22px;        /* Regular */
--control-height-sm: 19px;     /* Small */
--control-height-xs: 15px;     /* Mini */

/* 字号 */
--font-size-body: 13px;        /* Body / Regular controls */
--font-size-callout: 12px;     /* Callout */
--font-size-subhead: 11px;     /* Small controls, hints */
--font-size-footnote: 10px;    /* Mini controls, footnotes */
--font-size-title3: 15px;      /* Title 3 */
--font-size-title2: 17px;      /* Title 2 */

/* 行高 */
--line-height-body: 16px;
--line-height-callout: 15px;
--line-height-subhead: 14px;
--line-height-footnote: 13px;

/* 间距 */
--spacing-xs: 4px;
--spacing-sm: 6px;
--spacing-md: 8px;
--spacing-lg: 12px;
--spacing-xl: 16px;
--spacing-2xl: 20px;

/* 圆角 */
--radius-control: 5px;         /* button, input */
--radius-card: 8px;            /* card, popover */
--radius-window: 10px;         /* dialog */
--radius-pill: 9999px;         /* search, pill button */
```

---

## 参考资料

- [Apple HIG — Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos)
- [Apple HIG — Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Apple HIG — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Apple HIG — Segmented Controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)
- [Apple HIG — Text Fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)
- [Mario Guzman — macOS Layout Guidelines](https://marioaguzman.github.io/design/layoutguidelines)（非常详细的间距规范）
- [WWDC25 — Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)（Liquid Glass）
