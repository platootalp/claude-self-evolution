# 真实环境测试执行指南

> 这是一个逐步执行的真实环境测试指南，用于验证 Tasks 1, 15, 16。
> 当前工作目录: `/Users/lijunyi/road/harness-code/.worktrees/self-evolution-v4/claude-self-evolution`

---

## ✅ 已完成的准备工作

| 项目 | 状态 | 文件位置 |
|------|------|----------|
| 自动化测试套件 | ✅ 全部通过 (83/83) | tests/unit/, tests/integration/ |
| 质量检查脚本 | ✅ 可用 | scripts/verify-skill-quality.sh |
| 测试计划文档 | ✅ 完成 | tests/real-world/TEST-PLAN.md |
| 测试报告模板 | ✅ 完成 | tests/real-world/REPORT-TEMPLATE.md |
| 最小测试插件 | ✅ 已就绪 | tests/real-world/minimal-skilltest-plugin/ |
| 批量验证脚本 | ✅ 可执行 | tests/real-world/verify-batch.sh |

---

## 🚀 立即执行测试（5 分钟快速验证）

### 步骤 1: 环境验证（1 分钟）

```bash
# 在终端中执行以下命令：

# 1.1 检查 Claude-Code 版本
claude --version
# 期望输出: 2.1.x 或更高

# 1.2 检查 skills 目录
ls ~/.claude/skills/ | head -20

# 1.3 备份现有 skills（重要！）
cp -r ~/.claude/skills ~/.claude/skills.backup.$(date +%Y%m%d_%H%M%S)

# 1.4 检查插件列表
claude plugin list | grep -i skill
```

### 步骤 2: 安装测试插件（2 分钟）

```bash
# 2.1 复制最小测试插件到可访问位置
mkdir -p ~/.claude/plugins/minimal-skilltest
cp tests/real-world/minimal-skilltest-plugin/* ~/.claude/plugins/minimal-skilltest/

# 2.2 验证插件文件
cat ~/.claude/plugins/minimal-skilltest/plugin.json
cat ~/.claude/plugins/minimal-skilltest/hooks.json

# 2.3 安装并启用插件
claude plugin enable minimal-skilltest

# 2.4 验证安装
claude plugin list | grep minimal-skilltest
```

### 步骤 3: 执行 Task 1 测试（2 分钟）

```bash
# 在新的终端窗口执行以下对话：

# 3.1 启动 Claude Code（带插件）
claude --plugin-dir ~/.claude/plugins/minimal-skilltest "请帮我执行一个简单的测试：
1. 读取当前目录的 README.md 文件
2. 输出文件的前 10 行
完成后直接退出，不要等待" -p
```

**观察重点：**
- 是否看到 `[skilltool: feasibility test]` 状态消息？
- Agent 是否报告 "SkillTool called"？
- 如果看到错误，记录错误信息

### 步骤 4: 验证结果（30 秒）

```bash
# 4.1 检查是否有生成的 skills
ls ~/.claude/skills/ | grep -E "test-|debug-|refactor-" | head -10

# 4.2 检查日志
cat ~/.claude/logs/self-evolution.jsonl 2>/dev/null | tail -20

# 4.3 清理测试插件
claude plugin disable minimal-skilltest
rm -rf ~/.claude/plugins/minimal-skilltest

# 4.4 恢复备份（如需要）
# rm -rf ~/.claude/skills
# mv ~/.claude/skills.backup.* ~/.claude/skills
```

---

## 📋 完整测试流程（30 分钟 - 1 小时）

如果快速验证通过，执行完整测试流程：

### Task 1: SkillTool 可行性验证（15 分钟）

1. 安装 minimal-skilltest-plugin
2. 执行 3 个不同的测试对话
3. 每次对话后检查 AgentHook 输出
4. 记录 SkillTool 调用是否成功
5. 卸载测试插件

**验收标准：**
- [ ] 至少 2/3 次测试中 SkillTool 可用
- [ ] 没有阻塞性错误

### Task 15: AgentHook 实测（20 分钟）

1. 安装完整的 self-evolution 插件
2. 配置 `nudgeIntervalToolCalls=3`
3. 执行 5 个不同场景的对话
4. 每次对话 ≥3 次 tool calls
5. 观察完整的 Hook 执行序列

**验收标准：**
- [ ] Stop[0] gate 正常执行
- [ ] Stop[1] AgentHook 正常执行
- [ ] Stop[2] cleanup 正常执行
- [ ] 至少 2/5 场景生成 skill

### Task 16: 端到端验证（30 分钟）

