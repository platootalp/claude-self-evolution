# Issue: Transcript 解析鲁棒性不足

**Severity**: P2 — 非标准格式的 transcript 会被静默丢弃
**Discovered**: 2026-05-18
**Status**: Open

## 问题描述

`transcript.ts` 的 `parseTranscript()` 尝试两种解析策略：先尝试 JSON 数组，再尝试 JSONL。但两种策略都有边界情况处理不当。

---

## 问题 1：JSONL 解析失败时静默返回空

### 位置

`src/lib/transcript.ts:36-44`

```typescript
try {
  entries = raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
} catch {
  return summary;    // ← 任何一行解析失败就丢弃整个文件
}
```

### 问题

如果 transcript 中有一行损坏（例如被截断的行），`map()` 会在那一行抛出异常，**整个 transcript 被丢弃**。即使前面 99 行都是有效的。

### 修复

使用 `flatMap` + `try-catch` 逐行解析，跳过损坏的行：

```typescript
entries = raw
  .split("\n")
  .filter((line) => line.trim())
  .flatMap((line) => {
    try { return [JSON.parse(line)]; }
    catch { return []; }  // 跳过损坏的行
  });
```

---

## 问题 2：只识别 `type` 和 `role` 两种消息格式

### 位置

`src/lib/transcript.ts:47-113`

当前只处理两种 entry 格式：
1. `{ type: "user" | "assistant", message: { content } }` — Anthropic API 格式
2. `{ role: "user" | "assistant" | "tool_use", content }` — OpenAI 兼容格式

### 问题

Claude Code 的 transcript 格式可能包含其他 entry type，例如：
- `type: "tool_result"` — 工具返回结果
- `type: "system"` — 系统消息
- 没有 `type` 也没有 `role` 的 entry（如元信息行）

这些 entry 被静默跳过。虽然 `tool_use` 在 assistant message 的 content block 中被提取，但 `tool_result`（工具的输出）完全丢失，reviewer 无法看到工具执行的结果。

### 影响

Reviewer 只能看到"调用了什么工具"但看不到"工具返回了什么"，这限制了 reviewer 判断工作流质量的能力。

---

## 问题 3：`totalTurns` 计算逻辑重复计数

### 位置

`src/lib/transcript.ts:57-58`, `src/lib/transcript.ts:68-69`

```typescript
// user message
summary.userMessages.push(content);
summary.totalTurns++;      // ← 每条 user message +1

// assistant message with content blocks
if (added) summary.totalTurns++;  // ← 每条 assistant message +1
```

`totalTurns` 同时计 user 和 assistant 的 turn。如果一轮对话 = 1 user + 1 assistant，则 `totalTurns = 2`，而不是直觉上的 1。这不是 bug，但命名容易误导。

---

## Affected Files

| File | Change |
|------|--------|
| `src/lib/transcript.ts` | JSONL 逐行容错解析 |
| `src/lib/transcript.ts` | 提取 `tool_result` 类型的 entry |
| `src/lib/transcript.ts` | 文档化 `totalTurns` 的计数语义 |
