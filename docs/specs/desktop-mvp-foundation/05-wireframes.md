# Desktop MVP Foundation：Low-fi Wireframes（ASCII）

> 说明：
> - 本文只画 **Phase A（MVP）** 的关键界面与弹窗。
> - 为了保证等宽对齐，所有 wireframe 的 UI 文案均使用 **English labels**。
> - 交互护栏已对齐 ADR：自动化优先（风险分级）、预览图首次授权（封面+3）、可删任意版本并自动回退、任务完整历史与重试。

---

## 0) App Shell（Global Layout）

```text
+----------------------------------------------------------------------------------+
| Shooting Planner                          [Cmd+K Search]   Tasks(2)   Settings  |
+-------------------+------------------------------------------+-------------------+
| NAV               | MAIN                                     | CONTEXT PANEL     |
| ----------------- | ---------------------------------------- | ----------------- |
| Projects          | (Route content)                          | (Route-specific)  |
|  - All            |                                          | e.g. Versions     |
|  - Recent         |                                          | or Summary        |
|  + New Project    |                                          |                   |
|                   |                                          |                   |
| Assets            |                                          |                   |
|  - Scenes         |                                          |                   |
|  - Props (later)  |                                          |                   |
|  - Outfits (later)|                                          |                   |
|  - Prompts (later)|                                          |                   |
|                   |                                          |                   |
| Settings          |                                          |                   |
+-------------------+------------------------------------------+-------------------+
```

---

## 1) First Run Empty State（No Assets / No Projects）

```text
+----------------------------------------------------------------------------------+
| Welcome                                                                           |
+----------------------------------------------------------------------------------+
| No assets yet. Create your first Scene to start generating plans.                 |
|                                                                                  |
| [Create first Scene]                 [New Project (add assets later)]             |
|                                                                                  |
| Tip: AI features require an AI Provider (configure in Settings).                 |
+----------------------------------------------------------------------------------+
```

---

## 2) Projects List

```text
+----------------------------------------------------------------------------------+
| Projects                                                                    +New |
+----------------------------------------------------------------------------------+
| Search: [....................]   Status: [All v]   Sort: [Updated v]             |
+----------------------------------------------------------------------------------+
| [ ] Project A                         Draft        Updated: 02/01 14:20          |
|     Scene: Scene #12                  Tasks: none                                |
|----------------------------------------------------------------------------------|
| [ ] Project B                         Generated    Updated: 01/31 21:08          |
|     Plan: v3 (current)                Preview: 4/4                               |
|----------------------------------------------------------------------------------|
| [ ] Project C                         Configured   Updated: 01/30 09:12          |
|     Last error: image-generation 401   [Open]                                    |
+----------------------------------------------------------------------------------+
```

---

## 3) Project Detail（Fixed Steps）

### 3.1 Step 1: Select Assets（Phase A: Scenes only）

```text
+----------------------------------------------------------------------------------+
| Project: Project A                         Status: Draft        Plan: none       |
+----------------------------------------------------------------------------------+
| Steps:  [1 Assets]*   [2 Generate]   [3 Plan]                                    |
+----------------------------------------------------------------------------------+
| Scene                                                                  [Change] |
| Search scenes: [......................]                                          |
|                                                                                  |
|  [Scene Card]  [Scene Card]  [Scene Card]  [Scene Card]                          |
|  [Scene Card]  [Scene Card]  [Scene Card]  [Scene Card]                          |
|                                                                                  |
| Selected: Scene #12                                                              |
|                                                                                  |
|                                                            [Next: Generate >]   |
+----------------------------------------------------------------------------------+
```

### 3.2 Step 2: Generate Plan（Prompt preview）

```text
+----------------------------------------------------------------------------------+
| Project: Project A                         Status: Configured   Plan: none       |
+----------------------------------------------------------------------------------+
| Steps:  [1 Assets]   [2 Generate]*   [3 Plan]                                    |
+----------------------------------------------------------------------------------+
| Prompt Preview (read-only)  [Edit custom prompt v]                               |
|----------------------------------------------------------------------------------|
| (collapsed by default; expands to show the exact prompt text)                    |
|                                                                                  |
| [Generate Plan]                                                                  |
|                                                                                  |
| If disabled: "No AI provider configured"  [Go to Settings]                       |
+----------------------------------------------------------------------------------+
```

