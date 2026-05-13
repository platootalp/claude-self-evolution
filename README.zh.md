# self-evolution

> 自动从对话中提取可复用工作流，生成 Claude 技能。

**版本：** 0.4.0
**许可证：** MIT
**兼容性：** Claude-Code v1.0.0+
**状态：** 稳定版（v4 生产版本）

---

## 功能介绍

self-evolution 插件自动从对话中提取可复用工作流，并将其转换为结构化的 Claude 技能。它支持两种运行模式：

- **自动模式**：通过 Stop hook 自动触发（默认每 10 次工具调用）
- **手动模式**：通过 `/evolve-review` 命令按需提取工作流

系统采用三层硬防护机制确保安全，并使用元技能（evolve-skill-writer）生成一致的技能内容。

### 核心特性

- **自动提取**：自动模式下无需人工干预
- **硬防护安全**：三层防御机制防止不良内容进入
- **元技能生成**：使用 evolve-skill-writer 确保生成规范完整的 SKILL.md 文件
- **JSONL 日志**：所有决策和操作都记录用于审计
- **回滚支持**：易于重置状态和回滚插件

---

## 两种模式：自动 vs 手动

| 特性           | 自动模式（Stop Hook）                                  | 手动模式（/evolve-review）                      |
| -------------- | ------------------------------------------------------ | ----------------------------------------------- |
| **触发方式**   | 会话结束后调用 ≥10 次工具时                            | 用户在会话中或结束后运行命令                    |
| **工作流程**   | `PostToolUse → Stop hook → AgentHook (90s)` → 创建技能 | `/evolve-review` → skill-reviewer 代理 → 元技能 |
| **超时限制**   | 90 秒总时长（hook 超时）                               | 无硬超时限制（代理模式）                        |
| **用户可见性** | 静默（不阻塞）                                         | 交互式（显示决策日志）                          |
| **适用场景**   | "设置后即可忘记"                                       | 在良好的对话后立即提取                          |
| **配置方式**   | `nudgeIntervalToolCalls` 设置                          | 命令行参数                                      |
| **安全机制**   | 同样的三层硬防护                                       | 同样的三层硬防护                                |

**使用建议：**

- 日常开发工作使用 **自动模式**，无需操心技能捕获
- 刚完成一个优秀的工作流时使用 **手动模式**，确保立即捕获

---

## 三层硬防护机制

Self-evolution 采用纵深防御策略，防止不良技能进入您的仓库：

### 第一层：频率门控（L1）

- **目的**：防止过度执行 hook 和产生噪声技能
- **机制**：跟踪会话中的工具调用次数；仅在达到 `nudgeIntervalToolCalls` 阈值（默认 10）时触发
- **配置**：plugin.json 中的 `settings.nudgeIntervalToolCalls` 或环境变量 `SELF_EVOLUTION_NUDGE_INTERVAL`
- **绕过**：无（硬防护）

### 第二层：路径白名单（L4）

- **目的**：限制技能安装到安全位置
- **机制**：security-scan.sh 在创建技能前验证所有路径
- **允许的路径**：
  - `~/.claude/skills/`（用户技能目录）
  - `~/.claude/plugins/`（插件目录）
  - 通用项目路径（如 `./src/`、`${PROJECT_ROOT}/...`）
- **阻止的路径**：
  - `~/.ssh/`、`~/.aws/`、`~/.bashrc`、`~/.zshrc`
  - `/etc/`、`/var/`、`/usr/`
  - 系统配置文件
- **绕过**：无（硬防护）

### 第三层：内容扫描器（L5）

- **目的**：检测生成的技能内容中的危险模式
- **机制**：security-scan.sh 在 Write/Edit 操作前扫描 SKILL.md 内容
- **检测内容**：
  - 提示注入："ignore previous instructions"、"you are now..."
  - Base64 编码注入（长度 ≥20 token）
  - 危险 bash：`rm -rf /`、`curl ... | sh`、`eval $(...)`
  - 密钥泄露：API 密钥、令牌、私钥、密码
  - 文件大小违规：>15KB（可通过 `maxSkillSizeBytes` 配置）
- **响应**：返回错误并中止操作
- **绕过**：无（硬防护）

