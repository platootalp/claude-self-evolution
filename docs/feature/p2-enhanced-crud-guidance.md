# P2：增强 CRUD + 行为引导

> 优先级 2 — 增强插件创建和管理 skill 的能力，并使 Agent 主动建议 skill 创建。

## 背景

行为引导使 Agent 主动建议 skill 创建/更新。增强委托路线在不构建并行 CRUD 系统的前提下增加对 skill 操作的控制力。信任策略在外部来源存在后变得有意义。辅助文件支持使 skill 更丰富。

## 关键设计决策：CRUD 选择 Route B（增强委托）

不构建可能与 Claude Code 内置 Skill 工具冲突的并行 CRUD 系统，而是增强现有委托模型：

1. `evolve-skill-writer` meta-skill 获得更严格的格式规则
2. `validate-skill` 命令（来自 P1）提供写入后校验
3. `security-scan` 路径白名单扩展以支持辅助文件
4. Reviewer prompt 包含质量清单

这避免了平台冲突并保持实现成本低，代价是依赖 Agent 遵循指引（而非程序化保证）。

## 范围内功能

### F27：行为引导（系统提示）

**问题：** Agent 从不主动建议创建或更新 skill。插件仅在 Stop 时通过 nudge 被动响应。

**方案：** 添加引导使 Agent 在复杂工作流后建议 skill 创建。

**实现：**
- 在 `agents/skill-reviewer.md` 中添加"技能引导"部分，指示 reviewer：
  - 在复杂多步骤工作流后主动建议保存 skill
  - 当工作流与已有 skill 矛盾时建议更新
  - 引用 `evolve-skill-writer` meta-skill 进行生成
- 可选：在 `session-start` hook 中输出一行引导信息（需评估可行性 — 可能过于嘈杂）

### F28：工具 Schema 描述引导

**问题：** 无法修改 Claude Code 内置 `Skill` 工具的 schema 来嵌入创建/更新触发器。

**方案：** 记录为平台限制。通过 review-prompt.md 质量标准和 `evolve-skill-writer` meta-skill 间接引导。

**实现：**
- 无代码变更 — 仅为文档说明
- `evolve-skill-writer` meta-skill 的描述已包含触发短语（"Use this skill whenever..."）
- 未来：若插件构建自有 `skill-manage` 工具，可在其 schema 描述中嵌入引导

### F5-F7：Skill CRUD（增强委托）

**问题：** 对 create/edit/patch 质量无程序化控制。所有操作依赖 Agent 遵循 meta-skill 指引。

**方案（Route B）：** 用更强的护栏增强现有委托模型。

**增强项：**
- **Create（F5）：** `evolve-skill-writer` meta-skill 已处理。增强：
  - Write 后强制调用 `validate-skill`
  - 类别白名单强制（已存在）
  - Frontmatter schema 强制（来自 P1 F11）
- **Edit（F6）：** 当前为全量重写。增强：
  - Reviewer prompt 指示 agent 先读取已有 skill
  - `evolve-skill-writer` 更新模式递增版本（已存在）
  - 编辑后调用 `validate-skill` + `verify-skill`
- **Patch（F7）：** 当前不支持。添加：
  - Reviewer prompt 可指示 agent 进行定向编辑
  - Claude Code 的 Edit 工具处理实际 patching
  - Patch 后调用 `verify-skill`
  - 无模糊匹配（与 Hermes 不同）— 依赖 Claude Code 的 Edit 工具进行内容匹配

**不构建的内容：**
- 无 `skill_manage` 工具（会与 Claude Code 的 `Skill` 工具冲突）
- 无模糊匹配库
- 无原子写入层（委托给 Claude Code 的 Write/Edit 工具）

### F8：Skill 删除

**问题：** 无法删除插件创建的 skill。

**方案：** 添加 `/evolve-skill-delete` slash 命令。

**实现：**
- 新命令 `commands/evolve-skill-delete.md`
- 校验 skill 存在于 `~/.claude/skills/<name>/`
- 用户确认（slash 命令为交互式）
- 通过 `rm -rf` 移除 skill 目录
- 通过 `log-decision` 记录删除，动作为 `DELETED`

### F9-F10：辅助文件管理

