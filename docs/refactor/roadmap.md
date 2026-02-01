# 重构路线图

所有阶段已完成。详见 `known-issues.md` 的修复记录。

## 已完成的里程碑

### 阶段 0：对齐"当前真相源" ✅
- 已在 `docs/engineering/contracts.md` 固化数据结构
- 核心路径（单主题生成 + PPT 导出）可用

### 阶段 1：消除双轨与重复实现 ✅
- 已统一 prompt/标题构建（删除重复的 `prompts.ts`）
- 已删除未使用模块（旧 `api.ts`）
- Provider 已统一为 Sidecar SQLite 单一入口

### 阶段 2：持久化策略定稿 ✅
- 预案历史：已迁移到 Sidecar SQLite
- Provider 配置：已迁移到 Sidecar SQLite
- 已添加 `data-migration.ts` 自动迁移旧 localStorage 数据

### 阶段 3：Tauri 运行方式闭环 ✅
- Sidecar 启动逻辑已添加（仅生产环境）
- 前端 API 路由通过 `api-config.ts` 动态处理
- 二进制命名与 Tauri 配置一致

### 阶段 4：体验与质量 ✅
- 已添加批量出图队列与取消机制
- 已添加 visualPrompt 自动保存（800ms 防抖）
- 已添加 Biome (lint/format) + Vitest (测试)

## 北极星原则（保持不变）

1. **输出可解释**：预案是结构化的（可展示、可导出、可编辑）
2. **成本可控**：图片生成默认手动触发，批量动作需确认
3. **契约稳定**：`Plan JSON`、`Provider`、`/api/ai/*` 边界优先稳定

## 下一步建议

- 增加更多单元测试覆盖
- 完善错误处理与用户反馈
- 考虑添加数据导出/导入功能