---

## 4) Plan Result（Scenes + Preview + Image Studio Lite）

```text
+----------------------------------------------------------------------------------+
| Plan: v3 (current)   Created: 02/01 14:10   Preview: 1/4                         |
| [Plan Versions v]   [Generate Previews] [Cancel] [Cleanup Versions]              |
+----------------------------------------------------------------------------------+
| Scene 1: <Location>                                                       [..]  |
| +----------------------+--------------------------------------------------------|
| | Preview Image        | Description: ...                                       |
| | (or placeholder)     | Shots: ...                                             |
| |                      | Lighting: ...                                          |
| +----------------------+--------------------------------------------------------|
| | Image Studio (Lite)  |  [Generate] [Regenerate] [Re-edit]                     |
| | Prompt ▼             |  Effective Prompt (editable)                           |
| | Versions ▼           |  (collapsed by default)                                |
| +----------------------+--------------------------------------------------------|
|                                                                                  |
| Scene 2: ...                                                                     |
| Scene 3: ...                                                                     |
| Scene 4: ...                                                                     |
+----------------------------------------------------------------------------------+
```

---

## 5) Image Studio Lite（Expanded）

```text
+----------------------------------------------------------------------------------+
| Image Studio (Lite)  Status: idle / running / failed / done                      |
+----------------------------------------------------------------------------------+
| Current Image: [thumbnail....................................................]   |
| Actions: [Generate] [Regenerate] [Re-edit]                                        |
|----------------------------------------------------------------------------------|
| Effective Prompt (server-echo, editable)                                          |
| +-------------------------------------------------------------------------------+|
| | [ multi-line prompt text...                                                  ]|
| +-------------------------------------------------------------------------------+|
| [Copy] [Reset to server echo]                                                     |
|----------------------------------------------------------------------------------|
| Versions (8)   Current: v8                                                        |
| [v8*][v7][v6][v5][v4][v3][v2][v1]                                                 |
| [Set as current]   [Delete...]  (Deleting current auto-fallback to latest)       |
+----------------------------------------------------------------------------------+
```

---

## 6) Assets / Scenes

### 6.1 Scenes List

```text
+----------------------------------------------------------------------------------+
| Assets / Scenes                                                             +New |
+----------------------------------------------------------------------------------+
| Search: [....................]   Tags: [All v]   Sort: [Updated v]               |
+----------------------------------------------------------------------------------+
| [thumb] Scene A     tags: warm, indoor     Cover: yes     Updated: 02/01 10:01    |
| [thumb] Scene B     tags: cool, outdoor    Cover: no      Updated: 01/30 18:22    |
+----------------------------------------------------------------------------------+
```

### 6.2 Scene Detail（Form + Image Studio Lite）

```text
+----------------------------------------------------------------------------------+
| Scene: Scene A                                                     [Save] [..]  |
+----------------------------------------------------------------------------------+
| Name:        [.................................]                                 |
| Tags:        [tag][tag][+]                         [AI Draft Tags/Desc]          |
| Description: [.........................................................]         |
| Lighting:    [.................................]                                 |
| Style:       [tone v] [mood v] [era v]                                           |
+----------------------------------------------------------------------------------+
| Cover Image (Image Studio Lite)                                                  |
| [thumbnail.................................................................]    |
| [Generate] [Regenerate] [Re-edit]                                                |
| Prompt ▼     Versions ▼                                                          |
+----------------------------------------------------------------------------------+
```

---

## 7) Tasks Drawer（Full History + Retry）