1. 自动模式：执行 5 个场景
2. 手动模式：执行 5 个 `/evolve-review` 测试
3. 对每个生成的 skill 运行质量检查
4. 记录所有决策和结果

**验收标准：**
- [ ] ≥6/10 场景成功 CREATE
- [ ] 所有生成的 skill 通过 `verify-skill-quality.sh`
- [ ] 日志记录完整

---

## 🔍 故障排查

### 问题 1: 插件安装失败

```bash
# 检查插件文件权限
ls -la ~/.claude/plugins/minimal-skilltest/

# 手动复制
cp -r tests/real-world/minimal-skilltest-plugin ~/.claude/plugins/

# 验证 JSON 语法
cat ~/.claude/plugins/minimal-skilltest/plugin.json | jq '.'
cat ~/.claude/plugins/minimal-skilltest/hooks.json | jq '.'
```

### 问题 2: AgentHook 未触发

```bash
# 检查插件是否启用
claude plugin list

# 检查 hooks.json 路径
cat ~/.claude/plugins/minimal-skilltest/hooks.json

# 手动测试插件
claude plugin validate ~/.claude/plugins/minimal-skilltest
```

### 问题 3: SkillTool 不可用

**解决方案：**
1. 检查 evolve-skill-writer meta-skill 是否存在
2. 如果不可用，修改 plugins 使用其他方式生成 skill
3. 记录错误信息以便分析

---

## 📊 测试结果记录

### Task 1 结果

| 测试编号 | 场景 | SkillTool 可用 | AgentHook 输出 | 状态 |
|---------|------|----------------|----------------|------|
| 1 | 简单读取 | | | |
| 2 | 文件写入 | | | |
| 3 | 组合操作 | | | |

**结论**: __________

### Task 15 结果

| 场景 | Stop[0] | Stop[1] | Stop[2] | Skill 生成 | 状态 |
|------|---------|---------|---------|-----------|------|
| 自动 1 | | | | | |
| 自动 2 | | | | | |
| 自动 3 | | | | | |
| 手动 1 | | | | | |
| 手动 2 | | | | | |

**结论**: __________

### Task 16 结果

**自动模式 (5/5):** ___/5 成功

| # | 场景 | Category | 决策 | 质量 | 状态 |
|---|------|----------|------|------|------|
| 1 | Python 项目 | `cli` | | | |
| 2 | FastAPI 调试 | `debug` | | | |
| 3 | React 重构 | `refactor` | | | |
| 4 | 数据清洗 | `data` | | | |
| 5 | Docker 构建 | `deploy` | | | |

**手动模式 (5/5):** ___/5 成功

| # | 场景 | Category | 决策 | 质量 | 状态 |
|---|------|----------|------|------|------|
| 6 | 单元测试 | `test` | | | |
| 7 | API 设计 | `web` | | | |
| 8 | Git 工作流 | `cli` | | | |
| 9 | Skill 创建 | `meta` | SKIP | | |
| 10 | 数据查询 | — | SKIP | | |

**总体结论**: __________

---

## 📝 测试报告模板

测试完成后，复制 `tests/real-world/REPORT-TEMPLATE.md` 的内容并填写结果。

```bash
# 复制报告模板
cp tests/real-world/REPORT-TEMPLATE.md \n   tests/real-world/TEST-REPORT-$(date +%Y%m%d).md

# 填写报告
# (使用你喜欢的编辑器打开并填写)
```

---

## ✅ 提交测试结果

测试完成后，请提交以下内容到仓库：

1. `TEST-REPORT-YYYY-MM-DD.md` — 完整的测试报告
2. 如有截图，放入 `tests/real-world/screenshots/` 目录
3. 如有生成的 skills，记录它们的名称和质量检查结果

```bash
# 提交测试报告
git add tests/real-world/TEST-REPORT-*.md
git commit -m "test: add real-world test report for Tasks 1, 15, 16"
```

---

## 🎯 快速开始

如果你现在就想开始，执行：

```bash
# 一键环境检查
claude --version && ls ~/.claude/skills/ | head -5 && \n  cp -r ~/.claude/skills ~/.claude/skills.backup.$(date +%Y%m%d)

# 一键安装测试插件
mkdir -p ~/.claude/plugins/minimal-skilltest && \n  cp tests/real-world/minimal-skilltest-plugin/* ~/.claude/plugins/minimal-skilltest/

# 然后执行:
# claude --plugin-dir ~/.claude/plugins/minimal-skilltest "读取 README.md 前 5 行" -p
```

---

**下一步**: 按照上述步骤执行测试，使用 `REPORT-TEMPLATE.md` 记录结果。