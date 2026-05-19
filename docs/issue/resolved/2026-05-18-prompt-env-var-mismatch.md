# Issue: Prompt 模板中环境变量名不匹配

**Severity**: P0 — 所有 prompt 模板中 `Plugin Data` 行显示为字面量 `${SELF_EVOLUTION_PLUGIN_DATA}`，reviewer 无法获取 plugin data 路径
**Discovered**: 2026-05-18
**Status**: Open

## 问题描述

所有 4 个 review prompt 模板文件使用 `${SELF_EVOLUTION_PLUGIN_DATA}` 变量名，但 `spawner.ts` 从未将此变量设置到环境中，也未在 `buildReviewPrompt()` 中进行字符串替换。

## 影响范围

| 文件 | 行号 | 问题变量 |
|------|------|----------|
| `prompts/review-prompt.md` | line 5 | `${SELF_EVOLUTION_PLUGIN_DATA}` |
| `prompts/review-prompt-skill.md` | line 5 | `${SELF_EVOLUTION_PLUGIN_DATA}` |
| `prompts/review-prompt-combined.md` | line 5 | `${SELF_EVOLUTION_PLUGIN_DATA}` |
| `prompts/review-prompt-update.md` | line 5 | `${SELF_EVOLUTION_PLUGIN_DATA}` |

## 根因分析

### 环境变量设置（`spawner.ts:163-173`）

```typescript
env: {
  ...process.env,
  CLAUDE_PLUGIN_ROOT: opts.pluginRoot,
  CLAUDE_PLUGIN_DATA: opts.pluginData,    // ← 设置的是 CLAUDE_PLUGIN_DATA
  SELF_EVOLUTION_SESSION_ID: opts.sessionId,
  SELF_EVOLUTION_TRANSCRIPT_PATH: opts.transcriptPath,
  SELF_EVOLUTION_REVIEW_MODE: "1",
},
```

**`SELF_EVOLUTION_PLUGIN_DATA` 从未被设置。**

### 字符串替换（`spawner.ts:135-139`）

```typescript
return template
  .replace(/\${SELF_EVOLUTION_SESSION_ID}/g, opts.sessionId)
  .replace(/\${CLAUDE_PLUGIN_ROOT}/g, opts.pluginRoot)
  .replace(/\${CLAUDE_PLUGIN_DATA}/g, opts.pluginData)           // ← 替换 CLAUDE_PLUGIN_DATA
  .replace(/\${SELF_EVOLUTION_TRANSCRIPT_PATH}/g, opts.transcriptPath);
// 没有 .replace(/\${SELF_EVOLUTION_PLUGIN_DATA}/g, ...)
```

`buildReviewPrompt()` 替换的是 `${CLAUDE_PLUGIN_DATA}`，但模板中写的是 `${SELF_EVOLUTION_PLUGIN_DATA}`。两者不匹配，导致替换不生效。

### 内联 fallback prompt（`spawner.ts:113-117`）

```typescript
template = `You are a self-evolution reviewer. ...
Plugin Data: \${CLAUDE_PLUGIN_DATA}    // ← fallback 中用的是正确的 CLAUDE_PLUGIN_DATA
...`;
```

Fallback prompt 使用了正确的变量名 `${CLAUDE_PLUGIN_DATA}`，所以当模板文件读取失败时反而能正常工作。

## 实际影响

Companion reviewer 的 prompt 中 `Plugin Data: ${SELF_EVOLUTION_PLUGIN_DATA}` 会显示为字面量字符串。如果 reviewer 需要访问 plugin data 目录（例如读取 sessions、stats），它无法获取正确路径。

当前 reviewer 的工作流中，`review-context` 命令通过 `CLAUDE_PLUGIN_DATA` 环境变量解析路径（`runtime.ts:22-29`），所以核心功能不受影响。但 prompt 中的错误信息可能误导 reviewer 尝试使用 `${SELF_EVOLUTION_PLUGIN_DATA}` 变量。

## 修复方案

### 方案 A：修改模板文件（推荐）

将 4 个模板文件中的 `${SELF_EVOLUTION_PLUGIN_DATA}` 改为 `${CLAUDE_PLUGIN_DATA}`：

```diff
- Plugin Data: ${SELF_EVOLUTION_PLUGIN_DATA}
+ Plugin Data: ${CLAUDE_PLUGIN_DATA}
```

这与 `buildReviewPrompt()` 中已有的替换逻辑一致，也和 fallback prompt 一致。

### 方案 B：在 buildReviewPrompt 中添加替换

```typescript
.replace(/\${SELF_EVOLUTION_PLUGIN_DATA}/g, opts.pluginData)
```

不推荐：这会引入一个冗余的变量名，增加维护成本。

## Affected Files

| File | Change |
|------|--------|
| `prompts/review-prompt.md` | `${SELF_EVOLUTION_PLUGIN_DATA}` → `${CLAUDE_PLUGIN_DATA}` |
| `prompts/review-prompt-skill.md` | 同上 |
| `prompts/review-prompt-combined.md` | 同上 |
| `prompts/review-prompt-update.md` | 同上 |
