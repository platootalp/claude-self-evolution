# self-evolution v5 — TS Runtime Redesign Spec

**日期**: 2026-05-14
**状态**: Draft

---

## 1. 概述

将 self-evolution 插件从 shell 脚本架构迁移到 TypeScript 运行时 + 纯 command hook 架构，对齐 codex-plugin-cc 的 companion 模式，支持 `claude -p` 无头模式后台自动审查，并为 Codex/Cursor 等平台预留扩展接口。

## 2. 设计决策记录

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 技术栈 | TypeScript + esbuild 单文件打包 | 跨平台，零依赖分发，对齐 codex-plugin-cc |
| 2 | Hook 类型 | 纯 `type: "command"` | 兼容多平台；`type: "agent"` 在插件中有 bug |
| 3 | 自动触发 | `claude -p` 后台进程（companion 模式） | 真正后台，用户无感；对齐 codex-plugin-cc |
| 4 | 安全扫描 | 内嵌到 reviewer 写入流程 | 不全局拦截用户写操作；目标仅 SKILL.md |
| 5 | Shell 脚本 | 全部废弃 | 运行时统一处理 |
| 6 | API 成本 | 接受 | 每次 review 一次 API 调用 |
| 7 | 多平台 | 一期 Claude Code 实现，Codex/Cursor 为 stub | 聚焦核心链路 |

## 3. 目标目录结构

```
self-evolution/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── hooks/
│   └── hooks.json               # 纯 command hook，仅 3 个事件
├── src/
│   ├── runtime.ts               # 主入口：命令路由
│   ├── commands/
│   │   ├── post-tool-use.ts     # PostToolUse 计数
│   │   ├── stop-gate.ts         # Stop 门控 + 后台 agent 调度
│   │   ├── session-start.ts     # SessionStart 诊断
│   │   ├── security-scan.ts     # 安全扫描（reviewer 调用，非 hook）
│   │   ├── review-context.ts    # 审查上下文准备（reviewer 调用）
│   │   └── log-decision.ts      # 决策日志
│   ├── lib/
│   │   ├── state.ts             # 状态管理
│   │   ├── security.ts          # 安全扫描引擎
│   │   ├── logger.ts            # JSONL 日志
│   │   ├── spawner.ts           # 平台抽象后台调度
│   │   └── transcript.ts        # Transcript 解析
│   └── types.ts
├── dist/
│   └── runtime.mjs              # esbuild 单文件产物
├── skills/
│   └── evolve-skill-writer/
│       └── SKILL.md
├── commands/
│   ├── evolve-review.md         # 手动审查
│   └── evolve-status.md         # 后台任务状态
├── agents/
│   └── skill-reviewer.md        # thin forwarder
├── prompts/
│   └── review-prompt.md         # 后台 agent prompt 模板
├── esbuild.config.mjs
├── tsconfig.json
├── package.json
└── README.md
```

## 4. hooks.json

仅 3 个事件，全部 command hook：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs\" session-start",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs\" post-tool-use",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs\" stop-gate",
            "timeout": 30,
            "statusMessage": "evolve: checking..."
          }
        ]
      }
    ]
  }
}
```

- 无 PreToolUse hook — 安全扫描内嵌到 reviewer 写入流程
- Stop timeout 30s — 需要时间启动后台 agent
- Stop 总是返回 allow — 审查在后台，不阻塞主会话

## 5. 核心数据流

### 5.1 正常工作阶段

```
PostToolUse hook
  → node runtime.mjs post-tool-use
  → stdin: {session_id, tool_name, ...}
  → state.ts: session.count++
  → 达到阈值: session.pending_review = true
  → exit 0
```

### 5.2 Stop 阶段

```
Stop hook
  → node runtime.mjs stop-gate
  → stdin: {session_id, transcript_path, stop_hook_active}
  →
  ├─ stop_hook_active = true → allow（防无限循环）
  ├─ pending_review = true → 消费标记
  │    → spawner.ts: 启动后台 agent 进程
  │    → state.ts: 记录 job {id, session_id, pid, status: "running"}
  │    → return allow（主会话正常结束）
  └─ 否则 → return allow