**注意事项：**

- 三层防护按顺序执行；任何一层失败都会停止流程
- 安全事件记录到 JSONL 日志用于审计追踪
- 元技能（evolve-skill-writer）也执行自检（与 L3 冗余）

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

您应该在已安装插件列表中看到 `self-evolution v0.4.0`。

### 可选：配置设置

编辑已安装插件目录下的 `.claude-plugin/plugin.json`（位于 `~/.claude/plugins/cache/…` 下），或设置环境变量：

```bash
export SELF_EVOLUTION_NUDGE_INTERVAL=15  # 每 15 次工具调用触发，而非 10 次
export SELF_EVOLUTION_CATEGORY_WHITELIST="debug refactor test"  # 仅生成这些类别的技能
```

---

## 配置说明

所有设置都可以通过 `plugin.json` 或环境变量配置：

| 设置                     | 默认值                                                         | 描述                                                                          | 环境变量                            |
| ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| `nudgeIntervalToolCalls` | 10                                                             | 自动触发事件之间的工具调用次数                                                | `SELF_EVOLUTION_NUDGE_INTERVAL`     |
| `skillTargetScope`       | "user"                                                         | 技能安装位置："user" (~/.claude/skills/) 或 "plugin" (self-evolution/skills/) | `SELF_EVOLUTION_TARGET_SCOPE`       |
| `categoryWhitelist`      | ["debug","refactor","test","deploy","data","web","cli","meta"] | 允许的技能类别（由元技能强制执行）                                            | `SELF_EVOLUTION_CATEGORY_WHITELIST` |
| `maxSkillSizeBytes`      | 15360                                                          | 生成的 SKILL.md 文件的最大大小                                                | `SELF_EVOLUTION_MAX_SKILL_SIZE`     |
| `reviewerModel`          | "inherit"                                                      | skill-reviewer 代理使用的模型："inherit"（使用会话模型）或特定模型名称        | `SELF_EVOLUTION_REVIEWER_MODEL`     |
| `metaSkillName`          | "evolve-skill-writer"                                          | 生成 SKILL.md 内容的元技能名称                                                | N/A                                 |

**示例 plugin.json：**

```json
{
  "name": "self-evolution",
  "version": "0.4.0",
  "settings": {
    "nudgeIntervalToolCalls": 15,
    "skillTargetScope": "user",
    "categoryWhitelist": ["debug", "refactor", "test"],
    "maxSkillSizeBytes": 20480,
    "reviewerModel": "claude-3-5-sonnet",
    "metaSkillName": "evolve-skill-writer"
  }
}
```

**环境变量覆盖优先级：**
环境变量在运行时覆盖 plugin.json 设置。这对于无需编辑文件的会话级调整非常有用。

---

## 监控与日志（F7/F26）

### JSONL 日志结构

所有决策和安全事件都记录到插件目录中的 `data/self-evolution.jsonl`：

```json
{"timestamp":"2026-05-09T12:34:56Z","level":"info","event":"nudge_state","data":{"tool_calls":10,"decision":"trigger"}}
{"timestamp":"2026-05-09T12:35:12Z","level":"info","event":"skill_created","data":{"name":"debug-fastapi-5xx","path":"/Users/you/.claude/skills/debug-fastapi-5xx/SKILL.md"}}
{"timestamp":"2026-05-09T12:35:45Z","level":"warn","event":"security_scan","data":{"reason":"prompt_injection","blocked_content":"ignore previous instructions"}}
```

### 日志轮转（F45）

日志自动轮转以防止磁盘空间膨胀：

- **最大文件大小**：10MB
- **最大备份文件数**：5
- **轮转策略**：基于时间戳（如 `self-evolution.jsonl.2026-05-09T12:34:56Z`）
- **清理**：超出限制时删除最旧的备份

### 使用 jq 进行健康检查

从命令行监控插件健康状态：

```bash
# 检查最近的决策率（过去 24 小时）
cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
  jq -r 'select(.timestamp >= now - 86400) | .event' | \
  sort | uniq -c

# 检查安全事件
cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
  jq -r 'select(.level == "warn")'

# 检查技能创建成功率
cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
  jq -r 'select(.event == "skill_created")' | \
  wc -l
```

