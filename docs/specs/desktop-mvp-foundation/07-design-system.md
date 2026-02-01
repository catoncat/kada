# Desktop MVP Foundation：Design System（v0.1）

> 目标：给 Shooting Planner（桌面应用 / Tauri）建立一套可落地的 UI 规范：**tokens + 组件规则 + 布局与信息密度**。  
> 这份文档的作用是让我们“自己搞设计”时有统一的语言，并且能直接约束后续页面实现（Tailwind / shadcn / Base UI）。

---

## 0) 范围与原则

### 范围（v0.1）

- 面向 **桌面应用**（非网页），默认窗口尺寸下信息密度要高、交互要快。
- 覆盖 Phase A（MVP）必需的通用视觉与交互规范：布局、排版、色彩、表格/列表、表单、对话框、任务反馈。
- 允许后续扩展到 Phase B（更强的 AI Agent/Chat/自动化），但 v0.1 不为它“反向设计”。

### 设计原则（必须遵守）

1. **极简但信息密度高**：少装饰、少渐变、少大插画；把信息结构做清楚。
2. **可预测**：同一类组件在全局保持一致（尺寸、间距、状态样式）。
3. **安全感优先**：破坏性操作用明确的对话框；默认值保守；可撤销则给撤销路径。
4. **桌面习惯**：键盘优先（Cmd/Ctrl+K、Enter、Esc、上下键）、hover 合理、焦点清晰。
5. **本地优先**：空间占用/成本提示必须“轻但可见”（不弹窗轰炸，不隐藏关键信息）。

---

## 1) 现状盘点（为了避免“凭空设计一套不适配实现”）

当前前端栈与样式来源（我们要在其上做统一）：

- Tailwind v4（CSS 变量主题）：`src/index.css:1`
- shadcn（new-york 风格，cssVariables=true）：`components.json:1`
- Base UI（无样式 Headless primitives）：`@base-ui/react/*`
- 现有页面大量使用“手写 tokens”：`--paper / --ink / --line`（例如 `src/routes/index.tsx:1`）
- 同时也存在 shadcn 的语义 tokens：`--background / --foreground / --card / --border ...`（`src/index.css:1`）

**结论**：Design System 必须同时定义：

1) **语义 tokens（推荐 / 新代码默认）**  
2) **兼容 tokens（现有页面在用 / 逐步迁移）**

---

## 2) Design Tokens（颜色 / 排版 / 尺寸 / 动效）

> Source of truth：`src/index.css:1`  
> 规则：业务代码里尽量不要直接写色值；优先用语义 tokens（或 Tailwind 的语义 class）。

### 2.1 颜色（语义 tokens：推荐）

这些 tokens 已在 `src/index.css` 中定义，后续设计/实现统一按语义使用：

- **Canvas / Surface**
  - `--background`：主背景（用于容器背景）
  - `--card`：卡片/面板背景（用于 Frame/Panel）
  - `--popover`：浮层背景（Select/Popover/Menu）
- **Text**
  - `--foreground`：主文本
  - `--muted-foreground`：次要文本/说明
- **Borders**
  - `--border`：通用边框
  - `--input`：输入框边框（比 border 更“可交互”）
- **Actions**
  - `--primary / --primary-foreground`：主按钮（建议保持“中性主色”，不做强品牌色）
  - `--secondary / --secondary-foreground`：次按钮/轻按钮背景
  - `--accent`：hover/pressed 的轻底色（不是品牌色）
  - `--destructive / --destructive-foreground`：危险操作
- **Status**
  - `--info / --info-foreground`
  - `--success / --success-foreground`
  - `--warning / --warning-foreground`
- **Focus**
  - `--ring`：焦点 ring 颜色（键盘可达性）

