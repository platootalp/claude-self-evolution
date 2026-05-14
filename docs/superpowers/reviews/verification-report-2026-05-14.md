# TS Runtime Redesign 验收报告

> 日期: 2026-05-14
> 对照计划: `docs/superpowers/plans/2026-05-14-ts-runtime-redesign.md`
> 当前 HEAD: `02fbbdd`

## 总体结论：部分通过

TS 代码实现完整（85 个测试全部通过），但存在 2 个严重回退和 1 个配置偏差。

---

## 关键问题

### 🔴 严重-1：hooks.json 在工作目录中回退到旧版

git diff 显示 hooks.json 的工作目录版本已从 HEAD 的纯命令钩子回退为旧版 shell 脚本 + agent hook + PreToolUse 全局安全扫描。

| 项 | HEAD (正确) | 工作目录 (回退) |
|---|---|---|
| SessionStart | `node runtime.mjs session-start` | `scripts/diag-hook.sh` |
| PostToolUse | `node runtime.mjs post-tool-use` | `scripts/nudge-state.sh --event=post-tool-use` |
| Stop | 单个 `node runtime.mjs stop-gate` (companion mode) | 3-hook 链: stop-gate.sh + agent hook + cleanup |
| PreToolUse | 不存在 (安全扫描内嵌到 reviewer) | `scripts/security-scan.sh` 拦截 Write/Edit |

**影响**: 如果提交，将撤销整个迁移的核心架构变更——companion mode、纯命令钩子、安全扫描内嵌全部失效。

**修复**: `git checkout HEAD -- hooks/hooks.json`

### 🔴 严重-2：plugin.json 在工作目录中回退到 v0.4.0

| 项 | HEAD (正确) | 工作目录 (回退) |
|---|---|---|
| version | `0.5.0` | `0.4.0` |
| description | 含 "companion-mode background review" | 仅 "in-session AgentHook" |
| userConfig 格式 | 对象形式，含 title/description | 数组形式，不含 title/description |
| review_model | 有 | 无 |
| platform | 有 (auto/claude-code/codex/cursor) | 无 |
| components/agentsPath/hooksPath 等 | 有 | 无 |

**影响**: 丢失 v0.5.0 新增的 review_model 和 platform 配置，运行时无法读取这些用户选项。

**修复**: `git checkout HEAD -- .claude-plugin/plugin.json`

### 🟡 中等：Shell 脚本在 staging area 中重新出现

以下文件在 Task 15 的 commit 中已删除，但被重新 `git add` 到 staging area：

- `scripts/nudge-state.sh`
- `scripts/security-scan.sh`
- `scripts/stop-gate.sh`

此外 `scripts/diag-hook.sh` 作为 untracked 文件存在于工作目录。

**影响**: 如果提交，将恢复已被 TS runtime 替代的废弃 shell 脚本。

**修复**:
```bash
git reset HEAD scripts/nudge-state.sh scripts/security-scan.sh scripts/stop-gate.sh
```

### 🟡 中等：测试基础设施缺失

| 缺失项 | 计划要求 | 当前状态 |
|---|---|---|
| `tests/fixtures/` | transcript-create.json / transcript-skip.json fixture | 目录不存在 |
| `tests/preflight.sh` | 更新 Node.js >= 18 检查 | 文件不存在 |
| `tests/integration/test_headless_e2e.sh` | 适配新 runtime (state.json 而非 trigger-flag) | 文件/目录不存在 |

**影响**: transcript 测试因 fixture 缺失走的是 graceful fallback 路径（返回空摘要），未真正验证解析逻辑。集成测试完全缺失。

**修复**: 创建 fixture 文件和集成测试脚本。

### 🟢 轻微：.gitignore 缺少 `dist/` 条目

计划 Task 1 Step 4 要求开发期间忽略 `dist/`，Task 14 Step 3 再移除。当前 `.gitignore` 从未加入 `dist/`。

**影响**: `dist/runtime.mjs` 已提交到 HEAD，功能不受影响，但与计划流程不符。后续构建产物变更会出现在 git diff 中。

---

## 逐任务验收明细

### Task 1: Project Scaffolding — PASS
- `package.json` ✅ 匹配计划 (v0.5.0, ESM, esbuild, vitest)
- `tsconfig.json` ✅ 匹配计划 (ES2022, bundler, strict)
- `esbuild.config.mjs` ✅ 匹配计划
- `.gitignore` ⚠️ 缺少 `dist/`，多了 `.worktrees/`
- `npm install` + build ✅

### Task 2: Shared Types — PASS
- `src/types.ts` ✅ 完全匹配计划
- `src/__tests__/types.test.ts` ✅

### Task 3: State Management — PASS
- `src/lib/state.ts` ✅ 完全匹配计划
- `src/__tests__/state.test.ts` ✅ (11 tests)
- 原子写入 / incrementCount / consumePending / addJob / updateJob ✅

