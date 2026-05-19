# Issue: Spawner 可观测性与 Job 生命周期管理缺失

**Severity**: P2 — companion 进程失败时无法感知，jobs 无限堆积
**Discovered**: 2026-05-18
**Status**: Open

## 问题 1：Companion 进程无输出捕获

### 位置

`src/lib/spawner.ts:163-176`

```typescript
const child = spawn("claude", args, {
  detached: true,
  stdio: "ignore",     // ← 完全忽略 stdout/stderr
  env: { ... },
});

child.unref();
```

### 问题

- `stdio: "ignore"` 意味着 companion 进程的所有输出（包括错误信息）都被丢弃
- 如果 `claude -p` 启动失败（命令不存在、权限问题、API key 缺失），没有任何日志
- 主会话无法知道 companion 是否成功启动，只能通过 `child.pid` 判断进程已创建

### 影响

用户报告 "review 没有执行" 时，没有任何日志可供排查。唯一的信号是 `log-decision` 没有被调用，但无法区分 "companion 未启动" 和 "companion 启动但 review 结果为 SKIP"。

### 建议

1. 将 companion 进程的 stdout/stderr 重定向到 session 日志文件
2. 捕获 `child.on("error", ...)` 事件，记录启动失败
3. 捕获 `child.on("exit", ...)` 事件，更新 job 状态

```typescript
const logFd = fs.openSync(path.join(sessionsDir, sessionId, "companion.log"), "a");
const child = spawn("claude", args, {
  detached: true,
  stdio: ["ignore", logFd, logFd],
  env: { ... },
});

child.on("error", (err) => {
  // 记录启动失败到 session log
});

child.on("exit", (code) => {
  // 更新 job status 为 completed/failed
});
```

---

## 问题 2：`jobs[]` 数组无清理机制

### 位置

`src/lib/state.ts:80-84`

```typescript
export function addJob(statePath: string, job: Job): void {
  const state = loadState(statePath);
  state.jobs.push(job);     // ← 只增不减
  saveState(statePath, state);
}
```

### 问题

每次 `stop-gate` 触发 review 都会 `addJob()`，但没有任何代码删除已完成的 job。`updateJob()` 只更新状态字段，从不移除 entry。

长时间运行后，`state.json` 中 `jobs` 数组会无限增长，导致：
1. `state.json` 文件越来越大
2. `loadState()` 每次读取整个文件，性能下降
3. `status` 命令输出大量历史 job

### 建议

1. 在 `addJob()` 时清理已完成的 job（超过 N 条或超过 T 天）
2. 或将 jobs 移到 per-session 目录，每个 session 最多一个 job
3. 或添加 `pruneJobs()` 函数，在 `handleStatus()` 中调用

---

## 问题 3：Job 状态从不更新为 `completed` / `failed`

### 位置

`spawner.ts:54-65`

```typescript
jobPromise.then((job: Job) => {
  logger.info("review_launched", { session_id: input.session_id, pid: job.pid });
  addJob(statePath, job);    // ← 初始状态: { status: "running" }
}).then(() => {
  const duration = Date.now() - startTime;
  logger.debug("spawn_completed", { exit_code: 0, duration_ms: duration });
  // ← 没有 updateJob(statePath, job.id, { status: "completed" })
}).catch((err: unknown) => {
  // ← 没有 updateJob(statePath, job.id, { status: "failed" })
});
```

### 问题

Job 添加到 `state.json` 时状态为 `"running"`，但从未更新为 `"completed"` 或 `"failed"`。这意味着：
- `status` 命令总是显示所有 job 为 `"running"` 状态
- 无法区分"正在运行的 review"和"已完成但未清理的 review"

### 根因

`spawn()` 返回的 `child` 对象在 `unref()` 后无法被主进程追踪。`jobPromise` 只 resolve 到 Job 创建，不等到进程退出。要追踪进程退出，需要监听 `child.on("exit")` 事件。

---

## Affected Files

| File | Change |
|------|--------|
| `src/lib/spawner.ts` | 捕获 companion 输出到日志文件，监听 exit/error 事件 |
| `src/lib/state.ts` | 添加 `pruneJobs()`，或在 `addJob` 中清理旧 job |
| `src/commands/stop-gate.ts` | 使用 `updateJob()` 更新 job 终态 |