> Tailwind 对应语义 class：  
> `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `ring-ring` 等（见 `src/index.css:83` 的 `@theme inline`）。

### 2.2 颜色（兼容 tokens：现有页面在用）

现有页面大量使用以下 tokens（来自 `src/index.css:5`）：

- `--paper / --paper-2`：页面底色、浅底色
- `--ink / --ink-2 / --ink-3`：文本主/次/弱
- `--line`：分割线

v0.1 的策略：

- **允许继续用在旧页面上**（不强行大改）。
- **新页面优先用语义 tokens**；如果要做“纸张感”背景，才使用 `--paper`。
- 后续如果要启用暗色模式，需要补齐 `.dark` 下这些兼容 tokens 的值（目前只有语义 tokens 有 dark override）。

### 2.3 圆角（Radius）

统一来源：`src/index.css:13` + `@theme inline`

- `--radius` 为基准（当前约 10px）
- 建议用法：
  - 控件（按钮/输入）：`rounded-lg`（或 `rounded-md` 用在更紧凑场景）
  - 卡片/面板：`rounded-xl`
  - 大对话框/大容器：`rounded-2xl`

### 2.4 阴影与边界（Elevation）

桌面应用优先用“边界”而不是厚阴影：

- 默认：**1px border + 轻微 shadow**（例如 `shadow-xs/5`、`shadow-sm/5`）
- 禁止：大范围高模糊阴影、发光、霓虹渐变、玻璃拟物过强

### 2.5 间距与密度（Spacing & Density）

我们需要 **高信息密度**，但仍保持可读性。建议定义 3 档密度：

- **Comfortable**：用于新手/展示型页面（MVP 不优先）
- **Compact（默认）**：大多数列表/表单/弹窗
- **Dense**：表格密集视图（例如任务历史、版本列表）

落地建议（按 Compact）：

- Toolbar 高度：`h-12 ~ h-14`
- 列表行高：`36~40px`
- 表格 cell padding：`p-2` 或 `p-2.5`（现有 Table 组件就是 `p-2.5`：`src/components/ui/table.tsx:74`）
- Section 间距：`16~24px`（避免网页式超大留白）

### 2.6 排版（Typography）

目标：可扫描、可对齐、少层级但层级明确。

- 页面标题（H1）：`text-xl/2xl + font-semibold`
- 区块标题（H2）：`text-base/lg + font-semibold`
- 正文：`text-sm` 为主
- 辅助信息/元数据：`text-xs` + `text-muted-foreground`
- 表格表头：`text-xs/sm` + `text-muted-foreground`（`TableHead` 已如此：`src/components/ui/table.tsx:59`）

> 注意：当前 UI 组件中使用了 `font-heading`（例如 `src/components/ui/dialog.tsx:139`），但项目中尚未显式定义该 font family。  
> v0.1 建议：先不引入复杂字体体系，统一使用系统字体栈（已在 `src/index.css:57`）。

### 2.7 图标（Iconography）

使用 `lucide-react`，建议统一：

- 常规：16px（按钮/列表项）
- Toolbar：18px
- 空状态/占位：24~32px（但保持低对比度）
- 文本旁图标：与文字 baseline 对齐，避免“图标比文字抢眼”

### 2.8 动效（Motion）

原则：短、轻、可忽略。

- Hover/pressed：100–150ms
- Drawer/Dialog：160–220ms
- Loading：用 Skeleton / spinner，但避免大面积动效
- 尊重系统“减少动态效果”（后续可加）

---

## 3) 核心组件规范（v0.1）

> 组件优先复用 `src/components/ui/*`（shadcn/Base UI 封装）。  
> 业务组件放 `src/components/*`，路由页放 `src/routes/*`。

### 3.1 Buttons

对应实现：`src/components/ui/button.tsx:1`

- `variant=default`：主操作（默认中性主色）
- `variant=secondary`：次要操作（轻底色）
- `variant=ghost`：工具按钮/表格行内操作
- `variant=destructive`：危险操作（删除/清空）
- 默认 size：`default`（高度约 32–36）
- 规则：
  - 同一界面“主按钮”最多一个
  - 破坏性按钮不与主按钮并列为默认焦点

### 3.2 Inputs / Select / Field

建议用 `Field` 体系组织 label/description/error：

- `Field`：`src/components/ui/field.tsx:1`
- 输入框：`src/components/ui/input.tsx`（存在）
- Select：`src/components/ui/select.tsx`（存在）

规则：

- label 简短（名词为主），description 用于补充约束/成本/副作用
- error 文案必须可行动（告诉用户怎么修）

### 3.3 Table（列表的“默认形态”）

对应实现：`src/components/ui/table.tsx:1`

规则：

- Desktop MVP 的“项目列表/任务历史/版本列表”优先用 table（比卡片网格更高密度）。
- 行 hover 轻微即可（`hover:bg-muted/72`），选中态必须清晰但不刺眼。
- 列对齐：数字/计数右对齐；时间右对齐或窄列；状态用短 badge/dot。

### 3.4 Empty / Loading / Error

- Empty：`src/components/ui/empty.tsx:1`  
  规则：空态文案简短，主要行动 1 个，次行动可选。
- Loading：Skeleton 优先（`src/components/ui/skeleton.tsx`），不要全屏 spinner。
- Error：默认内联（卡片内），只在“无法继续工作”时才升为对话框。

### 3.5 Dialog / Sheet（确认与抽屉）

对应实现：`src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx`

- Dialog 用于：破坏性确认、首次授权、关键配置
- Sheet 用于：任务队列/版本抽屉/上下文面板
- 规则：
  - Esc 必须可关闭（除非正在执行不可中断操作）
  - 破坏性操作：默认焦点在 Cancel
  - 描述中明确“不可撤销/影响范围/自动回退规则”（对齐 ADR）

### 3.6 Toast（轻反馈）

对应实现：`src/components/ui/toast.tsx`

- 成功/已保存：toast
- 失败：优先保留在任务历史里，同时 toast 一句提示“可重试/查看详情”

---

## 4) 布局规范（桌面，不要网页感）

v0.1 推荐布局（对齐我们之前的 wireframe 方向）：

- 顶部：全局 Toolbar（Cmd+K 搜索、Tasks、Settings）
- 左侧：Navigation Sidebar（Projects / Assets / Settings）
- 中间：主内容（表格/表单/流程）
- 右侧：Context Panel（可选，用于版本、摘要等）

规则：

- 避免 `max-w-*` 把内容“缩成网页居中”，除非是长文阅读视图。
- 默认使用全高布局（`min-h-screen` + 固定区域滚动），不要整页滚动导致工具栏离开视野。

---

## 5) 文案与信息表达（极简，但不“没信息”）

- 标签：短、明确、名词化（例如 “Auto Previews” 而不是 “Let AI generate...”）
- 提示：放在靠近控件的位置（description / helper text），不要做“新手引导弹层”
- 成本/空间：用轻量的 secondary text 提示（例如 “Est. 420MB”）
- 状态：用“短词 + 颜色/图标”组合，但颜色不是唯一信息（必须同时有文本）

---

## 6) 决策清单（需要你拍板的 3 件事）

为了把 Design System 固定下来，建议你选定（并把代价讲清楚）：

### 6.1 默认主题（推荐：Follow system + 可手动覆盖）

**推荐选择**：`Follow system`（跟随系统）+ 在 Settings 里提供手动覆盖（Light / Dark / System）。

- 为什么推荐：
  - 桌面应用的“原生感”很大一部分来自于**尊重系统偏好**（尤其是暗色）。
  - 摄影工作室/后期场景里暗色更常见；跟随系统能避免你强行押注某一套。
- 代价是什么（你需要接受的成本）：
  - 需要同时维护 Light/Dark 两套可读性（表格/分割线/hover/选中态都要跑一遍）。
  - 现有页面在用的 `--paper/--ink/--line` 需要补齐 `.dark` 映射，否则暗色会“半黑半白”。

> 如果你希望 **MVP 极简交付**、先只做一套：我会备选推荐 `Dark`（更贴近摄影工具生态），但那会牺牲“系统一致性”。

### 6.2 主色策略（推荐：中性主按钮 + 小面积强调色）

**推荐选择**：主按钮保持 **中性（黑/白系）**，把颜色用于“强调”而不是“涂满界面”。

- 为什么推荐：
  - 你的风格目标是“极简 + 信息密度高”，品牌色大面积铺开会让界面显得躁、像 SaaS。
  - 在高密度表格里，颜色应该服务于**状态/风险**（info/success/warning/destructive），而不是按钮到处抢注意力。
- 代价是什么：
  - “一眼品牌感”会弱一些（这通常是桌面工具类产品可接受的取舍）。
  - 需要你在 Logo/启动页/少数关键节点上做品牌表达（而不是按钮颜色）。

### 6.3 密度默认档（推荐：Compact + 少数视图支持 Dense）

**推荐选择**：默认 `Compact`，并为少数“高频列表”提供 `Dense` 变体（任务历史、版本列表、资源列表）。

- 为什么推荐：
  - Compact 能兼顾可读性与效率，适合绝大多数桌面业务页面。
  - Dense 只在确实需要“多行多列 + 快扫”的地方启用，避免全局变得压抑。
- 代价是什么：
  - 需要维护两套 spacing（尤其是 Table row height / cell padding / toolbar height）。
  - 组件要有明确的 density API（例如 `size`/`density`），否则会逐页手搓。

你确定后，我会把这些选择写回 `src/index.css` tokens 的“推荐值”里，并补齐暗色模式下 `--paper/--ink/--line` 的映射方案，保证旧页面不崩。

---

## 7) 工程落地状态（截至 2026-02-01）

> 这部分是“设计系统 → 代码”的映射记录，避免规范写完没人用。

- 主题基础设施（默认跟随系统）：`index.html:1` + `src/lib/theme.ts:1` + `src/main.tsx:1`
- 兼容 tokens 的暗色映射（`--paper/--ink/--line`）：`src/index.css:1`
- 桌面 App Shell（左侧导航 + 顶栏 + 主内容）：`src/components/layout/AppShell.tsx:1` + `src/routes/__root.tsx:1`
