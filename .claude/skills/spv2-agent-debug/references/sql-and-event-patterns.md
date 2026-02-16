# SQL and Trace Patterns

## 1) CLI（首选）

```bash
pnpm -C sidecar agent:trace --trace <traceId>
pnpm -C sidecar agent:trace --session <sessionId>
pnpm -C sidecar agent:trace
```

## 2) Trace API

```bash
# 查询 trace 行（按条件过滤）
curl "http://localhost:3001/api/agent/traces?traceId=<traceId>&limit=200"

# 聚合时间线（含断点诊断）
curl "http://localhost:3001/api/agent/traces/<traceId>/timeline"

# provider wire 摘要 / tail
curl "http://localhost:3001/api/agent/traces/<traceId>/wire?tail=80"
```

## 3) Trace SQL（必要时）

```sql
-- 按 trace 回放全链路
SELECT seq, trace_id, request_id, session_id, turn_id, client_message_id,
       channel, event, level, ok, data_json, created_at
FROM agent_trace_logs
WHERE trace_id = ?
ORDER BY seq ASC;
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

## 4) 业务表 SQL（补充）

```sql
SELECT id, title, engine, status, created_at, updated_at, last_turn_at
FROM agent_sessions
ORDER BY created_at DESC
LIMIT 1;
```

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
