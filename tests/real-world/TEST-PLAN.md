# Self-Evolution v4 真实环境测试方案

> 覆盖 Task 1, 15, 16 — 需要真实 Claude-Code 环境执行的验证任务。
> 文档版本: 0.4.0-testplan
> 创建日期: 2026-05-09

---

## 目录

1. [测试目标概览](#1-测试目标概览)
2. [前置条件](#2-前置条件)
3. [Task 1: SkillTool 可行性验证](#3-task-1-skilltool-可行性验证)
4. [Task 15: AgentHook 内 SkillTool 实测](#4-task-15-agenthook-内-skilltool-实测)
5. [Task 16: 端到端验证（10 个场景）](#5-task-16-端到端验证10-个场景)
6. [故障排查手册](#6-故障排查手册)
7. [验收标准](#7-验收标准)

---

## 1. 测试目标概览

| 任务 | 目标 | 风险等级 | 预计耗时 |
|------|------|----------|----------|
| **Task 1** | 验证 SkillTool 在最小 AgentHook 中可被正确调用 | 高 | 30 min |
| **Task 15** | 验证完整 Stop Hook 链（gate → agent → cleanup）在真实环境中工作 | 高 | 45 min |
| **Task 16** | 自动模式 + 手动模式各触发 5 次 skill 生成，验证端到端流程 | 中 | 2-3 h |

**关键风险点：**
- Claude-Code v2.1.79 的 AgentHook 引擎可能有未文档化的行为变更
- `SkillTool` 在 `type: agent` hook 内的可用性尚未验证（核心假设）
- Hook 变量替换（`${CLAUDE_PLUGIN_ROOT}`, `${session_id}`）可能不工作
- 90s timeout 对于 skill 生成可能不足

---

## 2. 前置条件

### 2.1 环境检查清单

在运行测试前，确认以下环境就绪：

```bash
# E1: Claude-Code CLI 版本
claude --version  # 期望: >= 2.1.0

# E2: 插件目录可写
ls -la ~/.claude/plugins/

# E3: skills 目录可写
mkdir -p ~/.claude/skills && touch ~/.claude/skills/.write-test && rm ~/.claude/skills/.write-test

# E4: jq 可用
jq --version  # 期望: >= 1.6

# E5: 日志目录可写
mkdir -p ~/.claude/logs

# E6: 测试用的 skill 目录不存在（避免冲突）
ls ~/.claude/skills/ | grep -E "^(debug-|refactor-|test-|deploy-|data-|web-|cli-|meta-)" || true
```

### 2.2 备份

```bash
# 备份现有 skills（重要！）
cp -r ~/.claude/skills ~/.claude/skills.backup.$(date +%Y%m%d_%H%M%S)

# 备份插件配置
cp ~/.claude/plugins/installed_plugins.json ~/.claude/plugins/installed_plugins.json.backup.$(date +%Y%m%d)
```

### 2.3 插件安装

```bash
# 进入测试工作树
cd /Users/lijunyi/road/harness-code/.worktrees/self-evolution-v4/claude-self-evolution

# 方式 1: 通过文件 URI 安装（推荐，用于开发测试）
claude /plugin marketplace add file:///Users/lijunyi/road/harness-code/.worktrees/self-evolution-v4/claude-self-evolution

# 方式 2: 或者直接复制到插件缓存目录（绕过 marketplace）
# cp -r . ~/.claude/plugins/cache/local/self-evolution/0.4.0

# 安装插件
claude /plugin install self-evolution

# 验证安装
claude /plugin list | grep self-evolution
```

### 2.4 配置调整（测试期间）

为加速测试，临时降低触发阈值：

```bash
# 编辑 plugin.json，将 nudgeIntervalToolCalls 从 10 改为 3
# 这样只需要 3 次 tool call 就会触发 Stop hook
cat ~/.claude/plugins/self-evolution/plugin.json | jq '.settings.nudgeIntervalToolCalls = 3' > /tmp/plugin-test.json
mv /tmp/plugin-test.json ~/.claude/plugins/self-evolution/plugin.json
```

### 2.5 清理状态

```bash
# 清理之前测试残留的状态
~/.claude/plugins/self-evolution/scripts/reset-state.sh --apply --quiet

# 清理可能残留的测试 skills（确认备份后再执行！）
# ls ~/.claude/skills/ | grep -E "test-|debug-|refactor-" | xargs -I{} rm -rf ~/.claude/skills/{}
```

---

## 3. Task 1: SkillTool 可行性验证

### 3.1 目标

验证在 `type: agent` 的 Stop Hook 中，Agent 能否成功调用 `SkillTool`。

这是整个 self-evolution 的核心假设：如果 AgentHook 中的 agent 无法调用 SkillTool，
自动路径就无法生成 skill。

### 3.2 测试原理

创建一个**最小化的测试插件**，其 Stop Hook 只有一个 `type: agent`，该 agent 的 prompt 指示它调用 `SkillTool('evolve-skill-writer', 'test')`。观察：

1. AgentHook 是否正常触发？
2. Agent 是否能理解 prompt 中的 SkillTool 调用？
3. SkillTool 是否返回结果？

### 3.3 测试步骤

#### Step 1: 创建最小测试插件

```bash
TEST_PLUGIN="$HOME/.claude/plugins/test-skilltool-hook"
mkdir -p "$TEST_PLUGIN"

cat > "$TEST_PLUGIN/plugin.json" << 'EOF'
{
  "name": "test-skilltool-hook",
  "version": "0.0.1",
  "hooksPath": "hooks.json"
}
EOF

cat > "$TEST_PLUGIN/hooks.json" << 'EOF'
{
  "Stop": [
    {
      "hooks": [
        {
          "type": "agent",
          "prompt": "This is a minimal test. Please call SkillTool with name 'evolve-skill-writer' and any argument. Report whether the call succeeded or failed, and what the result was. Output your findings as plain text.",
          "timeout": 30,
          "model": "inherit"
        }
      ]
    }
  ]
}
EOF
```

#### Step 2: 安装并启用测试插件

```bash
claude /plugin install test-skilltool-hook
claude /plugin enable test-skilltool-hook
```

#### Step 3: 触发 Stop Hook

```bash
# 启动一个 Claude 会话，执行至少 3 次 tool call 后退出
# 方式: 直接启动 claude，然后让它做一些简单操作
claude

# 在 Claude 会话中:
# > 请读取当前目录的 README.md
# > 请列出当前目录的文件
# > 请查看 .gitignore
# > /exit
```

#### Step 4: 观察输出

在 Claude 退出时，观察 Stop Hook 的输出：

**期望的输出模式：**
```
[evolve: reviewing]  # 或者你设置的状态消息
Agent output: ...
# Agent 应该报告 SkillTool 调用成功，并显示返回内容
```

**关键观察点：**

| 观察项 | 期望 | 如果失败 |
|--------|------|----------|
| AgentHook 触发 | 看到状态消息 | 检查 plugin.json 路径 |
| Agent 执行 prompt | 看到 Agent 的输出 | 检查 timeout 是否足够 |
| SkillTool 可用 | Agent 报告 "SkillTool called" | **核心假设失败，需回退方案** |
| SkillTool 返回结果 | 返回内容非空 | 检查 meta-skill 是否安装 |

#### Step 5: 清理测试插件

```bash
claude /plugin disable test-skilltool-hook
claude /plugin uninstall test-skilltool-hook
rm -rf "$HOME/.claude/plugins/test-skilltool-hook"
```

### 3.4 回退方案

如果 SkillTool 在 AgentHook 中不可用：

1. **方案 A**: 改用 Agent 直接调用 `Write` tool 生成 SKILL.md（绕过 meta-skill）
   - 修改 `agents/skill-reviewer.md`，移除 SkillTool 调用，改为让 agent 直接生成内容
   - 风险：生成质量下降，需要更多测试

2. **方案 B**: 将 `type: agent` 改为 `type: command`，用外部脚本调用 Claude API 生成 skill
   - 需要 API key 和额外配置
   - 复杂度增加

3. **方案 C**: 放弃自动路径，仅保留手动路径（`/evolve-review`）
   - 用户需要手动触发 skill 生成
   - 功能降级但最稳定

### 3.5 验收标准

- [ ] AgentHook 成功触发（看到状态消息）
- [ ] Agent 成功调用 SkillTool
- [ ] SkillTool 返回非空结果
- [ ] 测试插件可干净卸载

---

## 4. Task 15: AgentHook 内 SkillTool 实测

### 4.1 目标

在**完整的 self-evolution 插件**中，验证 Stop Hook 的三步序列能否正确工作：

```
Stop[0]: stop-gate.sh (3s)     → 消费 nudge 状态，写 trigger flag
Stop[1]: AgentHook (90s)       → 读取 flag，review 对话，调用 meta-skill，写 skill
Stop[2]: stop-gate.sh --cleanup (2s) → 删除 trigger flag
```

### 4.2 测试设计

使用**可控的、可预测的对话内容**，确保 reviewer agent 能够识别出可重用的工作流。

#### 对话设计原则

1. **≥ 3 个逻辑步骤** — 确保通过 skill-reviewer 的 CREATE 阈值
2. **通用化** — 不包含用户特定数据
3. **清晰的工具调用链** — 便于 reviewer 识别模式

### 4.3 测试场景 A: 自动路径（Stop Hook 触发）

#### Step 1: 配置测试环境

```bash
# 降低触发阈值以加速测试
export SELF_EVOLUTION_NUDGE_INTERVAL=3

# 清理旧状态
~/.claude/plugins/self-evolution/scripts/reset-state.sh --apply --quiet

# 监控日志
tail -f ~/.claude/logs/self-evolution.jsonl &
LOG_PID=$!
```

#### Step 2: 执行测试对话

启动 Claude 会话，执行以下对话（确保 ≥3 次 tool call）：

```
用户: 请帮我创建一个简单的 Python 项目结构，包含 src/、tests/、README.md
[Claude 执行: Bash mkdir, Write README.md, Write src/__init__.py]

用户: 请在 src/ 下添加一个计算斐波那契数列的模块
[Claude 执行: Write src/fibonacci.py]

用户: 请为斐波那契模块添加单元测试
[Claude 执行: Write tests/test_fibonacci.py, Bash pytest]

用户: /exit
```

#### Step 3: 观察 Stop Hook 执行

在 `/exit` 后，观察：

```
# 期望的输出序列:
[evolve: gate]        # Stop[0] 执行
[evolve: reviewing]   # Stop[1] AgentHook 启动
...
# 90s 内 Agent 应该完成 review 并生成 skill
[evolve: cleanup]     # Stop[2] 执行
```

#### Step 4: 验证结果

```bash
# 检查是否生成了 skill
ls -la ~/.claude/skills/ | grep -E "(debug-|test-|refactor-|deploy-)"

# 检查日志
jq -r 'select(.event == "reviewer_decision") | {ts, decision, detail}' ~/.claude/logs/self-evolution.jsonl | tail -5

# 检查 trigger flag 是否被清理
ls ~/.claude/plugins/self-evolution/data/trigger-flag-*.json 2>/dev/null || echo "Flag cleaned up"
```

### 4.4 测试场景 B: 手动路径（/evolve-review）

#### Step 1: 执行测试对话（同上）

#### Step 2: 手动触发 review

在会话中（不退出）执行：

```
用户: /evolve-review
```

#### Step 3: 观察输出

期望看到：
- skill-reviewer agent 启动
- 分析对话内容
- 决策（CREATE / UPDATE / SKIP）
- 如果 CREATE：调用 evolve-skill-writer，生成 SKILL.md

#### Step 4: 验证结果

```bash
# 同上：检查 skills 目录、日志、质量
```

### 4.5 关键验证点

| 检查项 | 验证命令 | 期望结果 |
|--------|----------|----------|
| nudge-state 正确计数 | `cat ~/.claude/plugins/self-evolution/data/nudge-state.json` | tool_calls >= 3 |
| trigger flag 被创建 | `ls data/trigger-flag-*.json` | 文件存在 |
| trigger flag 被清理 | `ls data/trigger-flag-*.json` | 文件不存在（Stop[2] 后） |
| skill 被生成 | `ls ~/.claude/skills/` | 新增 `<category>-<name>/` 目录 |
| SKILL.md 通过质量检查 | `verify-skill-quality.sh ~/.claude/skills/<name>/SKILL.md` | 全部通过 |
| 日志记录完整 | `jq 'select(.event == "reviewer_decision")' ...jsonl` | 有决策记录 |

### 4.6 验收标准

- [ ] Stop[0] gate 成功消费 nudge 状态并创建 trigger flag
- [ ] Stop[1] AgentHook 成功读取 flag 并启动 review
- [ ] Agent 成功调用 SkillTool('evolve-skill-writer', ...)
- [ ] 生成的 SKILL.md 通过 verify-skill-quality.sh 全部检查
- [ ] Stop[2] cleanup 成功删除 trigger flag
- [ ] 手动路径 /evolve-review 同样成功
- [ ] 日志中 reviewer_decision 记录正确

---

## 5. Task 16: 端到端验证（10 个场景）

### 5.1 目标

在真实使用场景中，验证自动模式和手动模式各 5 次 skill 生成的完整流程。

### 5.2 测试矩阵

#### 自动模式（5 个场景）

每个场景需要 ≥3 次 tool call 的完整对话，然后退出触发 Stop Hook。

| # | 场景 | 预期 Category | 复杂度 | 预期结果 |
|---|------|--------------|--------|----------|
| 1 | Python 项目结构初始化（mkdir + Write files） | `cli` | 低 | CREATE |
| 2 | FastAPI 错误调试（Read logs + Analyze + Fix） | `debug` | 中 | CREATE |
| 3 | React 组件重构（Read + Edit + Test） | `refactor` | 中 | CREATE |
| 4 | 数据清洗脚本（Read CSV + Transform + Write） | `data` | 中 | CREATE |
| 5 | Docker 多阶段构建（Write Dockerfile + Build） | `deploy` | 中 | CREATE |

#### 手动模式（5 个场景）

在对话中执行 `/evolve-review`。

| # | 场景 | 预期 Category | 复杂度 | 预期结果 |
|---|------|--------------|--------|----------|
| 6 | 单元测试模式（写 test + run pytest + fix） | `test` | 低 | CREATE |
| 7 | API 设计审查（Read spec + Design + Write） | `web` | 中 | CREATE |
| 8 | Git 工作流操作（branch + commit + merge） | `cli` | 低 | CREATE |
| 9 | Skill 创建工作流（meta 操作） | `meta` | 高 | SKIP（太 meta） |
| 10 | 一次性的数据查询（Read + 特定查询） | — | 低 | SKIP（不够通用） |

### 5.3 场景 1 详细步骤（模板，其他场景类似）

#### 场景 1: Python 项目结构初始化

```bash
# 准备测试目录
mkdir -p /tmp/evolve-test-scenario-1
cd /tmp/evolve-test-scenario-1

# 启动 Claude
claude
```

对话内容：
```
用户: 请帮我初始化一个 Python 项目，包含 src/ 包目录、tests/ 测试目录、
     README.md、pyproject.toml 和 .gitignore

[Claude 预期动作:]
- Bash: mkdir -p src/myapp tests
- Write: README.md
- Write: pyproject.toml
- Write: src/myapp/__init__.py
- Write: .gitignore

用户: 请为项目添加一个简单的 CLI 入口点，支持 --version 和 --help

[Claude 预期动作:]
- Write: src/myapp/cli.py
- Edit: pyproject.toml (add entry point)

用户: 请添加一个测试验证 CLI 可以正常导入

[Claude 预期动作:]
- Write: tests/test_cli.py
- Bash: python -m pytest tests/

用户: /exit
```

验证：
```bash
# 等待 Stop Hook 完成（最多 90s）
sleep 95

# 检查生成的 skill
ls ~/.claude/skills/ | grep -E "cli-|deploy-|meta-"

# 验证 skill 质量
for skill in ~/.claude/skills/*-*/; do
    ~/.claude/plugins/self-evolution/scripts/verify-skill-quality.sh "$skill/SKILL.md" --strict
done

# 检查日志
jq -r 'select(.event == "reviewer_decision") | "\(.ts) \(.decision): \(.detail)"' \
    ~/.claude/logs/self-evolution.jsonl | tail -10
```

### 5.4 批量验证脚本

为加速验证，提供批量检查脚本：

```bash
#!/bin/bash
# tests/real-world/verify-batch.sh — 批量验证生成的 skills

echo "=== Generated Skills ==="
ls -la ~/.claude/skills/ | grep -E "^-" -v | tail -n +2

echo ""
echo "=== Quality Check ==="
FAILED=0
for skill_dir in ~/.claude/skills/*-*/; do
    name=$(basename "$skill_dir")
    if [ -f "$skill_dir/SKILL.md" ]; then
        if ~/.claude/plugins/self-evolution/scripts/verify-skill-quality.sh "$skill_dir/SKILL.md" > /dev/null 2>&1; then
            echo "  [PASS] $name"
        else
            echo "  [FAIL] $name"
            FAILED=$((FAILED + 1))
        fi
    else
        echo "  [MISSING] $name/SKILL.md"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "=== Decision Log ==="
jq -r 'select(.event == "reviewer_decision") | "\(.ts) | \(.decision) | \(.detail)"' \
    ~/.claude/logs/self-evolution.jsonl | tail -20

echo ""
echo "=== Summary ==="
echo "Failed quality checks: $FAILED"
```

### 5.5 验收标准

- [ ] 自动模式 5 个场景中 ≥3 个成功 CREATE
- [ ] 手动模式 5 个场景中 ≥3 个成功 CREATE
- [ ] 所有生成的 skills 通过 verify-skill-quality.sh
- [ ] 没有安全扫描拦截（除非测试故意触发）
- [ ] 日志中 reviewer_decision 记录完整
- [ ] 没有残留的 trigger-flag 文件
- [ ] 用户可手动删除任何生成的 skill

---

## 6. 故障排查手册

### 6.1 AgentHook 不触发

**现象**: 退出 Claude 时没有看到 `[evolve: gate]` 状态消息。

**排查步骤：**
```bash
# 1. 检查插件是否启用
claude /plugin list | grep self-evolution

# 2. 检查 plugin.json 路径
ls ~/.claude/plugins/self-evolution/plugin.json

# 3. 检查 hooks.json 是否存在
ls ~/.claude/plugins/self-evolution/hooks/hooks.json

# 4. 手动测试 stop-gate.sh
echo '{"session_id": "test", "transcript_path": "/tmp/test.json"}' | \
    ~/.claude/plugins/self-evolution/scripts/stop-gate.sh

# 5. 检查 nudge-state.json 是否存在且 tool_calls 足够
cat ~/.claude/plugins/self-evolution/data/nudge-state.json
```

### 6.2 SkillTool 调用失败

**现象**: Agent 报告 "SkillTool not available" 或类似错误。

**可能原因和方案：**

| 原因 | 诊断 | 解决方案 |
|------|------|----------|
| Claude-Code 版本不支持 | `claude --version` < 2.1 | 升级 Claude-Code |
| meta-skill 未安装 | `ls ~/.claude/plugins/self-evolution/skills/` | 检查 evolve-skill-writer 是否存在 |
| Agent 权限不足 | 查看 agent prompt 中的 `tools` 字段 | 确保 `Skill` 在 allowed-tools 中 |
| Hook timeout 太短 | Agent 在 90s 内未完成 | 增加 timeout 或简化 prompt |

### 6.3 变量替换失败

**现象**: Agent 收到字面量 `${CLAUDE_PLUGIN_ROOT}` 而不是实际路径。

**排查：**
```bash
# 检查环境变量
echo $CLAUDE_PLUGIN_ROOT

# 如果为空，手动设置
export CLAUDE_PLUGIN_ROOT="$HOME/.claude/plugins/self-evolution"
```

**Agent 回退逻辑**（已在 prompt 中内置）：
```
If your tool calls receive the literal strings '${CLAUDE_PLUGIN_ROOT}' ...
fall back to: read $CLAUDE_PLUGIN_ROOT from environment via Bash
```

### 6.4 安全扫描误拦截

**现象**: 正常的 skill 内容被 `security-scan.sh` 拦截。

**排查：**
```bash
# 查看拦截原因
cat ~/.claude/logs/self-evolution.jsonl | jq 'select(.event == "scan_block")'

# 临时禁用扫描（仅用于调试！）
DISABLE_SELF_EVOLUTION_PREHOOK=1 claude
```

### 6.5 超时

**现象**: AgentHook 在 90s 内未完成，被强制终止。

**解决方案：**
1. 增加 timeout: 编辑 hooks.json，将 90 改为 180
2. 简化 prompt：减少 reviewer 的阅读量
3. 使用手动路径：/evolve-review 没有硬性 timeout

### 6.6 日志为空或不完整

**排查：**
```bash
# 检查日志目录权限
ls -la ~/.claude/logs/

# 检查 log-decision.sh 是否可执行
ls -la ~/.claude/plugins/self-evolution/scripts/log-decision.sh

# 手动测试日志写入
~/.claude/plugins/self-evolution/scripts/log-decision.sh TEST "test message" 0 "test-session"
cat ~/.claude/logs/self-evolution.jsonl | tail -3
```

---

## 7. 验收标准

### 7.1 整体通过标准

| 任务 | 通过条件 | 权重 |
|------|----------|------|
| Task 1 | SkillTool 在 AgentHook 内可用 | **阻塞性** |
| Task 15 | 完整 Hook 链（gate → agent → cleanup）工作 | **阻塞性** |
| Task 16 | ≥6/10 场景成功生成有效 skill | 重要 |

### 7.2 测试报告模板

测试完成后，填写以下报告：

```markdown
## Self-Evolution v4 真实环境测试报告

- 测试日期: YYYY-MM-DD
- Claude-Code 版本: x.x.x
- 操作系统: macOS/Linux/Windows

### Task 1: SkillTool 可行性
- [ ] 通过 / [ ] 失败
- 备注:

### Task 15: AgentHook 实测
- [ ] 自动路径通过 / [ ] 失败
- [ ] 手动路径通过 / [ ] 失败
- 生成的 skills:
  - skill-1: (category) (pass/fail)
  - ...

### Task 16: 端到端验证
- 自动模式: X/5 成功
- 手动模式: X/5 成功
- 质量检查通过率: X/Y

### 发现的问题
1. ...

### 建议
1. ...
```

---

## 附录 A: 快速参考命令

```bash
# 安装插件
claude /plugin marketplace add file:///path/to/claude-self-evolution
claude /plugin install self-evolution

# 启用/禁用
claude /plugin enable self-evolution
claude /plugin disable self-evolution

# 查看状态
claude /plugin list

# 清理状态
~/.claude/plugins/self-evolution/scripts/reset-state.sh --apply

# 查看日志
jq -r '. | select(.event == "reviewer_decision") | "\(.ts) \(.decision)"' \
    ~/.claude/logs/self-evolution.jsonl

# 验证 skill
~/.claude/plugins/self-evolution/scripts/verify-skill-quality.sh \
    ~/.claude/skills/<name>/SKILL.md --strict

# 测试安全扫描
echo '{"tool_name": "Write", "tool_input": {"file_path": "...", "content": "..."}}' | \
    ~/.claude/plugins/self-evolution/scripts/security-scan.sh
```

## 附录 B: 已知限制

1. **macOS bash 3.2**: 所有脚本已兼容，但部分高级特性受限
2. **AgentHook timeout**: 90s 可能不足以处理复杂对话
3. **变量替换**: `${session_id}` 可能不被 hook 引擎替换（已内置回退逻辑）
4. **SkillTool 可用性**: 取决于 Claude-Code 版本，未在文档中明确保证