### Task 4: Security Scan Engine — PASS
- `src/lib/security.ts` ✅ 匹配计划
- `src/__tests__/security.test.ts` ✅ (23 tests)
- 路径白名单 / 注入 / dangerous bash / secret / base64 / size limit ✅

### Task 5: JSONL Logger — PASS
- `src/lib/logger.ts` ✅ 匹配计划
- `src/__tests__/logger.test.ts` ✅ (4 tests)

### Task 6: Transcript Parser — PASS
- `src/lib/transcript.ts` ✅ 匹配计划（比计划多了 single-object fallback，是改进）
- `src/__tests__/transcript.test.ts` ✅ (5 tests)

### Task 7: Spawner — PASS
- `src/lib/spawner.ts` ✅ 匹配计划
- `src/__tests__/spawner.test.ts` ✅ (11 tests)
- ClaudeCodeSpawner / CodexSpawner / CursorSpawner ✅

### Task 8: Command Handlers — PASS
- 7 个命令处理器全部创建 ✅
- 4 个测试文件 + 额外的 session-start.test.ts ✅ (16 + 2 tests)

### Task 9: Runtime Entry Point — PASS
- `src/runtime.ts` ✅ 匹配计划
- `src/__tests__/runtime.test.ts` ✅ (6 tests)
- runCommand export + CLI entry point ✅

### Task 10: Update hooks.json — HEAD PASS / 工作目录 FAIL
- HEAD 版本完全匹配计划 ✅
- 工作目录回退到旧版 ❌（见严重-1）

### Task 11: Update plugin.json — HEAD PASS / 工作目录 FAIL
- HEAD 版本匹配计划 ✅
- 工作目录回退到 v0.4.0 ❌（见严重-2）

### Task 12: Companion Prompt Template — PASS
- `prompts/review-prompt.md` ✅ 完全匹配计划

### Task 13: Agent & Command Markdown — PASS
- `agents/skill-reviewer.md` ✅ 匹配计划 (thin forwarder)
- `commands/evolve-review.md` ✅ 匹配计划
- `commands/evolve-status.md` ✅ 匹配计划

### Task 14: Build, Bundle, Integration Test — PARTIAL
- `npm run build` ✅
- 端到端命令验证 ✅
- `dist/` 提交到版本控制 ✅
- `tests/preflight.sh` 更新 ❌ 文件不存在
- `tests/integration/test_headless_e2e.sh` 更新 ❌ 文件/目录不存在
- `tests/fixtures/` ❌ 不存在

### Task 15: Delete Shell Scripts — HEAD PASS / 工作目录 PARTIAL
- HEAD 中 shell 脚本已删除 ✅
- 工作目录中 shell 脚本重新出现 ❌（见中等问题）
- `tests/unit/` 删除 ✅
- `tests/run_all.sh` 删除 ✅

### Task 16: Final Verification — PARTIAL
- `npx vitest run` 全部通过 ✅ (12 files, 85 tests)
- `dist/runtime.mjs` 正确构建 ✅
- 目录结构 ⚠️ 大体匹配，缺 tests 子项

---

## 测试结果

```
✓ src/__tests__/security.test.ts (23 tests) 10ms
✓ src/__tests__/state.test.ts (11 tests) 53ms
✓ src/__tests__/spawner.test.ts (11 tests) 8ms
✓ src/__tests__/types.test.ts (7 tests) 1ms
✓ src/__tests__/stop-gate.test.ts (5 tests) 25ms
✓ src/__tests__/transcript.test.ts (5 tests) 11ms
✓ src/__tests__/runtime.test.ts (6 tests) 27ms
✓ src/__tests__/logger.test.ts (4 tests) 9ms
✓ src/__tests__/post-tool-use.test.ts (4 tests) 16ms
✓ src/__tests__/review-context.test.ts (2 tests) 8ms
✓ src/__tests__/security-scan.test.ts (5 tests) 1ms
✓ src/__tests__/session-start.test.ts (2 tests) 4ms

Test Files  12 passed (12)
     Tests  85 passed (85)
  Duration  1.06s
```

---

## 修复清单

按优先级排序：

1. **[紧急]** 恢复 hooks.json: `git checkout HEAD -- hooks/hooks.json`
2. **[紧急]** 恢复 plugin.json: `git checkout HEAD -- .claude-plugin/plugin.json`
3. **[高]** 取消暂存 shell 脚本: `git reset HEAD scripts/nudge-state.sh scripts/security-scan.sh scripts/stop-gate.sh`
4. **[中]** 创建 `tests/fixtures/transcript-create.json` 和 `transcript-skip.json`
5. **[中]** 创建 `tests/preflight.sh` (含 Node.js >= 18 检查)
6. **[中]** 创建 `tests/integration/test_headless_e2e.sh` (适配新 runtime)
7. **[低]** 决定 `.gitignore` 中 `dist/` 的策略
