# self-evolution

> 通过 companion-mode 后台审查，自动从对话中提取可复用工作流，生成 Claude 技能。

**版本：** 0.5.0
**许可证：** MIT
**兼容性：** Claude-Code v1.0.0+
**运行时：** Node.js 18+（TypeScript，esbuild 单文件打包）

---

## 功能介绍

self-evolution 插件自动从对话中提取可复用工作流，并将其转换为结构化的 Claude 技能。它支持两种运行模式：

- **自动模式**：通过 Stop hook 自动触发（默认每 10 次工具调用），生成独立的 companion 进程（`claude -p`）进行后台审查
- **手动模式**：通过 `/evolve-review` 命令按需提取工作流

安全扫描直接嵌入到审查者的写入流程中——不会通过全局 PreToolUse 钩子阻塞您的正常工作。

### 核心特性

- **Companion-mode 审查**：后台 `claude -p` 进程处理技能创建，不阻塞主会话
- **硬防护安全**：路径白名单 + 内容扫描（提示注入、危险 bash、密钥泄露、base64 编码攻击）在每次写入前强制执行
- **元技能生成**：使用 evolve-skill-writer 确保生成规范完整的 SKILL.md 文件
- **JSONL 日志**：所有决策和操作都记录用于审计
- **TypeScript 运行时**：单文件 esbuild 打包（`dist/runtime.mjs`）——无 shell 脚本依赖

---

## 两种模式：自动 vs 手动

| 特性           | 自动模式（Stop Hook）                                        | 手动模式（/evolve-review）                      |
| -------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| **触发方式**   | 会话结束后调用 ≥10 次工具时                                  | 用户在会话中或结束后运行命令                    |
| **工作流程**   | `PostToolUse → Stop hook → spawn companion` → 后台审查      | `/evolve-review` → skill-reviewer 代理 → 元技能 |
| **阻塞**       | 从不阻塞——companion 独立运行                                 | 交互式（显示决策）                              |
| **用户可见性** | 静默（通过 `/evolve-status` 查看状态）                       | 交互式（显示决策日志）                          |
| **适用场景**   | "设置后即可忘记"                                             | 在良好的对话后立即提取                          |
| **配置方式**   | `nudge_interval` userConfig                                  | 命令行参数                                      |
| **安全机制**   | 安全扫描嵌入审查者写入流程                                   | 相同的安全扫描                                  |

---

## 安全模型

self-evolution 在技能创建时强制执行安全检查——在审查者的写入流程内部——而非通过全局 PreToolUse 钩子。

### 路径白名单

- **允许**：`~/.claude/skills/<name>/SKILL.md`（仅此确切模式）
- **阻止**：`~/.claude/` 下的其他所有内容（CLAUDE.md、settings 等）
- **允许**：`~/.claude/` 之外的任何路径（项目代码不受限制）

### 内容扫描

`runtime security-scan` 命令在写入前检查所有技能内容：

| 类别 | 检测内容 | 示例 |
|---|---|---|
| 提示注入 | 指令覆盖模式 | "ignore previous instructions"、"you are now..." |
| 危险 bash | 破坏性 shell 命令 | `rm -rf /`、`curl ... \| sh`、`eval $(...)` |
| 密钥泄露 | API 密钥和凭证 | `sk-...`、`AKIA...`、`ghp_...`、私钥头 |
| Base64 攻击 | 编码的恶意内容 | 解码并扫描 ≥20 字符的 base64 字符串 |
| 大小限制 | 过大的技能文件 | 默认 >15KB（可配置） |

### 工作原理

1. 审查者决定创建/更新技能
2. 写入前，审查者运行：`node runtime.mjs security-scan --path <path> --content <content>`
3. 如果返回 `{allowed: false}`，审查者输出 `SKIPPED: hard_gate_blocked: <reason>` 且不写入
4. 仅 `{allowed: true}` 才会继续写入

---

## 安装指南

### 步骤 1：从 GitHub 添加插件市场