### 日志位置

- **插件日志**：`~/.claude/plugins/self-evolution/data/self-evolution.jsonl`
- **轮转备份**：`~/.claude/plugins/self-evolution/data/self-evolution.jsonl.*`
- **Hook 执行日志**：合并到 Claude-Code 的主 hook 日志中（可通过 `/log` 命令访问）

---

## 故障排查

### 临时禁用插件

要临时禁用 self-evolution 而不卸载：

```bash
# 禁用自动模式（Stop hook 不会触发）
/plugin disable self-evolution

# 或设置一个很高的 nudge 间隔
export SELF_EVOLUTION_NUDGE_INTERVAL=999999

# 重新启用
/plugin enable self-evolution
```

### 重置插件状态

如果插件陷入不良状态：

```bash
# 运行重置状态脚本
cd ~/.claude/plugins/self-evolution
./scripts/reset-state.sh --apply

# 这将删除：
# - data/nudge-state.json
# - data/trigger-flag-*.json
# - *.lock 文件

# 注意：~/.claude/skills/ 中已生成的技能不会被删除
# 您需要手动管理它们
```

### 误报处理（F3/F4/F28）

**场景**：插件生成了您不想要的技能，或者安全扫描器阻止了合法技能。

**解决方案：**

1. **删除不需要的技能**：

   ```bash
   rm -rf ~/.claude/skills/debug-fastapi-5xx  # 示例
   ```

2. **调整类别白名单**以减少噪声：

   ```bash
   export SELF_EVOLUTION_CATEGORY_WHITELIST="debug refactor"  # 仅生成 debug/refactor 技能
   ```

3. **增加 nudge 间隔**以降低频率：

   ```bash
   export SELF_EVOLUTION_NUDGE_INTERVAL=20  # 触发频率减半
   ```

4. **审查安全日志**以了解内容被阻止的原因：
   ```bash
   cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
     jq -r 'select(.level == "warn" and .event == "security_scan")'
   ```

**常见的误报场景：**

- **看起来危险的 bash 脚本**：合法的调试命令如 `docker logs` 可能包含 `rm` 或 `curl`。使用手动模式（`/evolve-review`）在创建技能前进行审查。
- **白名单之外的文件路径**：如果您的工作流引用 `~/projects/` 或其他自定义路径，请在创建后编辑生成的技能以通用化路径。
- **Base64 编码内容**：合法的 base64（如编码配置）超过 20 token 将被阻止。如果确实需要，请手动编辑技能。

### 生成不良技能

**场景**：创建了技能但有错误、不完整或误导性。

**解决方案：**

1. **手动编辑技能**：

   ```bash
   # 查找并编辑 SKILL.md
   code ~/.claude/skills/debug-fastapi-5xx/SKILL.md
   ```

2. **删除并重新生成**：

   ```bash
   rm -rf ~/.claude/skills/debug-fastapi-5xx
   # 触发类似的对话
   # 自动模式将重新生成；或使用 /evolve-review
   ```

3. **使用 skill-creator 进行迭代**：
   生成的技能是精简的（~50-200 行）。对于复杂的工作流，使用完整的 `skill-creator` 技能添加脚本、参考和迭代改进。

### Hook 超时

**场景**：Stop hook 超时（90 秒限制）且会话退出而没有创建技能。

**解决方案：**

1. **改用手动模式**：在对话期间（会话结束前）运行 `/evolve-review` 以避免超时。
2. **检查日志中的阻塞操作**：
   ```bash
   cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
     jq -r 'select(.event == "hook_timeout")'
   ```
3. **降低复杂性**：如果 skill-reviewer 代理耗时太长，请简化对话上下文（更少的工具调用）或使用更小上下文窗口的 `/evolve-review`。

---

## 升级指南（F25）

### 升级前

1. **备份现有技能**：

   ```bash
   cp -r ~/.claude/skills ~/.claude/skills.backup.$(date +%Y%m%d)
   ```

2. **备份插件数据**：

   ```bash
   tar czf self-evolution-backup-$(date +%Y%m%d).tar.gz ~/.claude/plugins/self-evolution
   ```

3. **禁用插件**：
   ```bash
   /plugin disable self-evolution
   ```