```

### 5.3 后台 agent 进程

```
后台 agent 启动（Claude Code一期: claude -p）
  → 读取 review-prompt.md（runtime 通过 -p 参数传入）
  → Agent 执行审查：
    1. node runtime.mjs review-context
       → runtime 读取 transcript JSONL
       → 提取 tool call 序列 + 用户交互
       → 列出 ~/.claude/skills/ 已有 skills
       → stdout: 结构化 JSON context
    2. 基于 context 判定 CREATE / UPDATE / SKIP
       → rationale 自检（≥3 步骤、可泛化、无用户数据）
    3. CREATE/UPDATE → Skill('self-evolution:evolve-skill-writer', context)
    4. 写入前安全检查：
       → node runtime.mjs security-scan --path <path> --content <content>
       → runtime 执行路径白名单 + 内容扫描
       → 返回 {allowed: true/false, reason?: string}
       → 不通过: SKIPPED: hard_gate_blocked: <reason>
    5. 通过 → Write ~/.claude/skills/<name>/SKILL.md
    6. node runtime.mjs log-decision "<VERB>" "<reason>"
  → 进程结束
  → state.ts: job status = "completed"
```

### 5.4 手动模式

```
/evolve-review
  → 启动 skill-reviewer subagent（前台）
  → 逻辑同 5.3 步骤 1-6
```

### 5.5 状态查询

```
/evolve-status
  → node runtime.mjs status
  → 读取 state.json，输出 jobs 列表
```

## 6. 核心模块设计

### 6.1 state.ts

```typescript
interface State {
  sessions: Record<string, {
    count: number;
    pending_review: boolean;
  }>;
  jobs: Array<{
    id: string;
    session_id: string;
    pid: number;
    status: "running" | "completed" | "failed";
    started_at: string;
    completed_at?: string;
    decision?: "CREATED" | "UPDATED" | "SKIPPED";
    skill_name?: string;
  }>;
}
```

- 路径：`${CLAUDE_PLUGIN_DATA}/state.json`
- 原子写入：writeFile → tmpfile → rename
- 不再需要 mkdir lock（TS async IO 无 shell 并发问题）

### 6.2 spawner.ts — 平台抽象后台调度

```typescript
interface AgentSpawner {
  platform: string;
  spawnReviewProcess(opts: SpawnOptions): Promise<Job>;
}

interface SpawnOptions {
  sessionId: string;
  transcriptPath: string;
  pluginRoot: string;
  pluginData: string;
  reviewModel?: string;
}

// 一期实现：Claude Code
class ClaudeCodeSpawner implements AgentSpawner {
  platform = "claude-code";
  async spawnReviewProcess(opts: SpawnOptions): Promise<Job> {
    const prompt = buildReviewPrompt(opts);
    const child = spawn("claude", [
      "-p", prompt,
      "--allowedTools", "Read,Write,Bash,Glob,Grep,Skill",
      "--max-turns", "20",
      "--output-format", "json",
      ...(opts.reviewModel ? ["--model", opts.reviewModel] : []),
    ], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: opts.pluginRoot, ... },
    });
    child.unref();
    return { id: generateId(), session_id: opts.sessionId, pid: child.pid!, status: "running", started_at: new Date().toISOString() };
  }
}

// 一期 stub：Codex
class CodexSpawner implements AgentSpawner {
  platform = "codex";
  async spawnReviewProcess(_opts: SpawnOptions): Promise<Job> {
    throw new Error("Codex spawner not implemented. Set platform=claude-code or implement CodexSpawner.");
  }
}

// 一期 stub：Cursor
class CursorSpawner implements AgentSpawner {
  platform = "cursor";
  async spawnReviewProcess(_opts: SpawnOptions): Promise<Job> {
    throw new Error("Cursor spawner not implemented. Set platform=claude-code or implement CursorSpawner.");
  }
}

// 工厂
function getSpawner(platform?: string): AgentSpawner {
  const p = platform || process.env.SELF_EVOLUTION_PLATFORM || detectPlatform();
  switch (p) {
    case "claude-code": return new ClaudeCodeSpawner();
    case "codex": return new CodexSpawner();
    case "cursor": return new CursorSpawner();
    default: return new ClaudeCodeSpawner();
  }
}

function detectPlatform(): string {
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude-code";
  if (process.env.CODEX_SESSION_ID) return "codex";
  return "claude-code";
}
```

平台选择优先级：`userConfig.platform` > `SELF_EVOLUTION_PLATFORM` > 自动检测

### 6.3 security.ts

从 `security-scan.sh` 迁移，保留全部规则：

```typescript
interface ScanResult {
  allowed: boolean;
  reason?: string;
}

