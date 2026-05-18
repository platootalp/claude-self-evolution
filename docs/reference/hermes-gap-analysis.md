# Self-Evolution vs Hermes Skills Evolution: 功能点差异对照

> 对照 Hermes 的 28 个功能点 (F1-F28)，逐项分析 self-evolution 插件的当前实现状态、差距，以及未来演进方向。

## 对照总览

| F# | 模块 | 功能点 | 当前状态 | 差距等级 | 演进方向 |
|:--:|:----:|--------|---------|:--------:|---------|
| F1 | 触发与审查 | Skill Nudge 计数触发器 | **部分** | 🟡 中 | 计数器精细化 |
| F2 | | 后台审查 Fork 机制 | **部分** | 🟡 中 | 审查进程增强 |
| F3 | | 审查 Prompt 选择策略 | **无** | 🔴 高 | 多策略审查 |
| F4 | | 审查结果摘要输出 | **极简** | 🟡 中 | 结构化输出 |
| F5 | Skill CRUD | Skill 创建 (create) | **无** | 🔴 高 | 自有 CRUD 层 |
| F6 | | Skill 编辑 (edit) | **无** | 🔴 高 | 自有 CRUD 层 |
| F7 | | Skill 补丁 (patch) | **无** | 🔴 高 | 自有 CRUD 层 |
| F8 | | Skill 删除 (delete) | **无** | 🟡 中 | 自有 CRUD 层 |
| F9 | | 辅助文件写入 (write_file) | **无** | 🟡 中 | 辅助文件管理 |
| F10 | | 辅助文件删除 (remove_file) | **无** | 🟢 低 | 辅助文件管理 |
| F11 | 格式与校验 | YAML Frontmatter 格式校验 | **无** | 🔴 高 | 格式校验层 |
| F12 | | 命名规范校验 | **无** | 🟡 中 | 格式校验层 |
| F13 | | 内容大小限制 | **部分** | 🟢 低 | 调整默认值 |
| F14 | | 跨目录碰撞检测 | **无** | 🟡 中 | 格式校验层 |
| F15 | | 原子写入 | **部分** | 🟡 中 | 统一原子写入 |
| F16 | 安全扫描 | 安全扫描 + 自动回滚 | **无** | 🔴 高 | 回滚机制 |
| F17 | | 100+ 威胁模式正则检测 | **极简** | 🔴 高 | 威胁模式扩展 |
| F18 | | 结构性检查 | **无** | 🔴 高 | 结构性检查 |
| F19 | | 不可见 Unicode 检测 | **无** | 🟡 中 | Unicode 检测 |
| F20 | | 4 级信任策略 | **无** | 🟡 中 | 信任策略 |
| F21 | 发现与加载 | Skill 索引缓存 (LRU+磁盘) | **无** | 🟡 中 | 索引缓存 |
| F22 | | Slash 命令扫描与注册 | **无** | 🟢 低 | 依赖平台能力 |
| F23 | | 模板变量替换 | **部分** | 🟢 低 | 扩展模板变量 |
| F24 | | 内联 Shell 展开 | **无** | 🟢 低 | 低优先级 |
| F25 | | 配置注入 | **无** | 🟢 低 | 低优先级 |
| F26 | | Hub 外部安装 | **无** | 🔴 高 | Hub 生态 |
| F27 | 行为引导 | 系统提示技能引导 | **无** | 🟡 中 | 行为引导 |
| F28 | | 工具 Schema 描述引导 | **无** | 🟢 低 | 行为引导 |

差距等级说明：🔴 高 = 核心能力缺失，影响安全/可靠性；🟡 中 = 功能缺失，影响体验/效率；🟢 低 = 锦上添花，可延后。

---

## 模块一：触发与审查 (F1-F4)

### F1. Skill Nudge 计数触发器

**Hermes 实现：**
- 基于工具迭代次数的计数器 `_iters_since_skill`
- Agent 主动使用 `skill_manage` 时重置计数器
- 仅当 `skill_manage` 在可用工具列表中时才计数
- 频率可配置 (`config.yaml` → `skills.creation_nudge_interval`)，设 0 禁用

**Self-evolution 当前实现：**
- `post-tool-use` 命令通过 `incrementCount()` 递增计数器
- `nudge_interval` 默认 10（与 Hermes 一致）
- 存储在 `state.json` 的 session state 中