### 应用升级

```bash
# 导航到插件目录
cd /path/to/self-evolution-plugin

# 拉取最新更改（如果使用 git）
git pull origin main

# 或解压新版本 tarball
tar xzf self-evolution-v0.5.0.tar.gz

# 重新启用插件
/plugin enable self-evolution
```

### 验证升级

```bash
# 检查版本
/plugin list | grep self-evolution

# 运行测试对话（>10 次工具调用）
# 检查日志以确认成功创建技能
tail -f ~/.claude/plugins/self-evolution/data/self-evolution.jsonl
```

### 实现说明

- **向后兼容性**：v0.4.0→v0.5.0 向前兼容；现有技能继续工作
- **设置迁移**：Plugin.json 设置保留；新设置使用默认值
- **日志格式**：JSONL 模式稳定；新代码可读取旧日志
- **模式更改**：如果 frontmatter 模式更改，旧技能将被保留（无自动迁移）

---

## 回滚指南（F29）

### 插件回滚

要回滚到以前的版本：

```bash
# 禁用当前版本
/plugin disable self-evolution

# 从备份恢复
cd ~/.claude/plugins
rm -rf self-evolution
tar xzf self-evolution-backup-20260508.tar.gz

# 重新启用
/plugin enable self-evolution
```

### 状态恢复

如果升级损坏了状态文件：

```bash
# 重置插件状态（保留生成的技能）
cd ~/.claude/plugins/self-evolution
./scripts/reset-state.sh --apply

# 回滚日志
cp data/self-evolution.jsonl.2026-05-08T12:00:00Z data/self-evolution.jsonl
```

### 技能清理

要删除所有由 self-evolution 生成的技能（谨慎使用）：

```bash
# 列出 self-evolution 生成的技能（检查元技能来源）
find ~/.claude/skills -name "SKILL.md" -exec grep -l "evolve-skill-writer" {} \;

# 删除它们（建议手动验证）
# 审查上面的列表后取消注释
# find ~/.claude/skills -name "SKILL.md" -exec grep -l "evolve-skill-writer" {} \; \
#   -exec dirname {} \; | xargs rm -rf
```

**安全提示**：删除前请始终审查列表。一些手动创建的技能可能在注释中引用 evolve-skill-writer。

---

## 安全模型

Self-evolution 采用纵深防御的安全模型设计：

### 开源验证

- 所有代码都是开源且可审计的
- 插件源码：`~/.claude/plugins/self-evolution/`
- 元技能源码：`skills/evolve-skill-writer/SKILL.md`
- 安全扫描器：`scripts/security-scan.sh`（bash，易于审查）

**验证步骤：**

1. **审查 plugin.json**：确保 hook 指向可信脚本
2. **审计 security-scan.sh**：检查检测模式是否全面
3. **阅读 evolve-skill-writer**：了解技能如何生成
4. **监控 JSONL 日志**：定期审查安全事件

### 元技能作为真相来源

evolve-skill-writer 元技能是技能生成的权威来源：

- **声明式**：所有规则都在 SKILL.md 中记录（无隐藏逻辑）
- **自验证**：输出前强制执行质量检查清单
- **冗余安全**：内容安全检查重复 L3 硬防护
- **无评估**：非交互式设计；无外部代码执行

### PreToolUse hook 行为

全局 PreToolUse hook（`security-scan.sh`）在每次 Write/Edit/MultiEdit 操作前运行：

- **超时**：10 秒（硬限制）
- **范围**：会话中的所有文件写入，不仅仅是技能创建
- **失败模式**：如果 hook 失败，操作被阻止（故障安全）
- **审计**：所有安全事件都记录完整上下文

**重要提示**：PreToolUse hook 适用于所有工具调用，而不仅仅是 self-evolution。这是一个安全功能，不是限制。

---

## 状态：当前功能和路线图

### 已实现（v0.4.0）

