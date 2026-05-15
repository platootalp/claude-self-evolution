# P1：审查质量 + 格式门控

> 优先级 1 — 提升审查产出质量并确保生成的 skill 格式正确。

## 背景

多 Prompt 和结构化输出使审查更有针对性和可观测性。Frontmatter/命名/碰撞校验确保生成的 skill 格式规范且不会与已有 skill 冲突。verify-skill 命令提供写入后安全网。P1 威胁模式填补剩余高风险缺口。

## 范围内功能

### F3：多 Prompt 审查策略

**问题：** 单一 `review-prompt.md` 无法区分"应创建新 skill？"还是"应更新已有 skill？"。Hermes 使用 3 种 prompt 变体。

**方案：** 添加 prompt 变体；spawner 根据上下文选择。

**Prompt 列表：**
- `review-prompt-skill.md` — 聚焦 skill 创建（非平凡方法、试错过程、经验性发现、用户期望偏差）
- `review-prompt-update.md` — 聚焦 skill 更新（已有 skill 过时、新工作流与已有 skill 矛盾）
- `review-prompt-combined.md` — 创建和更新都相关时使用

**实现：**
- 在 `prompts/` 中创建 3 个 prompt 文件
- 在 `spawner.ts` 中，spawn 前检查是否有已有 skill 与 transcript 主题重叠
- 选择对应 prompt；不确定时回退到 combined
- Reviewer agent 的 `maxTurns` 和 `effort` 保持不变

### F4：结构化审查输出

**问题：** 审查结果仅写入 JSONL 文件，从不向用户展示。用户对插件行为无感知。

**方案：** 在 stop-gate 作业回调中，解析审查输出并记录一行摘要。

**实现：**
- 审查子进程完成后，解析 stdout 中的 `CREATED:`、`UPDATED:`、`SKIPPED:` 模式
- 通过 `logEvent("review_summary", { action, name, rationale })` 记录摘要
- 在 `status` 命令中包含最新审查摘要
- 注：Claude Code hooks 可能不支持向主会话返回数据，因此摘要写入日志和 `status` 命令，而非直接展示给用户

### F11：YAML Frontmatter 格式校验

**问题：** 无任何校验 — 格式不规范的 SKILL.md 在加载时静默失败。

**方案：** 新增 `validate-skill` 命令，解析并校验 frontmatter。

**校验规则：**
- 第 1 行必须以 `---` 开头
- YAML 块后必须有闭合 `---`
- YAML 必须解析为 dict（非标量/数组）
- `name` 字段：必填，非空字符串
- `description` 字段：必填，非空字符串
- 闭合 `---` 后必须有正文

**实现：**
- 新命令 `src/commands/validate-skill.ts`
- 使用轻量 YAML 解析器（或简单正则提取 frontmatter 块）
- 返回 `{ valid: boolean, errors: string[] }`
- Reviewer 在 Write 后调用 `validate-skill`

### F12：命名规范校验

**问题：** 非标准命名导致加载问题。无任何校验。

**方案：** 在 `validate-skill` 中增加命名正则校验。

**校验规则：**
- 正则：`^[a-z0-9][a-z0-9._-]*$`
- 最大长度：64 字符
- 必须与目录名匹配（即 `~/.claude/skills/foo-bar/SKILL.md` 的 `name` 必须为 `foo-bar`）

**实现：**
- 作为 `validate-skill` 命令的一部分
- 从 frontmatter 提取 `name`，用正则校验
- 从路径提取目录名，验证一致性

### F13：大小限制调整

**问题：** 当前 `max_skill_size` 默认 15KB — 相比 Hermes 的 100K 字符过于保守。无总大小和文件数限制。

**方案：** 调整默认值并添加限制。

**新默认值：**
- `max_skill_size`：100,000 字符（从 15,360 字节上调）
- `max_total_size`：1,048,576 字节（1 MB）每个 skill 目录
- `max_file_count`：每个 skill 目录 50 个文件
- `max_single_file`：262,144 字节（256 KB）

**实现：**
- 更新 `config.ts` 默认值
- 更新 `security-scan` 以在路径为目录时检查总大小和文件数
- 在 config schema 中添加 `max_total_size`、`max_file_count`、`max_single_file`

### F14：跨目录碰撞检测

**问题：** 创建与已有 skill 同名的新 skill 会静默覆盖。

**方案：** 在 `validate-skill` 中扫描名称冲突。

**实现：**
- 扫描 `~/.claude/skills/` 目录
- 若已存在同名 skill（在不同目录），返回警告
- CREATE 操作：碰撞为错误（阻止）
- UPDATE 操作：碰撞为预期（允许）

### F16：verify-skill 命令（写入后校验）

**问题：** Pre-write 门控无法捕获写入过程中引入的问题。无写入后验证。

**方案：** 新增 `verify-skill` 命令，在写入后运行 security-scan + validate-skill。

**实现：**
- 新命令 `src/commands/verify-skill.ts`
- 对已写入路径调用 `security-scan`
- 对已写入内容调用 `validate-skill`
- 任一失败则返回 `{ verified: false, errors: [...] }`
- Reviewer 在 Write 后调用 `verify-skill`，若校验失败则删除已写入文件
- 这是"软回滚"机制：由 reviewer 执行清理，而非插件

### F17：威胁模式扩展（P1 类别）

**问题：** P0 之后仍有 4 个攻击类别未覆盖。

**P1 类别：**

| 类别 | 风险 | 示例模式 |
|------|------|---------|
| 越狱 | 中 | "DAN mode"、"developer mode"、"STAN"、"jailbreak"、角色劫持短语 |
| 供应链 | 中 | `curl \| sh`、无版本锁定的 `pip install`、不可信来源的 `npm install -g`、`git clone` 到可执行路径 |
| 权限提升 | 中 | `allowed-tools` 注入、命令中的 `sudo`、`setuid`、`chmod +s` |
| Agent 配置篡改 | 中 | 修改 `AGENTS.md`、`CLAUDE.md`、`.claude/` 配置文件 |

**实现：**
- 向结构化模式数组新增约 20 个模式（扩展 P0 基础设施）
- 严重等级：`dangerous` 和 `caution` 混合

## 范围外（延后）

| 功能 | 层级 | 原因 |
|------|------|------|
| F20 信任策略 | P2 | 无外部 skill 来源时无意义 |
| F17 剩余类别（加密挖矿、外泄服务） | P2 | 风险较低 |
| F5-F7 skill CRUD | P2 | 已选择增强委托路线 |
| F15 原子写入 | P2 | 仅自有 CRUD 层才相关 |

## 依赖

- F16（verify-skill）依赖 F11 + F12（校验逻辑需先存在）
- F17 P1 模式依赖 F17 P0 模式基础设施（结构化模式数组）

## 验收标准

1. Reviewer 根据上下文使用不同 prompt（新建 vs 更新 vs 组合）
2. 一行审查摘要出现在会话日志和 `status` 命令输出中
3. `validate-skill` 拒绝格式错误的 frontmatter、无效命名、名称碰撞
4. `max_skill_size` 默认值为 100,000；总大小、文件数、单文件限制已执行
5. `verify-skill` 捕获写入后问题并触发 reviewer 清理
6. 安全扫描覆盖 15 个类别中的 9 个（P0 + P1）