**差距：**
1. **无计数器重置机制**：当 Agent 主动使用 skill 相关工具时，Hermes 会重置计数器，说明 Agent 已有技能意识无需后台推动。我们的插件没有检测 Agent 主动使用 Skill 工具的事件，无法重置。
2. **无工具可用性前置检查**：Hermes 仅当 `skill_manage` 在可用工具中时才计数，避免无效计数。我们无条件计数。
3. **计数粒度不同**：Hermes 在每次工具迭代时 +1（即每次 Agent 调用任何工具），我们在 PostToolUse hook 中 +1。效果等价，但实现路径不同。

**演进方向：**
- 在 `PostToolUseInput` 中增加 `tool_name` 字段
- 当 `tool_name` 为 `Skill` 或 `skill_manage` 时重置计数器
- 可选：增加 `valid_tools` 字段用于前置检查

### F2. 后台审查 Fork 机制

**Hermes 实现：**
- 创建独立 `AIAgent` 实例，共享 MemoryStore
- `max_iterations=8` 限制迭代
- `quiet_mode=True` 静默
- 禁用嵌套 Nudge（两个 interval 设为 0）
- daemon 线程，主进程退出时自动终止

**Self-evolution 当前实现：**
- `stop-gate` 通过 `spawner.spawnReviewProcess()` 生成 detached `claude -p` 子进程
- 使用 `child_process.spawn()` + `detached: true` + `unref()`
- 无迭代限制（依赖 Claude 自身的 max_tokens）
- 无共享状态（审查结果通过 `log-decision` 命令写回）
- 无嵌套 Nudge 禁用（审查子进程会重新触发 hooks）

**差距：**
1. **审查进程会触发自身的 hooks**：由于审查进程是独立的 `claude -p`，它会触发 SessionStart/PostToolUse/Stop hooks，导致审查进程的工具调用被计数，甚至触发二次审查。Hermes 通过禁用嵌套 Nudge 解决。
2. **无迭代限制**：审查进程可能消耗过多 token。Hermes 限制 8 次迭代。
3. **无静默模式**：审查进程的输出可能干扰主会话。
4. **无共享状态**：审查结果需要通过显式的 `log-decision` 命令写回，不如 Hermes 的共享 MemoryStore 直接。

**演进方向：**
- 审查子进程传递环境变量 `SELF_EVOLUTION_REVIEW_MODE=1`，hooks 检测到后跳过计数
- 在 spawner 中设置 `--max-turns` 限制迭代
- 通过 `log-decision` 写回结果（当前方案可行，无需改为共享状态）

### F3. 审查 Prompt 选择策略

**Hermes 实现：**
- 根据触发类型选择不同 prompt：Skill Nudge → `_SKILL_REVIEW_PROMPT`，Memory Nudge → `_MEMORY_REVIEW_PROMPT`，两者同时 → `_COMBINED_REVIEW_PROMPT`
- Skill 审查关注：非平凡方法、试错过程、经验性发现、用户期望偏差

**Self-evolution 当前实现：**
- 只有单一 `review-prompt.md` 模板
- 无 Memory Nudge 概念（不管理记忆，只管理技能）
- 审查标准简单：reusable (>=3 steps), generalizable, no one-off data

**差距：**
1. **单一 prompt**：无法根据不同场景调整审查策略
2. **审查标准较粗**：只有 ">=3 steps" 这一个量化标准，缺少 "试错过程"、"经验性发现" 等定性判断

**演进方向：**
- 增加审查 prompt 变体：skill-focused / combined
- 丰富审查标准：增加试错检测、经验性发现、用户纠正等维度
- 可选：增加 Memory 审查（长期演进）

### F4. 审查结果摘要输出

**Hermes 实现：**
- 扫描审查 Agent 的工具消息，提取 created/updated 操作
- 输出紧凑摘要：`💾 Skill 'debug-fastapi-5xx' created`

**Self-evolution 当前实现：**
- `log-decision` 记录 CREATED/UPDATED/SKIPPED 到 JSONL 和 stats.json
- 无结构化摘要输出

**差距：**
1. **无运行时摘要**：审查结果只记录到文件，不回显给用户
2. **无操作提取**：不解析审查进程的工具消息，依赖审查进程主动调用 `log-decision`

**演进方向：**
- 在 stop-gate 的 jobPromise 回调中，解析审查进程的输出/exit code
- 输出简短摘要到主会话（需评估是否可行，取决于 Claude Code hooks 机制）

---

## 模块二：Skill CRUD (F5-F10)

### F5-F10. 完整 CRUD 操作