```text
+----------------------------------------------------------------------------------+
| Tasks                                                                      [X]  |
+----------------------------------------------------------------------------------+
| Filter: [In Progress] [Failed] [All]    Search: [......................]        |
+----------------------------------------------------------------------------------+
| running  plan-generation    Project A     12%      started 14:20   [Cancel]      |
| failed   image-generation   Project A     401      14:19           [Retry] [..]  |
| done     image-generation   Scene A       ok       14:18           [Open]        |
| done     plan-generation    Project B     ok       01/31 21:08      [Open]       |
| ... (history retained; list is virtualized/paged)                                 |
+----------------------------------------------------------------------------------+
| Task Details (when selected)                                                     |
| Type / Related / Input (JSON) / Output / Error (copy) / Timeline                 |
+----------------------------------------------------------------------------------+
```

---

## 8) Settings（Phase A）

### 8.1 Settings Shell（Nav + Content）

```text
+----------------------------------------------------------------------------------+
| Settings                                                                          |
+----------------------+-----------------------------------------------------------+
| SECTIONS             | (Content)                                                 |
| -------------------  | -------------------------------------------------------- |
| AI Providers *       |                                                          |
| Previews             |                                                          |
| Storage              |                                                          |
| About                |                                                          |
+----------------------+-----------------------------------------------------------+
```

### 8.2 Settings / AI Providers（List + Details）

```text
+----------------------------------------------------------------------------------+
| Settings / AI Providers                                                [Add +]  |
+----------------------+-----------------------------------------------------------+
| SECTIONS             | Providers                                                 |
| -------------------  | -------------------------------------------------------- |
| AI Providers *       | Studio OpenAI-compatible           (Default)   [Edit]     |
| Previews             | Gemini (Personal)                               [Edit]     |
| Storage              | Local (Disabled)                                [Edit]     |
| About                |                                                          |
+----------------------+-----------------------------------------------------------+
| Provider Details                                                               |
| Name: Studio OpenAI-compatible                                                 |
| Format: OpenAI-compatible                                                      |
| Base URL: https://...                                                          |
| Text model: gpt-...      Image model: gpt-image-...                            |
| Capabilities:  [Text ✓] [Image ✓]                                              |
| [Test Connection]  Last test: OK (02/01 14:30)                                 |
| [Set as Default] [Delete...]                                                   |
+----------------------------------------------------------------------------------+
```

### 8.3 Provider Editor（Edit/Create）

```text
+----------------------------------------------------------------------------------+
| Edit Provider                                                        [Save] [X] |
+----------------------------------------------------------------------------------+
| Name:      [.................................................]                   |
| Format:    (o) Gemini   ( ) OpenAI-compatible                                   |
| Base URL:  [.................................................]                   |
| API Key:   [***************.........................] [Reveal] [Paste]          |
|----------------------------------------------------------------------------------|
| Models                                                                          |
| [Fetch models]                                                                  |
| Text Model:  [dropdown v]       Image Model: [dropdown v]                       |
| Capability check:  Text ✓   Image ✓ / (inline warning if unsupported)           |
|----------------------------------------------------------------------------------|
| Actions                                                                         |
| [Test Connection]   Result: OK / 401 / timeout...   [Copy error]                |
| [Set as Default]    [Delete Provider...]                                        |
+----------------------------------------------------------------------------------+
```

### 8.4 Settings / Previews（Auto Preview Policy）

```text
+----------------------------------------------------------------------------------+
| Settings / Previews                                                             |
+----------------------+-----------------------------------------------------------+
| SECTIONS             | Auto Preview Images                                       |
| -------------------  | -------------------------------------------------------- |
| AI Providers         | After plan generation, auto-generate previews:            |
| Previews *           |                                                          |
| Storage              | (o) Off                                                   |
| About                | ( ) Cover + 3 extra  (total up to 4)                      |
|                      | ( ) All scenes                                            |
|                      |                                                          |
|                      | This may consume credits/cost and local disk space.       |
|                      | [Reset "first consent"]  (show consent modal next time)   |
+----------------------+-----------------------------------------------------------+
```

### 8.5 Settings / Storage（Data Dir + Usage + Cleanup）

