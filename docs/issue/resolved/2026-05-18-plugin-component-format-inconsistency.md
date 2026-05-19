# Issue: Plugin 组件格式不标准化

**Severity**: P2 — 不影响功能，但增加维护成本和新人理解难度
**Discovered**: 2026-05-18
**Status**: Open

## 问题描述

`skills/`、`agents/`、`commands/` 三个组件目录的文件格式和命名约定存在不一致。

---

## 问题 1：`commands/` 目录命名不一致

| 文件 | 命名模式 | 前缀 |
|------|----------|------|
| `evolve-status.md` | `evolve-<noun>` | evolve |
| `evolve-review.md` | `evolve-<noun>` | evolve |
| `evolve-config.md` | `evolve-<noun>` | evolve |
| `evolve-skill-delete.md` | `evolve-<noun>-<verb>` | evolve |

`evolve-skill-delete` 打破了 `evolve-<noun>` 的模式。应为 `evolve-delete-skill`（动词在前，与 `evolve-review`、`evolve-config`、`evolve-status` 一致）。

---

## 问题 2：`agents/` 目录 frontmatter 字段不一致

### `skill-reviewer.md`

```yaml
---
name: skill-reviewer
description: Reviews recent conversation and creates/updates a skill if a reusable, non-trivial workflow was demonstrated. Invoked manually via /evolve-review or as a Task subagent.
model: inherit
effort: low
maxTurns: 8
tools: [Read, Write, Edit, Bash, Glob, Grep, Skill]
disallowedTools: [Task, WebFetch, WebSearch]
---
```

### `config-agent.md`

```yaml
---
name: config-agent
description: Manages self-evolution plugin configuration through natural conversation. Reads and writes settings via config-get/config-set runtime commands.
model: inherit
effort: low
maxTurns: 8
tools: [Bash, Read]
disallowedTools: [Task, WebFetch, WebSearch, Write, Edit]
---
```

**不一致之处：**

| 字段 | skill-reviewer | config-agent | 问题 |
|------|---------------|-------------|------|
| `tools` 顺序 | `[Read, Write, Edit, Bash, Glob, Grep, Skill]` | `[Bash, Read]` | 无统一排序规则 |
| `disallowedTools` | `[Task, WebFetch, WebSearch]` | `[Task, WebFetch, WebSearch, Write, Edit]` | config-agent 的 disallowedTools 包含了 Write/Edit，但 skill-reviewer 是通过 tools 白名单控制的 |

两套权限控制策略（白名单 vs 黑名单）混用，容易出错：
- `skill-reviewer`：使用 `tools` 白名单，`disallowedTools` 只排除额外的
- `config-agent`：`tools` 只有 `[Bash, Read]`，但 `disallowedTools` 又列出了 `[Write, Edit]`，冗余（因为不在 `tools` 中本身就不能用）

---

## 问题 3：`skills/` 目录结构标准缺失

当前只有一个 skill `evolve-skill-writer`，但它的格式与它自己生成的 skill 格式不一致：

### evolve-skill-writer 的 frontmatter

```yaml
---
name: evolve-skill-writer
description: Generate a well-formed SKILL.md from...
when_to_use: |
  When the self-evolution reviewer has analyzed...
paths: ["**/*"]
allowed-tools: Read Write Edit
version: "1.0.0"
---
```

### evolve-skill-writer 要求生成的 skill frontmatter

```yaml
---
name: <category>-<kebab-name>
description: <one sentence>
when_to_use: |
  <trigger condition>
paths: ["**/*"]
allowed-tools: <space-separated list>
trust: agent-created
version: "1.0.0"
---
```

**差异：**

| 字段 | evolve-skill-writer 自身 | 生成的 skill |
|------|------------------------|-------------|
| `trust` | 缺失 | `agent-created` |
| `allowed-tools` | `Read Write Edit` | 空格分隔，与自身一致 |

evolve-skill-writer 自身缺少 `trust` 字段，而它要求生成的所有 skill 都必须有 `trust: agent-created`。自身应设为 `trust: trusted`（因为是插件自带的元 skill）。

---

## 问题 4：`commands/` frontmatter 字段不统一

| 文件 | `disable-model-invocation` | `allowed-tools` | `argument-hint` |
|------|---------------------------|-----------------|-----------------|
| `evolve-status.md` | true | `Bash(node:*)` | 无 |
| `evolve-review.md` | 无 | `Task,Read,Write,Bash,Glob,Grep,Skill` | `[topic]` |
| `evolve-config.md` | 无 | `Task, Bash(node:*), Read` | `[setting or question]` |
| `evolve-skill-delete.md` | 无 | `Bash(node:*)` | `<skill-name>` |

- `evolve-status` 是唯一使用 `disable-model-invocation: true` 的命令，因为它直接执行 shell 命令
- `allowed-tools` 格式不统一：有的用逗号分隔（`Task, Bash(node:*), Read`），有的用空格（skills 中的 `Read Write Edit`）
- `argument-hint` 的括号风格不一致：`[topic]`（可选）vs `<skill-name>`（必选）

---

## 建议

1. **统一 commands 命名**：`evolve-skill-delete.md` → `evolve-delete-skill.md`
2. **统一 agents 权限模型**：只使用 `tools` 白名单，移除 `disallowedTools`（或反过来，但统一一种）
3. **统一 `allowed-tools` 分隔符**：commands 用逗号（Claude Code 规范），skills 用空格（SKILL.md 规范），各自保持一致
4. **统一 `argument-hint` 括号**：`[]` 表示可选，`<>` 表示必选，保持一致
5. **给 evolve-skill-writer 补 `trust: trusted`**

## Affected Files

| File | Change |
|------|--------|
| `commands/evolve-skill-delete.md` | 重命名为 `evolve-delete-skill.md` |
| `agents/skill-reviewer.md` | 统一权限模型 |
| `agents/config-agent.md` | 统一权限模型 |
| `skills/evolve-skill-writer/SKILL.md` | 添加 `trust: trusted` |
| `commands/evolve-config.md` | 统一 `allowed-tools` 格式 |
| `commands/evolve-skill-delete.md` | 统一 `argument-hint` 括号 |