**问题：** Skills 只能包含 SKILL.md。无法包含 `references/`、`templates/` 或脚本。

**方案：** 扩展 security-scan 路径白名单并更新 evolve-skill-writer。

**允许的辅助路径：**
- `~/.claude/skills/<name>/SKILL.md`（已有）
- `~/.claude/skills/<name>/references/**`（新增）
- `~/.claude/skills/<name>/templates/**`（新增）

**不允许：**
- skill 目录外的任意文件类型或路径
- 可执行脚本（安全风险）

**实现：**
- 更新 `security.ts` 中 `scanWrite` 的路径白名单
- 添加文件类型限制：辅助目录仅允许 `.md`、`.txt`、`.yaml`、`.yml`、`.json`
- 更新 `evolve-skill-writer` meta-skill 提及辅助文件支持
- P0 的结构检查（F18）适用：文件数 ≤50，总大小 ≤1MB

### F15：原子写入

**问题：** Skill 写入通过 Claude Code 的 Write 工具，无原子性保证。写入中途崩溃可能产生半成品文件。

**方案：** 在增强委托模型中，这是平台依赖。Claude Code 的 Write 工具处理写入。如果未来构建自有 CRUD 层，将实现 `tempfile + rename`。

**实现：**
- P2 中无代码变更
- 记录为已知限制
- P1 的 `verify-skill` 命令提供软安全网：若写入损坏，校验失败，reviewer 可重试

### F20：信任策略（agent-created 级别）

**问题：** 所有 skill 无论来源均一视同仁。无法根据信任级别应用不同安全策略。

**方案：** 短期：将所有插件创建的 skill 标记为 `agent-created` 信任级别，应用基本策略。

**信任级别（短期，1 级）：**

| 级别 | safe | caution | dangerous |
|------|------|---------|-----------|
| agent-created | 允许 | 允许 | 阻止 |

**实现：**
- `evolve-skill-writer` meta-skill 在 frontmatter 中添加 `trust: agent-created`
- `security-scan` 读取 `trust` 字段并应用策略：
  - `safe` 严重等级模式：始终允许
  - `caution` 严重等级模式：agent-created 允许
  - `dangerous` 严重等级模式：始终阻止
- 未来：Hub（F26）实现后添加 `community` 和 `trusted` 级别

### F17：威胁模式扩展（P2 类别）

**问题：** P0+P1 后仍有 2 个攻击类别未覆盖。

**P2 类别：**

| 类别 | 风险 | 示例模式 |
|------|------|---------|
| 加密挖矿 | 低 | `xmrig`、`monero`、`stratum+tcp`、`minerd`、`cpuminer` |
| 外泄服务 | 低 | `webhook.site`、`pastebin.com`、`requestbin.com`、`hastebin.com` |

**实现：**
- 向结构化模式数组新增约 10 个模式
- 严重等级：`dangerous`

## 范围外（延后）

| 功能 | 层级 | 原因 |
|------|------|------|
| F26 Hub 外部安装 | P3 | 受限于生态基础设施 |
| F21 LRU 索引缓存 | P3 | 可能不需要；Claude Code 处理 skill 加载 |
| F5-F7 自有 CRUD 层（Route A） | 延后 | 已选择增强委托（Route B） |

## 依赖

- F5-F7 依赖 F11 + F12（P1 的校验逻辑）
- F20 依赖 frontmatter 的 `trust` 字段（F11）
- F9-F10 依赖 security-scan 路径白名单变更（P0 的 F18）
- F17 P2 模式依赖 P0 模式基础设施

## 验收标准

1. Agent 偶尔在复杂工作流后建议 skill 创建（通过 reviewer 引导）
2. `evolve-skill-writer` 强制 frontmatter schema 和类别白名单
3. Reviewer 在每次 Write/Edit 后调用 `validate-skill` + `verify-skill`
4. Skills 可包含 `references/` 和 `templates/` 辅助文件（仅 `.md`、`.txt`、`.yaml`、`.yml`、`.json`）
5. 所有插件创建的 skill 在 frontmatter 中有 `trust: agent-created`
6. 安全扫描应用信任策略：dangerous 模式始终阻止
7. `/evolve-skill-delete` 命令确认后删除 skill
8. 安全扫描覆盖全部 15 个类别（P0 + P1 + P2）