```text
+----------------------------------------------------------------------------------+
| Settings / Storage                                                              |
+----------------------+-----------------------------------------------------------+
| SECTIONS             | Local Data                                                |
| -------------------  | -------------------------------------------------------- |
| AI Providers         | Data directory: /Users/.../ShootingPlanner               |
| Previews             | [Change...] [Open Folder]                                |
| Storage *            |                                                          |
| About                | Usage (estimated):                                        |
|                      |  - Uploads / images:   1.2 GB                             |
|                      |  - Database:           12 MB                              |
|                      |  - Cache:              80 MB                              |
|                      |                                                          |
|                      | [Recalculate]                                             |
|                      | [Cleanup Versions...]                                     |
+----------------------+-----------------------------------------------------------+
```

---

## 9) Versions / Cleanup（Project-level）

### 9.1 Plan Versions Drawer

```text
+----------------------------------------------------------------------------------+
| Plan Versions (Project A)                                                [X]    |
+----------------------------------------------------------------------------------+
| Current: v3     Total: 5                                                        |
|----------------------------------------------------------------------------------|
| v5  02/01 16:10   previews: 4/4   source: regenerate   [Set current] [Delete...]|
| v4  02/01 15:40   previews: 0/4   source: generate     [Set current] [Delete...]|
| v3* 02/01 14:10   previews: 4/4   source: generate     [Current]     [Delete...]|
| v2  02/01 13:40   previews: 0/4   source: generate     [Set current] [Delete...]|
| v1  02/01 13:10   previews: 0/4   source: generate     [Set current] [Delete...]|
|----------------------------------------------------------------------------------|
| [Cleanup...]                                                                    |
+----------------------------------------------------------------------------------+
```

### 9.2 Cleanup Versions Dialog（Keep Current by default）

```text
+----------------------------------------------------------------------------------+
| Cleanup Versions (Project A)                                             [X]    |
+----------------------------------------------------------------------------------+
| Keep plan versions:                                                             |
|   (o) Current only                                                               |
|   ( ) Keep last [ 3 ] versions                                                   |
|                                                                                |
| Clean preview images:                                                           |
|   [x] Delete previews that belong to deleted plan versions                        |
|                                                                                |
| Clean image edit versions (per scene):                                           |
|   (o) Keep current only                                                          |
|   ( ) Keep last [ 2 ]                                                            |
|                                                                                |
|----------------------------------------------------------------------------------|
| Estimate (best effort):                                                          |
|  - Plan versions to delete: 4                                                    |
|  - Images to delete:        12                                                   |
|  - Space to free:           ~420 MB                                              |
|----------------------------------------------------------------------------------|
| Notes: irreversible. Deleting current version will auto-fallback to latest.      |
|                                                                                |
|                                              [Cancel] [Clean up]                |
+----------------------------------------------------------------------------------+
```

---

## 10) Modals（Critical Guardrails）

### 10.1 First Consent（Auto Preview Images）

```text
+----------------------------------------------------------------------------------+
| Auto Preview Images (First time)                                                 |
+----------------------------------------------------------------------------------+
| After generating a plan, the app can auto-generate preview images.               |
| This may consume credits/cost and local disk space.                              |
|                                                                                  |
| This run would generate: Cover + 3 extra (total 4)                               |
| Model: <imageModel>                                                              |
|                                                                                  |
| ( ) Off                                                                          |
| ( ) Cover + 3 extra                                                              |
| ( ) All scenes                                                                   |
|                                                                                  |
| [x] Remember my choice                                                           |
|                                                                                  |
|                                              [Cancel]  [Continue]               |
| Hint: change later in Settings > Previews                                        |
+----------------------------------------------------------------------------------+
```

### 10.2 Delete Version Confirm（Delete-any + Auto fallback）

```text
+----------------------------------------------------------------------------------+
| Delete Version                                                                   |
+----------------------------------------------------------------------------------+
| You are about to delete:                                                         |
|  - DB record + local file (irreversible)                                         |
|                                                                                  |
| If this is the current version:                                                  |
|  - the app will auto-switch to the latest remaining version                      |
|  - if none remains, the UI will show an empty state                              |
|                                                                                  |
|                                              [Cancel]  [Delete]                 |
+----------------------------------------------------------------------------------+
```

