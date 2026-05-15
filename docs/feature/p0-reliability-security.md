# P0: 可靠性 + 安全

> 优先级 0 — 防止插件静默崩溃或创建不安全技能的功能。

## 背景

计数器重置和防嵌套是可靠性缺陷（而非增强）— 没有它们，nudge 系统会误计数，审查进程可能递归。威胁模式、结构检查和 Unicode 检测是安全基础设施 — 当前 4 个正则模式仅覆盖 15 个攻击类别中的 4 个。

## 范围内功能

### F1：Skill 工具使用时计数器重置

**问题：** 即使 Agent 已经具备技能意识，计数器仍在递增，导致误触发 nudge。

**方案：** 在 `post-tool-use` 中，检查 `tool_name` 是否为 `Skill` 或 `skill_manage` → 将计数器重置为 0。

**实现：**
- 解析 `PostToolUseInput` 中的 `tool_name` 字段
- 当 `tool_name` 匹配 skill 相关工具时，调用 `incrementCount()` 传入重置标志，或 `saveState()` 设 count=0
- Hermes 在 `skill_manage` 使用时将 `_iters_since_skill` 重置为 0

### F2：审查进程防嵌套

**问题：** 审查子进程会重新触发所有 hooks（SessionStart、PostToolUse、Stop），导致双重计数甚至递归审查。

**方案：** 向 spawned `claude -p` 传递环境变量 `SELF_EVOLUTION_REVIEW_MODE=1`。Hooks 检测到后跳过计数/nudge。

**实现：**
- 在 `spawner.ts` 中，向 spawn env 添加 `SELF_EVOLUTION_REVIEW_MODE: "1"`
- 在 `post-tool-use` 命令中，检查 `process.env.SELF_EVOLUTION_REVIEW_MODE` — 若存在，提前退出
- 在 `stop-gate` 命令中，同样检查 — 若存在，永不 spawn 审查
- Hermes 等价做法：将 forked agent 的两个 nudge interval 设为 0

### F2：审查进程迭代限制

**问题：** 审查进程无 token 消耗上限。异常审查可能无限运行。

**方案：** 为 spawned `claude -p` 命令添加 `--max-turns` 标志。

**实现：**
- 在 `spawner.ts` 中，向 spawn 参数添加 `--max-turns 8`（对应 Hermes 的 `max_iterations=8`）
- 可通过 `config.yaml` → `review_max_turns` 配置（默认 8）

### F17：威胁模式扩展（P0 类别）

**问题：** 当前 4 个模式缺失 11 个攻击类别。5 个最高风险类别完全未覆盖。

**方案：** 为 5 个 P0 类别新增约 30 个模式。

**P0 类别：**

| 类别 | 风险 | 示例模式 |
|------|------|---------|
| 持久化 | 高 | `crontab`、`.bashrc` 修改、`authorized_keys`、`systemd`、`launchd`、`at` 命令 |
| 网络攻击 | 高 | 反向 shell（`/dev/tcp/`）、隧道（`ngrok`、`cloudflared`）、硬编码 IP:端口、`socat` |
| 命令执行 | 高 | `subprocess`、`os.system`、`os.exec`、`child_process.exec`、带用户输入的 `eval()` |
| 路径穿越 | 高 | `../../../`、`/etc/passwd`、`/proc/self`、`/root/.ssh` |
| 数据外泄 | 高 | `curl $TOKEN`、`os.environ` 管道外传、DNS 外泄、Markdown 图片外泄（`![...](https://attacker.com/...`）、环境变量日志、`/proc/self/environ` |

**实现：**
- 将 `security.ts` 模式重构为结构化数据：`{ id, severity, category, pattern, description }`
- 模式存储为对象数组，扫描时迭代所有模式
- 每个模式含 `severity: "dangerous" | "caution" | "safe"`，为未来信任策略集成做准备
- 对每个新模式增加 base64 解码后扫描（已有 4 个模式已支持）

### F18：结构检查

**问题：** 无二进制文件、符号链接、文件数量/大小检查。恶意 skill 可能包含可执行文件或指向 skill 目录外的符号链接。

**方案：** 在 `security-scan` 中添加结构校验。

**检查项：**
- 拒绝二进制文件：`.exe`、`.dll`、`.so`、`.dylib`、`.bin`
- 拒绝指向 skill 目录外的符号链接
- 文件数量上限：每个 skill ≤50
- 总大小上限：每个 skill ≤1 MB
- 单文件大小上限：≤256 KB

**实现：**
- 在 `security-scan` 中，当路径为目录时扫描其内容
- 检查文件扩展名是否在二进制黑名单中
- 使用 `fs.lstat` 检测符号链接，解析后检查目标是否在 skill 目录内
- 累加文件大小和数量以检查限制

### F19：不可见 Unicode 检测

**问题：** 零宽/方向覆盖/BOM 字符可以在不改变可见内容的情况下改变 skill 渲染行为。攻击者可嵌入隐藏指令。

**方案：** 在 `security-scan` 中增加 Unicode 模式检测。

**检测项：**
- 零宽字符：U+200B、U+200C、U+200D、U+FEFF（BOM）
- 零宽连字/非连字：U+200D、U+200C
- 方向覆盖：U+202A-U+202E（LTR/RTL 嵌入、覆盖）
- 函数应用：U+2061、U+2062、U+2063、U+2064
- 其他不可见：U+00AD（软连字符）、U+034F（组合字素连接符）

**实现：**
- 添加 `UNICODE_PATTERN` 正则匹配上述码点
- 扫描 skill 内容查找匹配
- 严重等级：`caution`（可能合法但可疑）

## 范围外（延后）

| 功能 | 层级 | 原因 |
|------|------|------|
| F16 verify-skill 命令 | P1 | 依赖校验逻辑（F11、F12） |
| F20 信任策略 | P2 | 无外部 skill 来源时无意义 |
| F17 剩余类别（越狱、供应链、权限提升、Agent 配置篡改、加密挖矿、外泄服务） | P1-P2 | 风险低于 P0 类别 |

## 依赖

无 — 所有 P0 功能可独立实现。

## 验收标准

1. Agent 使用 `Skill` 工具时计数器重置为 0
2. 审查子进程不会递增计数器或触发二次审查
3. 审查子进程在 N 轮后终止（可配置，默认 8）
4. 安全扫描检测所有 5 个 P0 类别的模式（持久化、网络、执行、路径穿越、数据外泄）
5. 安全扫描拒绝二进制文件、skill 目录外的符号链接、超大 skill
6. 安全扫描检测不可见 Unicode 字符