function scanWrite(targetPath: string, content: string): ScanResult {
  // 1. 路径白名单：仅 ~/.claude/skills/<name>/SKILL.md
  // 2. Prompt 注入检测
  // 3. 危险 bash 检测
  // 4. Secret 泄露检测
  // 5. Base64 解码后扫描
  // 6. 文件大小限制 (default 15KB)
}
```

调用方式：reviewer agent 在 Write 前调用 `node runtime.mjs security-scan`，传入 path 和 content，runtime 返回 `{allowed, reason?}`。

### 6.4 transcript.ts

```typescript
interface TranscriptSummary {
  toolCalls: Array<{ tool: string; input: Record<string, unknown>; output?: string }>;
  userMessages: string[];
  assistantMessages: string[];
  totalTurns: number;
}

function parseTranscript(transcriptPath: string): TranscriptSummary
```

### 6.5 runtime.ts — 命令路由

```typescript
const command = process.argv[2];

switch (command) {
  case "session-start":    // SessionStart hook → 诊断日志
  case "post-tool-use":    // PostToolUse hook → 计数
  case "stop-gate":        // Stop hook → 门控 + 后台调度
  case "security-scan":    // reviewer 调用 → 安全扫描
  case "review-context":   // reviewer 调用 → 上下文准备
  case "log-decision":     // reviewer 调用 → 决策日志
  case "status":           // /evolve-status 调用 → jobs 状态
  default: process.exit(1);
}
```

## 7. commands/

### 7.1 evolve-review.md

```markdown
---
description: Manually trigger skill review on the current conversation.
allowed-tools: Task,Read,Write,Bash,Glob,Grep,Skill
argument-hint: "[topic]"
---

Use the Task tool to launch the `skill-reviewer` subagent.

Pass these inputs:
- Topic focus (optional): $ARGUMENTS
- Conversation transcript: the last 30 turns
- Existing skills: ~/.claude/skills/

After the subagent completes, summarize in ONE sentence.
```

### 7.2 evolve-status.md

```markdown
---
description: Check status of self-evolution background review jobs.
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" status`
```

## 8. agents/

### skill-reviewer.md

thin forwarder 模式，对齐 codex-plugin-cc：

```markdown
---
name: skill-reviewer
description: Reviews recent conversation and creates/updates a skill if a reusable workflow was demonstrated.
model: inherit
effort: low
maxTurns: 6
tools: [Read, Write, Bash, Glob, Grep, Skill]
disallowedTools: [Task, WebFetch, WebSearch]
---

You are a Skill Reviewer. Decide CREATE / UPDATE / SKIP.

Step 1 — Get context:
  Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context
  Returns JSON with transcript summary and existing skills.

Step 2 — Rationale (MUST before any tool call):
  Write ONE sentence (≤30 words) WHY this workflow should be captured.
  Reject if trivial, one-off, or lacks generalizability.

Step 3 — Security scan (MUST before Write):
  Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" security-scan --path <path> --content <content>
  If {allowed: false}, do NOT Write. Output: SKIPPED: hard_gate_blocked: <reason>

Step 4 — Generate skill:
  If CREATE or UPDATE, invoke Skill('self-evolution:evolve-skill-writer', context).
  Use returned content with Write to ~/.claude/skills/<name>/SKILL.md.

Step 5 — Log:
  Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "<VERB>" "<reason>"

Output: CREATED: <name> | rationale: <line> / UPDATED: <name> | rationale: <line> / SKIPPED: <reason>
```

## 9. prompts/

### review-prompt.md

后台 agent 进程使用的 prompt 模板。runtime 在启动 `claude -p` 时读取此模板，替换变量后作为 `-p` 参数传入。

```markdown
You are a self-evolution reviewer. A conversation has ended and the nudge threshold was met.

Session: ${SELF_EVOLUTION_SESSION_ID}
Plugin Root: ${CLAUDE_PLUGIN_ROOT}
Plugin Data: ${CLAUDE_PLUGIN_DATA}

Your task:
1. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context
   Returns transcript summary and existing skills.
2. Decide CREATE / UPDATE / SKIP. SKIP unless: reusable (≥3 steps), generalizable, no one-off data.
3. Write ONE sentence (≤30 words) explaining WHY. Reject if trivial.
4. Before writing, run security scan:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" security-scan --path <path> --content <content>
   If {allowed: false}, output: SKIPPED: hard_gate_blocked: <reason>
5. If CREATE or UPDATE, invoke Skill('self-evolution:evolve-skill-writer', context) and Write.
6. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "<VERB>" "<reason>"
7. Output your final decision.