**Hermes 实现：**
- `skill_manage` 工具提供 7 种操作：create, edit, patch, delete, write_file, remove_file
- 每种操作有完整的校验链：命名 → 分类 → frontmatter → 大小 → 碰撞 → 安全扫描 → 回滚
- patch 操作使用模糊匹配 (fuzzy_match.py)，容忍空白差异

**Self-evolution 当前实现：**
- **完全委托**：技能的创建/编辑/删除由审查 Agent 通过 Claude Code 的内置 `Skill` 工具完成
- 插件自身不提供 CRUD 操作
- 安全扫描在 Write 之前通过 `security-scan` 命令执行，但仅做 pre-write 门控

**差距：**
1. **无自有 CRUD 层**：所有 Skill 操作依赖 Claude Code 的 Skill 工具，无法控制格式、命名、碰撞等
2. **无 patch 操作**：大改和小改都是全量重写，效率低
3. **无辅助文件管理**：skills 只能包含 SKILL.md，不能有 references/templates/scripts 等辅助文件
4. **无模糊匹配**：更新技能时需要精确匹配旧内容，失败率高

**演进方向（两条路线）：**

**路线 A：自有 CRUD 层（Hermes 路线）**
- 新增 `skill-manage` 命令（或工具），提供 create/edit/patch/delete 操作
- 优点：完全控制格式、安全、原子性
- 缺点：与 Claude Code 的 Skill 系统可能冲突，维护成本高

**路线 B：增强审查 Agent 的指导（推荐）**
- 保持委托模式，但增强 review-prompt.md 中的格式规范和操作指引
- 增加 frontmatter 校验命令（`validate-skill`），审查 Agent 在写入后调用
- 优点：不与平台冲突，实现成本低
- 缺点：依赖 Agent 遵循指引，不如自有 CRUD 层可靠

---

## 模块三：格式与校验 (F11-F15)

### F11. YAML Frontmatter 格式校验

**Hermes 实现：**
- 必须以 `---` 开头和闭合
- YAML 必须可解析为 dict
- `name` 和 `description` 字段必填
- frontmatter 后必须有正文

**Self-evolution 当前实现：**
- 无任何 frontmatter 校验
- 依赖 `evolve-skill-writer` meta-skill 生成的格式

**差距：** 完全缺失。如果 Agent 生成的 SKILL.md 格式不规范，无法检测。

**演进方向：** 新增 `validate-skill` 命令，解析 frontmatter 并校验必填字段。审查 Agent 在写入后调用。

### F12. 命名规范校验

**Hermes 实现：**
- 正则 `^[a-z0-9][a-z0-9._-]*$`，≤64 字符

**Self-evolution 当前实现：**
- 无命名校验
- security.ts 只检查路径格式 (`^[^/]+\/SKILL\.md$`)

**差距：** 完全缺失。不合法的 skill 名称可能导致加载问题。

**演进方向：** 在 `validate-skill` 命令中增加命名正则校验。

### F13. 内容大小限制

**Hermes 实现：**
- SKILL.md ≤100,000 字符（~36K tokens）
- 辅助文件 ≤1 MiB
- Skill 总大小 ≤1 MB
- 单文件 ≤256 KB
- 文件数 ≤50

**Self-evolution 当前实现：**
- `max_skill_size` 默认 15360 字节（~15KB），远小于 Hermes 的 100K
- 无辅助文件大小限制
- 无总大小/文件数限制

**差距：** 限制过于保守且不完整。

**演进方向：**
- 调整 `max_skill_size` 默认值至 100,000
- 增加总大小和文件数限制（如果支持辅助文件）

### F14. 跨目录碰撞检测

**Hermes 实现：**
- `_find_skill(name)` 在所有目录（含外部）中搜索同名 skill

**Self-evolution 当前实现：**
- 无碰撞检测

**差距：** 可能创建与已有 skill 同名的新 skill，导致覆盖。

**演进方向：** 在 `validate-skill` 命令中扫描 `~/.claude/skills/` 检查重名。

### F15. 原子写入

**Hermes 实现：**
- `tempfile.mkstemp` + `os.replace`，崩溃安全

**Self-evolution 当前实现：**
- `state.ts` 中使用 `temp-file + rename`（`saveStateAtomic`）
- Skill 写入由 Claude Code 的 Write 工具完成，无原子性保证

**差距：** Skill 文件写入无原子性保证。如果写入中途崩溃，可能产生半成品文件。

**演进方向：** 如果走自有 CRUD 路线，需实现原子写入。如果保持委托模式，依赖 Claude Code 的 Write 工具。

