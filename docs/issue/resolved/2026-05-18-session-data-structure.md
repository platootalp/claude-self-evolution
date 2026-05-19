# Issue: Session Data Structure 设计缺陷

**Severity**: P1 — 数据模型混乱，影响调试和可靠性
**Discovered**: 2026-05-18
**Status**: Open

## 问题描述

Session 目录的命名、日志格式和状态存储存在三类结构性问题。

---

## 问题 1：Session 目录命名混乱

### 现象

`sessions/` 目录下出现四种不同风格的目录名：

| 风格 | 示例 | 来源 |
|------|------|------|
| UUID | `051d2b84-2c20-4e1d-a73e-9c254e0b0c28` | Claude Code 传入的 `session_id` |
| 短 ID | `s1` | 手动测试或外部调用 |
| 时间戳 | `session-1779103877573` | `runtime.ts:49` 兜底生成 |
| 字面量 | `unknown` | `runtime.ts:58` 兜底默认值 |

### 根因

`runtime.ts` 中 session ID 的解析逻辑在不同 command 之间不一致：

```typescript
// session-start (line 49): 只检查 env，没有则生成时间戳
const sessionId = process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`;

// post-tool-use (line 58): 优先 stdin，其次 env，最后 "unknown"
const sessionId = input.session_id ?? process.env.SELF_EVOLUTION_SESSION_ID ?? "unknown";

// stop-gate (line 67): 同 post-tool-use
const sessionId = input.session_id ?? process.env.SELF_EVOLUTION_SESSION_ID ?? "unknown";
```

问题：
1. **`session-start` 不读 stdin**：如果 Claude Code 在 stdin JSON 中传 `session_id` 但没设 env var，`session-start` 会生成一个不同的 ID，导致同一个会话的日志分散到两个目录
2. **`"unknown"` 作为目录名**：所有无法获取 session_id 的 hook 调用都写入同一个 `unknown/` 目录，造成数据混淆
3. **无格式校验**：不验证 session ID 是否符合预期格式（UUID），导致任意字符串都能成为目录名

### 影响

- 同一会话的 `state.json` 和 `log.jsonl` 可能分散在不同目录
- `unknown/` 目录下堆积多个会话的混合数据
- `status` 命令输出的 sessions 列表难以阅读

---

## 问题 2：log.jsonl 格式问题

### 现象

`log.jsonl` 文件声称是 JSONL 格式，但存在以下问题：

1. **无文件头/元信息**：缺少 session 元数据（session_id、start_time 等），无法独立识别日志归属
2. **字段顺序不稳定**：`logger.ts:34` 使用 `{...kv, ts, level, event, session_id, pid}` 展开，`kv` 中的自定义字段可能覆盖标准字段
3. **`session_id` 可能是 `"unknown"`**：当 fallback 到 `"unknown"` 时，日志条目失去可追溯性

### 具体代码问题

```typescript
// logger.ts:33-41
const entry = {
  ...kv,              // ← 用户字段在前，可能被后续标准字段覆盖
  ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  level: eventLevel,
  event,
  session_id: sessionId,  // ← 总是覆盖 kv 中的 session_id
  pid: process.pid,
};
```

虽然标准字段放在后面可以覆盖 `kv` 中的同名字段（这是正确的），但 `kv` 中如果包含 `ts`、`level`、`event` 等字段，会被静默覆盖，可能造成困惑。

更关键的问题：**log.jsonl 没有记录完整的 session 生命周期事件**。对比 `state.json` 中有 `start_ts`、`end_ts`、`review_decision` 等结构化字段，`log.jsonl` 只是事件流，缺少汇总视图。

---

## 问题 3：根级 state.json 与 per-session state.json 职责重叠

### 现象

系统维护两套独立的状态存储，它们存储了相同的字段但从不同步：

| 位置 | 路径 | 存储内容 |
|------|------|----------|
| 根级 | `<pluginData>/state.json` | `{ sessions: Record<sid, {count, pending_review}>, jobs: Job[] }` |
| 会话级 | `<pluginData>/sessions/<sid>/state.json` | `SessionStateFull = {count, pending_review, start_ts, end_ts, review_decision, ...}` |

### 数据流分析

```
session-start  → initSessionState()    → per-session state.json ✅
post-tool-use  → incrementCount()      → root state.json ONLY ❌
stop-gate      → consumePending()      → root state.json ONLY ❌
               → addJob()              → root state.json ONLY ❌
log-decision   → updateStats()         → root stats.json ✅
               → updateSessionResult() → per-session state.json ✅
```

**`post-tool-use` 和 `stop-gate` 只操作根级 `state.json`，从不更新 per-session `state.json`。** 这意味着：

- per-session `state.json` 的 `count` 和 `pending_review` 始终是初始值（0 和 false）
- 只有 `log-decision` 会更新 per-session `state.json`（写入 review 结果）
- 根级 `state.json` 的 `sessions` 字段与 per-session `state.json` 完全重复且不同步

### 根级 state.json 的 `jobs[]` 无清理机制

`state.json` 中的 `jobs` 数组只增不减。每次 `stop-gate` 触发 review 都会 `addJob()`，但从未删除已完成的 job。长时间运行后，此数组会无限增长。

### 建议

1. **移除根级 `state.json`**：将 `count` 和 `pending_review` 合并到 per-session `state.json`，`post-tool-use` 和 `stop-gate` 直接读写 per-session 文件
2. **`jobs` 移入 per-session**：每个 session 最多一个 job，直接存在 session 目录下
3. **根级只保留 `stats.json`**：全局统计信息，已经是这样设计的，但 `state.json` 多余
4. 如果需要跨 session 的 `pending_review` 查询（`stop-gate` 需要快速判断），可以在 per-session state 文件上做目录扫描，或在内存中维护临时索引

---

## Affected Files

| File | Change |
|------|--------|
| `src/runtime.ts` | 统一 session ID 解析逻辑，从 stdin 优先读取 |
| `src/lib/logger.ts` | 添加 log 文件元信息，确保字段顺序 |
| `src/lib/state.ts` | 合并根级和 per-session 状态，移除根级 `state.json` |
| `src/commands/post-tool-use.ts` | 改为读写 per-session state |
| `src/commands/stop-gate.ts` | 改为读写 per-session state，移除 `addJob` |
| `src/commands/status.ts` | 从 per-session 目录聚合状态 |
