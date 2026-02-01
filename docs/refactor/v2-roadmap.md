# v2 重构路线图：资产驱动 + 图文生图

## 目标

将产品从"聊天式 AI 生成"重构为"资产驱动的项目管理"模式，解决当前 visualPrompt 生成的图片不像摄影工作室风格的问题。

## 核心变化

| 维度 | 现在 | 目标 |
|-----|------|------|
| 交互形态 | 聊天式输入主题 | 项目卡片 + 资产组合 |
| 生成方式 | 纯文生图 | 图+文生图 |
| 数据基础 | AI 每次从零创造 | 基于工作室真实资产 |
| 页面结构 | 单路由 | 多路由（项目/资产/设置）|

## 分阶段任务

### Phase 0：基础设施 ✅

**目标**：为新架构搭建数据层和路由框架

- [x] **P0.1** 数据库 schema 重构
  - **删除 `plans` 表**（无历史数据需迁移）
  - 新增 `projects` 表
  - 新增 `scene_assets` 表
  - 文件：`sidecar/src/db/schema.ts`

- [x] **P0.2** 图片上传 API
  - 实现 `/api/upload` 接口
  - 自动压缩（sharp）
  - 本地文件存储
  - 文件：`sidecar/src/routes/upload.ts`

- [x] **P0.3** 路由框架搭建
  - 更新根布局和导航
  - 创建空白路由页面骨架
  - 文件：`src/routes/__root.tsx` 及各路由文件

### Phase 1：场景资产管理 ✅

**目标**：实现场景资产的 CRUD 和 UI

- [x] **P1.1** 场景资产 API
  - CRUD 接口
  - 文件：`sidecar/src/routes/assets.ts`

- [x] **P1.2** 场景资产管理页面
  - 列表展示
  - 新建/编辑表单
  - 图片上传组件
  - 文件：`src/routes/assets.scenes.tsx`

- [x] **P1.3** 场景资产类型定义
  - 文件：`src/types/scene-asset.ts`

### Phase 2：项目管理 ✅

**目标**：实现项目的 CRUD 和基础 UI

- [x] **P2.1** 项目 API
  - `/api/projects` CRUD（删除旧的 `/api/plans`）
  - 文件：`sidecar/src/routes/projects.ts`

- [x] **P2.2** 项目列表页
  - 卡片列表
  - 新建项目
  - 文件：`src/routes/index.tsx`（替换现有）

- [x] **P2.3** 项目详情页
  - 配置汇总视图
  - 各资产区块
  - 文件：`src/routes/projects.$id.tsx`

- [x] **P2.4** 场景配置页
  - 场景选择器（**MVP 单选**，后续可扩展多选）
  - 已选预览
  - 文件：`src/routes/projects.$id.scenes.tsx`

### Phase 3：图+文生图 ✅

**目标**：改造生成流程，支持图片作为输入

- [x] **P3.1** AI 接口改造
  - 支持 referenceImages 参数
  - 支持生成参数（尺寸/比例）
  - 文件：`sidecar/src/routes/ai.ts`

- [x] **P3.2** 前端 AI 客户端改造
  - 文件：`src/lib/ai-client.ts`

- [x] **P3.3** 预案生成流程
  - 基于所选资产构建 prompt
  - 项目 API 新增 /generate 端点
  - 结果页展示分镜结构
  - 文件：`sidecar/src/routes/projects.ts`、`src/routes/projects.$id.result.tsx`

### Phase 4：结果展示与导出 ⏳

**目标**：生成结果的展示和导出

- [ ] **P4.1** 生成结果页
  - 分镜结构展示
  - 参考图展示
  - 文件：`src/routes/projects.$id.result.tsx`

- [ ] **P4.2** PPT 导出适配
  - 适配新的数据结构
  - 文件：`src/lib/ppt-exporter.ts`

### Phase 5：迁移与清理 ⏳

**目标**：清理旧代码，迁移现有数据

- [ ] **P5.1** 设置页迁移
  - 从现有实现迁移
  - 文件：`src/routes/settings.tsx`

- [ ] **P5.2** 旧代码清理
  - 删除不再使用的组件和逻辑

- [ ] **P5.3** 文档更新
  - 更新 `docs/product/overview.md`
  - 更新 `docs/product/user-flows.md`
  - 更新 `docs/engineering/contracts.md`
  - 更新 `docs/engineering/api.md`

---

## 后续迭代（MVP 之后）

- [ ] 道具资产管理
- [ ] 服装资产管理（整合现有 OutfitInput）
- [ ] 拍摄主题/风格资产管理
- [ ] 拍摄参数配置页
- [ ] 多模型配置 UI
- [ ] 云端图片存储（Cloudflare R2）
- [ ] AI 推荐组合

---

## 关键决策

1. **交互形态**：任务卡片 + 配置面板（混合方案：主界面汇总，点击进入独立配置页）
2. **MVP 切入点**：场景资产优先
3. **图片存储**：先用本地文件系统
4. **GlobalStyle**：合并到资产中，不再独立设置
5. **图片上传**：自动压缩
6. **Projects 存储**：新建 projects 表（删除旧 plans 表，无历史数据需迁移）
7. **场景选择**：MVP 单选，后续可扩展多选