---

## 模块四：安全扫描 (F16-F20)

> 这是差距最大的模块。当前只有 4 个正则模式，Hermes 有 ~85 个覆盖 15 个类别。

### F16. 安全扫描 + 自动回滚

**Hermes 实现：**
- 每次写入后立即扫描
- 不通过则自动回滚：create → rmtree, edit → 恢复原始内容, patch → 恢复被 patch 文件

**Self-evolution 当前实现：**
- 扫描在写入**之前**执行（pre-write gate）
- 无回滚机制（如果绕过 gate 写入，无法恢复）

**差距：**
1. **时机不同**：pre-write vs post-write。Hermes 的 post-write + rollback 更安全，因为可以捕获写入过程中引入的问题
2. **无回滚**：如果扫描通过但写入后发现问题，无法恢复

**演进方向：**
- 保持 pre-write gate（Claude Code hooks 机制限制，无法在 Write 之后介入）
- 增加写入后校验命令（`verify-skill`），审查 Agent 在写入后调用
- 如果校验失败，审查 Agent 自动删除/恢复

### F17. 威胁模式正则检测

**Hermes 实现（~85 个模式，15 个类别）：**

| # | 类别 | 示例模式 | 当前覆盖 |
|---|------|---------|---------|
| 1 | 数据泄露 | `curl $TOKEN`, `os.environ`, DNS 外泄, Markdown 图片泄露 | ❌ 无 |
| 2 | 提示注入 | "ignore previous instructions", 角色劫持 | ✅ 部分 (PI_PATTERN) |
| 3 | 越狱 | DAN mode, developer mode | ❌ 无 |
| 4 | 破坏性操作 | `rm -rf /`, `chmod 777`, `mkfs` | ✅ 部分 (BASH_PATTERN) |
| 5 | 持久化 | `crontab`, `.bashrc`, `authorized_keys`, `systemd`, `launchd` | ❌ 无 |
| 6 | 网络攻击 | 反向 shell, 隧道, 硬编码 IP:端口 | ❌ 无 |
| 7 | 混淆 | base64 解码管道, `eval()`/`exec()`, hex 编码 | ✅ 部分 (base64 scan) |
| 8 | 执行 | `subprocess`, `os.system`, Node `child_process` | ❌ 无 |
| 9 | 路径穿越 | `../../../`, `/etc/passwd`, `/proc` | ❌ 无 |
| 10 | 加密挖矿 | `xmrig`, `monero`, `stratum+tcp` | ❌ 无 |
| 11 | 供应链 | `curl|sh`, 未锁定版本安装, `git clone` | ❌ 无 |
| 12 | 权限提升 | `allowed-tools`, `sudo`, `setuid` | ❌ 无 |
| 13 | 凭证暴露 | 硬编码密钥, 嵌入私钥 | ✅ 部分 (SECRET_PATTERN) |
| 14 | Agent 配置篡改 | 修改 AGENTS.md/CLAUDE.md 等 | ❌ 无 |
| 15 | 外泄服务 | webhook.site, pastebin | ❌ 无 |

**Self-evolution 当前实现：** 4 个模式覆盖 4 个类别（提示注入、危险 bash、凭证泄露、base64 混淆）。

**差距：** 缺失 11 个类别，已有类别的模式也远不如 Hermes 丰富。

**演进方向：** 分阶段扩展威胁模式库：
- **P0（立即）**：持久化、网络攻击、执行、路径穿越 — 这些是最高风险的攻击向量
- **P1（短期）**：数据泄露、越狱、供应链、权限提升、Agent 配置篡改
- **P2（中期）**：加密挖矿、外泄服务
- 每个模式存储为结构化数据：`{ id, severity, category, pattern, description }`

### F18. 结构性检查

**Hermes 实现：**
- 文件数 ≤50, 总大小 ≤1MB, 单文件 ≤256KB
- 禁止二进制文件 (.exe/.dll/.so 等)
- 禁止符号链接指向目录外
- 非脚本文件不应有执行位

**Self-evolution 当前实现：** 无结构性检查。

**差距：** 完全缺失。恶意 skill 可能包含二进制文件或超大量文件。

**演进方向：** 新增 `check-structure` 命令，在 skill 写入后执行。

### F19. 不可见 Unicode 检测

**Hermes 实现：**
- 检测 18 种零宽/方向覆盖/BOM 字符
- 防止隐藏注入攻击

