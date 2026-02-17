# SQL and Trace Patterns

## 0) 先做 ID 与数据源对齐

- 本项目 `ChatID` 等同 `sessionId`（`agent_sessions.id`）。
- 数据库路径：`DATA_DIR/shooting-planner.db`；未设置 `DATA_DIR` 时为 `sidecar/data/shooting-planner.db`。

```bash
# 打印当前命令上下文下的 DB 文件路径
pnpm -C sidecar exec node -e "const path=require('node:path');const dir=process.env.DATA_DIR||path.join(process.cwd(),'data');console.log(path.join(dir,'shooting-planner.db'));"
```

```bash
# 用 ChatID(=sessionId) 验证会话是否存在
SESSION_ID=<sessionId> pnpm -C sidecar exec node -e "const path=require('node:path');const Database=require('better-sqlite3');const dir=process.env.DATA_DIR||path.join(process.cwd(),'data');const db=new Database(path.join(dir,'shooting-planner.db'),{readonly:true});const row=db.prepare('SELECT id,title,status,engine,updated_at FROM agent_sessions WHERE id=? LIMIT 1').get(process.env.SESSION_ID);console.log(row||null);db.close();"
```

```bash
# 会话存在时，先看它关联到哪些 trace
SESSION_ID=<sessionId> pnpm -C sidecar exec node -e "const path=require('node:path');const Database=require('better-sqlite3');const dir=process.env.DATA_DIR||path.join(process.cwd(),'data');const db=new Database(path.join(dir,'shooting-planner.db'),{readonly:true});const rows=db.prepare('SELECT trace_id AS traceId, COUNT(*) AS events, MIN(created_at) AS firstAt, MAX(created_at) AS lastAt FROM agent_trace_logs WHERE session_id=? GROUP BY trace_id ORDER BY lastAt DESC LIMIT 20').all(process.env.SESSION_ID);console.log(rows);db.close();"
```

## 1) CLI（首选）

```bash
pnpm -C sidecar agent:trace --session <sessionId>
pnpm -C sidecar agent:trace --trace <traceId>
pnpm -C sidecar agent:trace
```

## 2) Trace API

```bash
# 按 session 拉 trace（不知道 traceId 时先用这个）
curl "http://localhost:3001/api/agent/traces?sessionId=<sessionId>&limit=200"

# 按 trace 查询原始 trace 行
curl "http://localhost:3001/api/agent/traces?traceId=<traceId>&limit=200"

# 聚合时间线（含断点诊断）
curl "http://localhost:3001/api/agent/traces/<traceId>/timeline"

# provider wire 摘要 / tail
curl "http://localhost:3001/api/agent/traces/<traceId>/wire?tail=80"
```

## 3) Trace SQL（必要时）

```sql
-- 先验证 session 是否存在
SELECT id, title, engine, status, created_at, updated_at, last_turn_at
FROM agent_sessions
WHERE id = ?;
```

```sql
-- 用 session 反查最近 trace
SELECT trace_id, COUNT(*) AS events,
       MIN(created_at) AS first_at, MAX(created_at) AS last_at
FROM agent_trace_logs
WHERE session_id = ?
GROUP BY trace_id
ORDER BY last_at DESC
LIMIT 20;
```

```sql
-- 按 trace 回放全链路
SELECT seq, trace_id, request_id, session_id, turn_id, client_message_id,
       channel, event, level, ok, data_json, created_at
FROM agent_trace_logs
WHERE trace_id = ?
ORDER BY seq ASC;
```

## 4) 业务表 SQL（补充）

```sql
SELECT id, entry_type, payload_json, created_at
FROM agent_entries
WHERE session_id = ?
ORDER BY created_at ASC, id ASC;
```

```sql
SELECT seq, turn_id, event_type, payload_json, created_at
FROM agent_events
WHERE session_id = ?
ORDER BY seq ASC;
```

```sql
SELECT id, kind, ref_id, content_json, created_at
FROM agent_outputs
WHERE session_id = ?
ORDER BY created_at ASC, id ASC;
```

## 5) Failure Signatures（Trace v1）

- `ui.submit_click` 存在、`api.request.start` 缺失：前端未发出或请求未达 Sidecar。
- `api.request.start` 存在、`api.turn.accepted` 缺失：被校验拒绝或路由提前失败。
- `runtime.turn.start` 存在、`provider.request` 缺失：模型调用未触发。
- `provider.request` 存在、`runtime.assistant.completed` 缺失：provider/流中断。
- `runtime.assistant.completed(stop,textLen=0,totalTokens=0)`：空回复完成。
- `sse.open` 存在、`render.assistant_message_commit` 缺失：前端渲染链路异常。

## 6) 无命中时的判定矩阵

- `agent_sessions` 查不到 `sessionId`：优先判断是否连错环境/数据库文件，其次才是 ID 填错。
- `agent_sessions` 能查到但 `agent_trace_logs` 全空：优先排查 trace 开关、采样率、日志保留时间，再确认请求是否真的经过 `/api/agent/*`。
- `agent_trace_logs` 有 `api.request.start` 但无 `api.turn.accepted`：优先排查 payload/session 状态校验失败。
- `api.turn.accepted` 后无 `runtime.turn.start`：优先排查 runtime gate、runtime 初始化异常。
- `runtime.turn.start` 后无 `provider.request`：优先排查模型路由、provider 配置和凭据。