在 Claude Code 中，将本仓库注册为插件市场（参见 [创建和分发 plugin marketplace](https://code.claude.com/docs/zh-CN/plugin-marketplaces)）：

```bash
/plugin marketplace add platootalp/claude-self-evolution
```

**仅 SSH 的环境：** 使用完整 Git URL：

```bash
/plugin marketplace add git@github.com:platootalp/claude-self-evolution.git
```

### 步骤 2：从市场安装插件

```bash
/plugin install self-evolution@self-evolution-marketplace
```

### 步骤 3：验证安装

```bash
/plugin list
```

您应该在已安装插件列表中看到 `self-evolution v0.5.0`。

### 可选：配置设置

设置可以通过插件的 userConfig（在 Claude Code 的插件设置 UI 中显示）或环境变量配置：

```bash
export SELF_EVOLUTION_NUDGE_INTERVAL=15  # 每 15 次工具调用触发，而非 10 次
```

---

## 配置说明

| 设置 | 默认值 | 描述 | 环境变量 |
|---|---|---|---|
| `nudge_interval` | 10 | 自动触发事件之间的工具调用次数 | `SELF_EVOLUTION_NUDGE_INTERVAL` |
| `max_skill_size_kb` | 15360 | SKILL.md 文件的最大大小（字节） | `SELF_EVOLUTION_MAX_SKILL_SIZE` |
| `review_model` | "sonnet" | 后台 companion 进程使用的模型 | `CLAUDE_PLUGIN_OPTION_review_model` |
| `platform` | "auto" | 代理平台：auto、claude-code、codex、cursor | `CLAUDE_PLUGIN_OPTION_platform` |

环境变量在运行时覆盖 userConfig 设置。

---

## 运行时命令

所有功能通过 `dist/runtime.mjs` 路由：

| 命令 | 钩子/用途 | 描述 |
|---|---|---|
| `session-start` | SessionStart hook | 会话开始时记录诊断日志 |
| `post-tool-use` | PostToolUse hook | 递增工具调用计数，达到阈值时设置 pending_review |
| `stop-gate` | Stop hook | 消费 pending_review，若到期则生成 companion 进程 |
| `security-scan` | 审查者在写入前调用 | 扫描路径 + 内容，返回 `{allowed, reason?}` |
| `review-context` | companion 代理调用 | 返回对话摘要 + 现有技能列表 |
| `log-decision` | 审查者决策后调用 | 将 CREATED/UPDATED/SKIPPED 决策记录到 JSONL |
| `status` | `/evolve-status` 命令 | 显示会话和后台任务状态 |

---

## 监控与日志

### JSONL 日志

所有决策和安全事件都记录到 `self-evolution.jsonl`：

```json
{"ts":"2026-05-14T12:34:56Z","level":"info","event":"diag_hook_fired","CLAUDE_PLUGIN_ROOT":"/path"}
{"ts":"2026-05-14T12:35:12Z","level":"info","event":"reviewer_decision","decision":"CREATED","detail":"reusable 3-step debug workflow","session_id":"abc"}
```

### 查看状态

```bash
/evolve-status
```

或直接运行：

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" status
```

### 使用 jq 查询日志

```bash
# 检查最近的决策
cat ~/.claude/logs/self-evolution.jsonl | jq -r 'select(.event == "reviewer_decision")'

# 检查安全阻止
cat ~/.claude/logs/self-evolution.jsonl | jq -r 'select(.event | test("security|blocked"))'
```

---

## 故障排查

### 临时禁用插件

```bash
/plugin disable self-evolution

# 或设置一个很高的 nudge 间隔
export SELF_EVOLUTION_NUDGE_INTERVAL=999999

# 重新启用
/plugin enable self-evolution
```

### 重置插件状态

如果插件陷入不良状态：

```bash
# 删除状态文件（重置所有会话计数器和任务历史）
rm -f ~/.claude/plugins/data/self-evolution-self-evolution-marketplace/state.json

# 注意：~/.claude/skills/ 中已生成的技能不会被删除
# 您需要手动管理它们
```

### Companion 进程未生成

Stop hook 会生成 `claude -p` 作为独立的后台进程。如果审查未触发：

1. 检查 `claude` 是否在 PATH 中可用
2. 查看日志中的生成错误：`cat ~/.claude/logs/self-evolution.jsonl | jq -r 'select(.event | test("spawn|error"))'`
3. 验证运行时打包文件存在：`ls "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs"`

### 安全扫描误报

内容扫描器可能阻止匹配攻击模式的合法内容。解决方法：

1. 使用手动模式（`/evolve-review`）在创建前审查阻止原因
2. 编辑技能内容以避免匹配模式（例如，改写安全相关文档的措辞）
3. 如果技能过大，调整 `max_skill_size_kb`

---

## 架构

```
self-evolution/
├── dist/runtime.mjs          # esbuild 单文件打包（入口点）
├── src/                      # TypeScript 源码
│   ├── runtime.ts            # 命令路由器
│   ├── types.ts              # 共享类型定义
│   ├── commands/             # 7 个命令处理器
│   └── lib/                  # 核心库（state、security、logger、spawner、transcript）
├── hooks/hooks.json          # 纯命令钩子 → runtime.mjs
├── agents/skill-reviewer.md  # 使用 runtime 命令的轻量转发器
├── commands/                 # /evolve-review、/evolve-status
├── prompts/review-prompt.md  # companion 代理提示模板
├── skills/evolve-skill-writer/  # SKILL.md 生成的元技能
└── .claude-plugin/plugin.json   # 插件清单（v0.5.0）
```

关键设计决策（v0.5.0）：
- **TypeScript + esbuild** 替代 shell 脚本，提供类型安全和跨平台支持
- **纯命令钩子** 替代 AgentHook——所有钩子均为 `type: "command"`，无会话内代理
- **Companion mode**——Stop hook 生成独立的 `claude -p` 进程，从不阻塞主会话
- **安全扫描嵌入审查流程**——扫描在写入时由审查者内部执行，而非通过全局 PreToolUse 钩子

---

## 支持与反馈

- **问题**：通过项目的问题跟踪器报告错误或功能请求
- **讨论**：加入社区获取最佳实践和故障排查
- **贡献**：欢迎提交 PR 以改进元技能、安全扫描器或文档