**Self-evolution 当前实现：** 无 Unicode 检测。

**差距：** 完全缺失。攻击者可在 skill 中嵌入不可见字符，改变渲染行为。

**演进方向：** 在 `security-scan` 中增加 Unicode 检测模式。

### F20. 四级信任策略

**Hermes 实现：**

| 信任等级 | safe | caution | dangerous |
|----------|------|---------|-----------|
| builtin | allow | allow | allow |
| trusted | allow | allow | block |
| community | allow | block | block |
| agent-created | allow | allow | block (ask→block) |

**Self-evolution 当前实现：** 无信任等级。所有 skill 一视同仁。

**差距：** 完全缺失。无法根据来源区分安全策略。

**演进方向：**
- 短期：所有通过本插件创建的 skill 标记为 `agent-created`，使用最宽松策略（caution 允许，dangerous 阻断）
- 长期：支持外部安装（Hub），引入完整信任策略

---

## 模块五：发现与加载 (F21-F26)

### F21. Skill 索引缓存

**Hermes 实现：**
- 双层缓存：进程内 LRU (8 条) + 磁盘快照
- Manifest 有效性验证（mtime + size）
- skill 操作后清除缓存

**Self-evolution 当前实现：** 无索引缓存。依赖 Claude Code 的内置 Skill 加载。

**差距：** 完全缺失。但 Claude Code 已有 Skill 加载机制，插件层面可能不需要。

**演进方向：** 评估是否需要在插件层面维护索引。如果 Claude Code 的 Skill 加载足够快，可以跳过。

### F22. Slash 命令扫描与注册

**Hermes 实现：**
- 扫描 skill 目录，为每个 skill 注册 `/skill-name` 命令

**Self-evolution 当前实现：**
- 通过 `commands/` 目录定义 `/evolve-review` 和 `/evolve-status`
- Skill 的 slash 命令由 Claude Code 的内置机制注册

**差距：** 无差距。Claude Code 已内置此能力。

**演进方向：** 无需额外工作，依赖平台能力。

### F23-F25. 模板变量替换 / 内联 Shell / 配置注入

**Hermes 实现：**
- `${HERMES_SKILL_DIR}` / `${HERMES_SESSION_ID}` 变量替换
- `` !`cmd` `` 内联 Shell 展开
- 从 `config.yaml` 注入配置值

**Self-evolution 当前实现：**
- spawner 中有 `${CLAUDE_PLUGIN_ROOT}` 等变量替换
- 无 Skill 级别的变量替换
- 无内联 Shell 展开
- 无配置注入

**差距：** 部分缺失。但这些是 Skill 加载时的功能，由 Claude Code 的 Skill 系统负责。

**演进方向：** 低优先级。如果 Claude Code 的 Skill 系统支持模板变量，则无需在插件层面实现。

### F26. Hub 外部安装

**Hermes 实现：**
- GitHub / ClawHub / Marketplace 多源安装
- quarantine + 安全扫描
- 不同来源使用不同信任策略

**Self-evolution 当前实现：** 无外部安装能力。

**差距：** 完全缺失。但这是生态级功能，短期不需要。

**演进方向：**
- 中期：支持从 GitHub 仓库安装 skill
- 长期：支持多源安装 + 信任策略

---

## 模块六：行为引导 (F27-F28)

### F27. 系统提示技能引导

**Hermes 实现：**
- `SKILLS_GUIDANCE` 注入系统提示
- 引导 Agent 在复杂任务后主动保存技能
- 引导 Agent 发现技能过时时立即 patch
- 仅在 `skill_manage` 工具可用时注入

**Self-evolution 当前实现：**
- 无系统提示引导
- `evolve-skill-writer` meta-skill 提供了生成 SKILL.md 的能力，但没有主动引导

**差距：** 缺少主动引导。Agent 不会主动提议保存技能或更新已有技能。

**演进方向：**
- 在 `agents/skill-reviewer.md` 中增加行为引导 prompt
- 或者在 `session-start` hook 中输出一条引导信息

### F28. 工具 Schema 描述引导

**Hermes 实现：**
- `SKILL_MANAGE_SCHEMA` 的 description 中内嵌创建/更新时机、质量标准

**Self-evolution 当前实现：** 无。

**差距：** 缺少。但由于我们使用 Claude Code 的内置 Skill 工具，无法修改其 schema。

**演进方向：** 如果走自有 CRUD 路线，需在工具描述中内嵌引导。否则通过 review-prompt.md 间接实现。

---

## 演进路线图

