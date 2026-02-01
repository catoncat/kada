# Stitch Prompts（MCP / High-fi）

> 目标：把 `05-wireframes.md` 的 ASCII 线框，喂给 Stitch 的 `generate_screen_from_text` 生成高保真屏幕设计。
>
> 说明：
> - 本产品是 **Desktop app（Tauri）**，不是网站。请避免网页式导航/浏览器感。
> - 风格：**极简 + 信息密度高**，避免教学式引导（no coachmarks / no step-by-step onboarding）。
> - 文案：尽量延续 wireframe 的 **English labels**，减少中文等宽对齐问题。

---

## 0) Pre-flight（安全 + 连接）

### 0.1 API Key（不要落盘 / 不要提交）

- 请用环境变量提供 Stitch API Key（不要写进仓库、不要写进任何 markdown）。
- 你之前把 key 贴到聊天里了：建议 **立即在 Stitch Settings 里 revoke/rotate**，再用新 key。

### 0.2 Codex CLI 已配置 stitch MCP server

当前 Codex 配置（不含密钥）在：`~/.codex/config.toml:40`

```toml
[mcp_servers.stitch]
url = "https://stitch.googleapis.com/mcp"
env_http_headers = { "X-Goog-Api-Key" = "STITCH_API_KEY" }
```

你只需要在启动 Codex 的同一个 shell 里设置：

```bash
export STITCH_API_KEY="***"
```

然后重新启动 Codex（确保它继承到了该 env）。

---

## 1) 建议的生成策略（先定基准，再批量）

1. 先用 `GEMINI_3_PRO` 生成 **1 个基准屏**（建议用 `Settings` 或 `App Shell`）。
2. 后续屏幕用 `GEMINI_3_FLASH`（更快）并在 prompt 里强调 “reuse the same visual language / components / typography / spacing tokens”.
3. 每个屏的 prompt 里都粘贴对应的 wireframe ASCII（从 `docs/specs/desktop-mvp-foundation/05-wireframes.md:1` 拷贝）。

---

## 2) Master Prompt（所有屏通用，建议先固定下来）

把下面这段作为每个屏 prompt 的开头（可复用）：

```text
You are designing a native desktop app UI (Tauri desktop), NOT a website.
Product: Shooting Planner (for photography studios) — local-first, offline-friendly.
Style: minimal, high information density, calm neutral palette, no tutorial overlays/coachmarks.
Use consistent components across screens: sidebar nav, top toolbar, content area, right context panel, drawers/modals.
Typography: clear hierarchy, compact spacing, strong alignment. Prefer subtle borders over heavy shadows.
States: include empty/loading/error patterns where relevant, but keep them unobtrusive.
Follow the wireframe layout strictly. Keep labels in English.
```

---

## 3) Screen Prompts（按 wireframes 逐屏生成）

> 用法：把对应屏幕的 ASCII wireframe 粘贴到 “WIREGRAPH” 位置。

### 3.1 App Shell（Global Layout）

Model: `GEMINI_3_PRO`

```text
[MASTER PROMPT]

Create the "App Shell" layout for a desktop app:
- Left sidebar navigation
- Top toolbar with global search, tasks indicator, settings entry
- Main content area
- Right context panel (route-specific)

WIREGRAPH:
<paste the ASCII block for "0) App Shell (Global Layout)">
```

### 3.2 First Run Empty State（No Assets / No Projects）

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design the "Welcome / First Run Empty State" screen.
Focus: clear primary actions, minimal copy, calm empty state illustration (optional, subtle).

WIREGRAPH:
<paste the ASCII block for "1) First Run Empty State">
```

### 3.3 Projects List

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design the "Projects List" screen:
- searchable list, filters (Status, Sort)
- compact rows, clear metadata
- "+New" primary action

WIREGRAPH:
<paste the ASCII block for "2) Projects List">
```

### 3.4 Project Detail（Fixed Steps）

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design the "Project Detail — Fixed Steps" screen.
This is a structured flow UI (step-based), but avoid onboarding/tutorial styling.
Emphasize: clarity, progress, and controllable actions.

WIREGRAPH:
<paste the ASCII block for "3) Project Detail (Fixed Steps)">
```

### 3.5 Plan Result（Scenes + Preview + Image Studio Lite）

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design the "Plan Result" screen:
- left: scenes list/cards
- main: plan content + preview images (cover + extra)
- include a lightweight "Image Studio" area for regeneration/edit loop

WIREGRAPH:
<paste the ASCII block for "4) Plan Result">
```

### 3.6 Image Studio Lite（Expanded）

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design the "Image Studio Lite (Expanded)" screen:
- prompt editor (editable final prompt)
- image preview area
- version history / regenerate controls (compact)
- keep it workflow-embedded, not chat-based

WIREGRAPH:
<paste the ASCII block for "5) Image Studio Lite (Expanded)">
```

### 3.7 Assets / Scenes

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design the "Assets > Scenes" management screen:
- scene list
- detail panel with images + metadata
- actions: add, edit, AI describe, AI edit (as a tool inside the UI)

WIREGRAPH:
<paste the ASCII block for "6) Assets / Scenes">
```

### 3.8 Tasks Drawer（Full History + Retry）

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design the "Tasks" drawer/panel:
- shows full task history
- includes failed tasks and retry as a new task
- status, timestamps, compact logs

WIREGRAPH:
<paste the ASCII block for "7) Tasks Drawer">
```

### 3.9 Settings（Phase A）

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design the "Settings (Phase A)" screen with sections:
- Providers (AI provider config)
- Previews (auto preview generation consent/defaults)
- Storage (local-first paths/usage)

WIREGRAPH:
<paste the ASCII block for "8) Settings (Phase A)">
```

### 3.10 Versions / Cleanup（Project-level）

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design the "Project Versions & Cleanup" screen:
- list of plan versions
- current version indicator
- cleanup options (keep last N, estimate)

WIREGRAPH:
<paste the ASCII block for "9) Versions / Cleanup (Project-level)">
```

### 3.11 Modal: First Consent（Auto Preview Images）

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design a critical modal: "Auto Preview Images (First time)".
It must feel safe, explicit about cost/disk, and offer three choices:
- Off
- Cover + 3 extra (total 4)
- All scenes
Include "Remember my choice".

WIREGRAPH:
<paste the ASCII block for "10.1 First Consent">
```

### 3.12 Modal: Delete Version Confirm（Delete-any + Auto fallback）

Model: `GEMINI_3_FLASH`

```text
[MASTER PROMPT]

Design a destructive confirmation modal: "Delete Version".
Must clearly state irreversible deletion and the auto-fallback behavior.

WIREGRAPH:
<paste the ASCII block for "10.2 Delete Version Confirm">
```