| 功能                       | 状态 | 备注                                                |
| -------------------------- | ---- | --------------------------------------------------- |
| 自动模式（Stop hook）      | ✅   | 每 N 次工具调用触发                                 |
| 手动模式（/evolve-review） | ✅   | 按需创建技能                                        |
| 三层硬防护                 | ✅   | 频率、路径白名单、内容扫描器                        |
| 元技能生成                 | ✅   | evolve-skill-writer（v1：仅 SKILL.md）              |
| JSONL 日志                 | ✅   | 所有决策和安全事件                                  |
| 日志轮转                   | ✅   | 最大 10MB，5 个备份                                 |
| 重置状态脚本               | ✅   | 清理运行时状态而不删除技能                          |
| 8 类白名单                 | ✅   | debug、refactor、test、deploy、data、web、cli、meta |
| 大小限制执行               | ✅   | 最大 15KB（可配置）                                 |
| 安全事件日志               | ✅   | 所有 L5 阻止的 warn 级别                            |

### v5 路线图（计划中）

| 功能         | 状态 | 备注                           |
| ------------ | ---- | ------------------------------ |
| 自动技能测试 | 🔄   | 创建技能后进行评估             |
| 技能弃用     | 🔄   | 标记旧技能为过时               |
| 技能合并     | 🔄   | 自动合并相似技能               |
| 全局技能索引 | 🔄   | 所有技能的全文搜索             |
| 技能质量评分 | 🔄   | 根据使用情况和有效性为技能评分 |
| 交互式优化   | 🔄   | 用户反馈循环以改进生成的技能   |
| 多语言支持   | 🔄   | 生成不同语言的技能             |
| 技能模板     | 🔄   | 用户定义的模板以供自定义       |

---

## 已确认的残留风险（R2 审查）

以下风险已在 R2 安全审查中确定。已采取缓解措施，但用户应了解：

### F36：技能生成中的模型幻觉

**风险**：LLM 可能生成不正确或误导性的技能内容。

**缓解措施**：

- evolve-skill-writer 中的质量检查清单强制执行基本正确性
- 用户可以手动编辑/删除生成的技能
- 安全扫描器阻止危险模式
- 误报是可以接受的（阻止比允许不良内容更好）

**用户操作**：在关键工作流之前审查生成的技能。使用 `/evolve-review` 进行手动模式以预览技能。

### F38：通过生成的技能泄露凭证

**风险**：LLM 可能在生成的技能内容中包含机密（API 密钥、令牌、密码）。

**缓解措施**：

- L3 内容扫描器阻止类似机密的模式（但不是 100% 覆盖）
- evolve-skill-writer 包含明确的指令禁止包含私有数据
- 安全事件日志允许审核被阻止的内容
- 鼓励用户审查生成的技能

**用户操作**：在提交到版本控制之前检查生成的技能中是否存在机密。如果发现机密，请删除并重新生成。

### F39：通过技能名称进行路径遍历

**风险**：带有 `../` 的技能名称可以在预期目录之外写入文件。

**缓解措施**：

- L4 路径白名单在 Write/Edit 操作前验证所有路径
- security-scan.sh 明确阻止路径遍历模式
- 元技能强制执行命名约定（`<category>-<kebab-name>`）
- 所有路径在验证前都解析为绝对路径

**用户操作**：如果在日志中看到可疑路径，请运行 `./scripts/reset-state.sh --apply` 进行清理。

### F45：日志文件耗尽

**风险**：无限制的日志增长可能会填满磁盘空间。

**缓解措施**：

- 日志轮转（F45）将文件大小限制为 10MB 并保留 5 个备份
- JSONL 日志已压缩用于归档
- 重置状态脚本可以在需要时删除日志
- 用户可以手动轮转或归档日志

**用户操作**：监控 `~/.claude/plugins/self-evolution/data/` 中的磁盘使用情况。如果日志增长太大，请手动删除或归档旧备份。

---

## 支持与反馈

- **问题**：通过项目的问题跟踪器报告错误或功能请求
- **讨论**：加入社区获取最佳实践和故障排查
- **贡献**：欢迎提交 PR 以改进元技能、安全扫描器或文档

**版本历史：**

- v0.4.0 (2026-05-09)：生产版本，包含三层硬防护、元技能生成和全面日志记录
- v0.3.0 (2026-05-01)：仅手动模式的 Beta 版本
- v0.1.0 (2026-04-15)：初始原型

---

**祝技能狩猎愉快！** 🚀