### Phase 1: 安全加固 (P0)

**目标：** 将安全扫描从 4 个模式扩展到覆盖最高风险的攻击向量。

| 功能 | 优先级 | 估计工作量 |
|------|--------|-----------|
| 威胁模式扩展：持久化、网络攻击、执行、路径穿越 | P0 | 中 |
| 结构性检查（文件数、大小、二进制、符号链接） | P0 | 小 |
| 不可见 Unicode 检测 | P1 | 小 |
| 写入后校验命令 (`verify-skill`) | P1 | 小 |
| 信任策略框架（agent-created 级别） | P1 | 中 |

### Phase 2: 审查增强 (P1)

**目标：** 提升审查的精确性和可靠性。

| 功能 | 优先级 | 估计工作量 |
|------|--------|-----------|
| 审查进程防嵌套（环境变量标记） | P0 | 小 |
| 审查迭代限制（`--max-turns`） | P0 | 小 |
| 多策略审查 prompt（skill-focused / combined） | P1 | 小 |
| 计数器重置（检测 Skill 工具使用） | P1 | 小 |
| 审查结果结构化输出 | P2 | 中 |

### Phase 3: 格式与校验 (P2)

**目标：** 确保 SKILL.md 格式规范、命名合法、无碰撞。

| 功能 | 优先级 | 估计工作量 |
|------|--------|-----------|
| Frontmatter 格式校验 (`validate-skill`) | P1 | 小 |
| 命名规范校验 | P1 | 小 |
| 跨目录碰撞检测 | P2 | 小 |
| 调整 `max_skill_size` 默认值 | P2 | 极小 |
| 原子写入（自有 CRUD 路线下） | P2 | 中 |

### Phase 4: 生态扩展 (P3)

**目标：** 支持更丰富的 skill 生态。

| 功能 | 优先级 | 估计工作量 |
|------|--------|-----------|
| 行为引导（系统提示/agent prompt） | P1 | 小 |
| Skill CRUD（自有或增强委托） | P2 | 大 |
| 辅助文件管理 | P2 | 中 |
| Hub 外部安装 | P3 | 大 |
| 索引缓存 | P3 | 中 |

---

## 关键设计决策

### 决策 1：自有 CRUD vs 增强委托

| 维度 | 自有 CRUD | 增强委托 |
|------|----------|---------|
| 控制力 | 完全控制格式、安全、原子性 | 依赖 Agent 遵循指引 |
| 与平台兼容性 | 可能与 Claude Code Skill 系统冲突 | 完全兼容 |
| 实现成本 | 高（需实现完整 CRUD + 校验 + 原子写入） | 低（增加校验命令 + prompt 引导） |
| 可靠性 | 高（程序化保证） | 中（依赖 Agent 行为） |

**推荐：** 短期走增强委托路线，长期评估是否需要自有 CRUD。

### 决策 2：Pre-write gate vs Post-write + rollback

| 维度 | Pre-write gate | Post-write + rollback |
|------|---------------|----------------------|
| 安全性 | 依赖扫描完整性 | 可捕获写入后问题 |
| Claude Code 兼容性 | 天然适配（hooks 机制） | 需要额外机制 |
| 实现复杂度 | 低 | 高（需备份+恢复） |

**推荐：** 保持 pre-write gate，增加写入后校验命令作为补偿。

### 决策 3：信任策略范围

短期只需 `agent-created` 一个级别（所有通过本插件创建的 skill）。中期引入 `community`（Hub 安装）。长期考虑完整四级。

---

## 附录：当前实现细节

### security.ts 当前模式

```typescript
// 1. 提示注入 (PI_PATTERN)
/(?:ignore previous|disregard above|<\||system:.*you are now|dump.*database|forget.*instructions)/i

// 2. 危险 bash (BASH_PATTERN)
/rm -rf \/(?: |$)|curl[^|]*\| *(?:ba)?sh|eval\s+\$\(|wget[^|]*-O\s*-/

// 3. 凭证泄露 (SECRET_PATTERN)
/(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9]{36})/

// 4. Base64 解码扫描（在解码后重新匹配上述 3 个模式）
```

### config.ts 当前配置

```json
{
  "nudge_interval": 10,
  "max_skill_size": 15360,
  "review_model": "sonnet",
  "platform": "auto",
  "category_whitelist": ["debug", "refactor", "test", "deploy", "data", "web", "cli", "meta"],
  "meta_skill_name": "evolve-skill-writer",
  "log_level": "info"
}
```
