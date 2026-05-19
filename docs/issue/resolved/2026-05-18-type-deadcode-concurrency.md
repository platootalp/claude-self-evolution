# Issue: 类型定义、死代码与并发安全问题

**Severity**: P2 — 不影响核心功能，但类型不安全、代码冗余、并发测试虚假通过
**Discovered**: 2026-05-18
**Status**: Open

## 问题 1：`updateStats()` 类型签名缺少 `"DELETED"` 变体

### 位置

`src/lib/state.ts:193-199`

```typescript
export function updateStats(
  statsPath: string,
  decision: "CREATED" | "UPDATED" | "SKIPPED",  // ← 缺少 "DELETED"
  detail: string,
  sessionId: string,
  skillName?: string
): void
```

### 问题

函数体（line 209）实际处理了 `"DELETED"`：

```typescript
} else if (decision === "DELETED") {
  stats.total_deleted += 1;
}
```

调用方 `log-decision.ts:30` 使用 `as` 强制转换绕过类型检查：

```typescript
updateStats(statsPath, decision as "CREATED" | "UPDATED" | "SKIPPED" | "DELETED", detail, sessionId, skillName);
```

### 修复

将签名改为 `"CREATED" | "UPDATED" | "SKIPPED" | "DELETED"`，移除调用方的 `as` 断言。

---

## 问题 2：`logEvent()` 和 `logDecision()` 是死代码

### 位置

`src/lib/logger.ts:62-96`

```typescript
// Backward-compatible standalone functions for callers that haven't migrated yet
export function logEvent(logPath, level, event, kv = {}): void { ... }
export function logDecision(logPath, decision, detail, durationMs, sessionId): void { ... }
```

### 问题

- 所有调用方已迁移到 `createLogger()` 返回的 `Logger` 接口
- 注释说 "backward-compatible"，但实际上没有任何调用方
- 全代码库搜索（src + tests）确认无引用

### 修复

删除这两个函数及注释。

---

## 问题 3：并发写入测试虚假通过

### 位置

`src/__tests__/state.test.ts`（并发写入测试）

```typescript
it("handles concurrent writes gracefully (no corruption)", async () => {
  const promises = Array.from({ length: 20 }, (_, i) =>
    Promise.resolve().then(() => incrementCount(statePath, "s-concurrent"))
  );
  await Promise.all(promises);
  const state = loadState(statePath);
  expect(state.sessions["s-concurrent"].count).toBeGreaterThanOrEqual(0);
  //   ^^^ 只验证不是 NaN/负数，不验证 count == 20
});
```

### 问题

`incrementCount()` 执行 read-modify-write 但无锁。20 个并发调用中，大多数会丢失更新（lost update），最终 count 远小于 20。但测试只验证 `>= 0`，永远通过。

这给开发者一个虚假印象：并发写入是安全的。实际上：
- 在 Node.js 单线程模型中，`Promise.resolve().then()` 会在微任务队列中交错执行
- `fs.readFileSync` + `fs.writeFileSync` 不是原子操作
- 多个 read-modify-write 周期会交错，导致丢失更新

### 修复

两个选择：

**A. 接受并发不安全，测试验证正确行为**：

```typescript
it("incrementCount is not concurrency-safe (sequential calls recommended)", () => {
  // Sequential: should be exactly 20
  for (let i = 0; i < 20; i++) incrementCount(statePath, "s-seq");
  const state = loadState(statePath);
  expect(state.sessions["s-seq"].count).toBe(0); // reset at threshold
});
```

**B. 使其并发安全**：使用文件锁（`proper-lockfile` 包）或改用 per-file 计数器。

当前 hook 调用是串行的（Claude Code 串行执行 hook），所以生产环境不会触发并发问题。但测试误导了真实情况。

---

## 问题 4：`stop-gate.ts` 中 `platform` 字段冗余

### 位置

`src/commands/stop-gate.ts:12-18`

```typescript
interface StopGateOptions {
  pluginRoot: string;
  pluginData: string;
  reviewModel?: string;
  reviewMaxTurns?: number;
  platform?: string;    // ← 用于选择 spawner
}
```

`platform` 用于 `getSpawner(options.platform)` 选择 spawner 实例，但从未传递给 `spawnReviewProcess()`。`SpawnOptions` 类型（`types.ts:82-89`）中不包含 `platform`。

这不是 bug（spawner 实例已经封装了平台逻辑），但 `StopGateOptions.platform` 的命名和位置可能让人误以为它会传递给 spawn 进程。

### 修复

添加注释说明 `platform` 仅用于 spawner 选择，或者移到 `getSpawner()` 调用处局部使用。

---

## 问题 5：`config-set.ts` 写入 `pluginRoot/config.json`（不可写位置）

### 位置

`src/commands/config-set.ts:54-56` 和 `src/commands/config-set.ts:74-76`

```typescript
const configPath = path.join(pluginRoot, "config.json");
fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + "\n");
```

### 问题

`pluginRoot` 指向插件安装目录（可能是 `~/.claude/plugins/.../self-evolution/`）。这个目录：
1. 在插件更新时可能被覆盖，导致配置丢失
2. 某些安装方式下可能是只读的

相比之下，`pluginData`（`~/.claude/plugins/data/.../`）是专门用于存储运行时数据的目录，更适合写入配置。

### 修复

将 config.json 的读写路径改为 `path.join(pluginData, "config.json")`，或使用 `XDG_CONFIG_HOME` 下的专用目录。

---

## Affected Files

| File | Change |
|------|--------|
| `src/lib/state.ts` | `updateStats` 签名添加 `"DELETED"` |
| `src/commands/log-decision.ts` | 移除 `as` 断言 |
| `src/lib/logger.ts` | 删除 `logEvent()` 和 `logDecision()` |
| `src/__tests__/state.test.ts` | 修复并发测试断言 |
| `src/commands/stop-gate.ts` | 注释或重构 `platform` 字段 |
| `src/commands/config-set.ts` | 将 config 路径改到 `pluginData` |
| `src/commands/config-get.ts` | 同步读取路径 |