NEVER output ok:false. Always complete and exit.
```

## 10. 安全模型

三层硬门控保留，从 shell 迁移到 TS。**无全局 PreToolUse hook**，安全扫描内嵌到 reviewer 写入流程。

| 层级 | 触发点 | 机制 | 实现 |
|------|--------|------|------|
| L1: 频率门控 | PostToolUse hook | state.ts 计数器 | `commands/post-tool-use.ts` |
| L2: 路径白名单 | reviewer Write 前 | 仅 `~/.claude/skills/<name>/SKILL.md` | `lib/security.ts` |
| L3: 内容扫描 | reviewer Write 前 | 注入/危险bash/secret/base64/大小 | `lib/security.ts` |

**移除全局 PreToolUse hook 的理由**：
- 全局拦截所有 Write/Edit 影响用户正常编写代码
- 安全扫描的真正目标仅 SKILL.md 写入
- 新设计：reviewer agent 在 Write 前主动调用 `runtime security-scan`

**三重保障**：
1. runtime security-scan 命令 — 确定性代码检查
2. reviewer prompt — 明确要求路径必须是 `~/.claude/skills/<name>/SKILL.md`
3. evolve-skill-writer skill — 内含路径白名单规则

## 11. 状态文件

路径：`${CLAUDE_PLUGIN_DATA}/state.json`

```json
{
  "sessions": {
    "abc123": { "count": 7, "pending_review": false }
  },
  "jobs": [
    {
      "id": "job-001",
      "session_id": "abc123",
      "pid": 12345,
      "status": "running",
      "started_at": "2026-05-14T10:00:00Z"
    },
    {
      "id": "job-002",
      "session_id": "def456",
      "pid": 12346,
      "status": "completed",
      "started_at": "2026-05-14T09:00:00Z",
      "completed_at": "2026-05-14T09:02:00Z",
      "decision": "CREATED",
      "skill_name": "debug-fastapi-5xx"
    }
  ]
}
```

## 12. 废弃文件

迁移完成后删除：

- `scripts/nudge-state.sh`
- `scripts/stop-gate.sh`
- `scripts/security-scan.sh`
- `scripts/log-decision.sh`
- `scripts/diag-hook.sh`
- `scripts/reset-state.sh`
- `scripts/verify-skill-quality.sh`
- `scripts/lib/log.sh`
- `scripts/lib/posix-lock.sh`

## 13. 打包与分发

```json
// esbuild.config.mjs
{
  entryPoints: ["src/runtime.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/runtime.mjs",
  target: "node18"
}
```

`dist/runtime.mjs` 提交到 git，安装即用，无需 `npm install`。

## 14. 跨平台兼容

runtime.mjs 是平台无关的统一入口。各平台差异仅在 **spawner 层**。

| 平台 | 一期状态 | Hook 机制 | 后台调度 |
|------|---------|----------|---------|
| Claude Code | **完整实现** | hooks.json + command hook | `claude -p "<prompt>" --allowedTools ...` |
| Codex | stub（throw） | AGENTS.md + hook | `codex -q "<prompt>"`（二期） |
| Cursor | stub（throw） | rule/hook 机制 | Cursor agent API（二期） |

**平台无关组件**（所有平台共用）：
- `state.ts` / `security.ts` / `logger.ts` / `transcript.ts`
- `commands/post-tool-use.ts` / `commands/stop-gate.ts` / `commands/review-context.ts` / `commands/log-decision.ts`

**平台相关组件**（仅 spawner 层不同）：
- `lib/spawner.ts` — `ClaudeCodeSpawner`（一期实现），`CodexSpawner`/`CursorSpawner`（一期 stub）
- `prompts/review-prompt.md` — 一期仅 Claude Code 格式

## 15. 迁移策略

**Phase 1**：实现 TS 运行时，打包 dist/runtime.mjs，更新 hooks.json，删除 scripts/。Codex/Cursor spawner 为 stub。

**Phase 2**（后续）：实现 CodexSpawner / CursorSpawner，适配各平台 prompt 模板。

## 16. 用户配置

```json
{
  "userConfig": {
    "nudge_interval": {
      "type": "number",
      "title": "Nudge interval (tool calls)",
      "description": "Number of tool calls between review triggers. Default: 10",
      "default": 10,
      "min": 1,
      "max": 100
    },
    "max_skill_size_kb": {
      "type": "number",
      "title": "Max skill size (bytes)",
      "description": "Maximum SKILL.md file size in bytes. Default: 15360",
      "default": 15360,
      "min": 1024,
      "max": 51200
    },
    "review_model": {
      "type": "string",
      "title": "Review model",
      "description": "Model for background agent process. Default: sonnet",
      "default": "sonnet"
    },
    "platform": {
      "type": "string",
      "title": "Agent platform",
      "description": "Platform for background review. Auto-detected by default.",
      "default": "auto",
      "enum": ["auto", "claude-code", "codex", "cursor"]
    }
  }
}
```
