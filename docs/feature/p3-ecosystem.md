# P3：生态

> 优先级 3 — 超出单个插件实现范围的生态级功能。仅作记录，不用于近期实现。

## 背景

这些功能要么已被平台处理，要么受限于生态基础设施，要么优先级低。记录于此以避免从差距分析中静默遗漏。

## 功能清单

### F26：Hub 外部安装

**状态：** 受限于生态

**描述：** 从外部来源（GitHub、ClawHub、Marketplace）安装 skill。包含隔离 + 安全扫描和按来源的信任策略。

**受限于原因：** 需要存在 skill 注册/市场。安全模型（隔离 → 扫描 → 信任级别分配）在差距分析中已有设计，但依赖 Hub 基础设施。

**未来实现草案（若 Hub 可用）：**
- 添加 `evolve-skill-install` slash 命令
- 下载 skill 到隔离目录
- 运行完整安全扫描（全部 15 个类别）
- 根据来源分配信任级别：`builtin`（Claude Code 内置）、`trusted`（官方 Hub）、`community`（第三方）
- 扫描通过后移至 `~/.claude/skills/`
- 按 F20 应用信任策略

### F21：Skill 索引缓存（LRU + 磁盘）

**状态：** 可能不需要

**描述：** 双层缓存：进程内 LRU（8 条）+ 磁盘快照。通过 mtime + size 验证 Manifest 有效性。Skill 操作后清除缓存。

**可能不需要的原因：** Claude Code 内置的 Skill 加载速度已足够。仅当性能分析发现 skill 发现是瓶颈时才实现。

**若需要：**
- 在 `state.ts` 或新文件 `cache.ts` 中添加 LRU 缓存
- 缓存键：skill 名称，值：解析的 frontmatter + mtime + size
- 在 create/update/delete 操作时失效

### F22：Slash 命令扫描与注册

**状态：** 已由平台处理

**描述：** 扫描 skill 目录，为每个 skill 注册 `/skill-name` 命令。

**无需操作的原因：** Claude Code 的内置机制自动为 `~/.claude/skills/` 中的 skill 注册 `/skill-name` 命令。插件自身的命令（`/evolve-review`、`/evolve-status`）已通过 `commands/` 目录注册。

### F23：模板变量替换

**状态：** 平台职责

**描述：** 在加载时替换 skill 内容中的 `${SKILL_DIR}`、`${SESSION_ID}` 等变量。

**无需操作的原因：** 这是 Skill 加载功能，应由 Claude Code 的 Skill 系统处理。若 Claude Code 添加模板变量支持，skill 即可使用。无需插件操作。

### F24：内联 Shell 展开

**状态：** 低优先级 / 安全顾虑

**描述：** 在加载时展开 skill 内容中的 `` !`cmd` `` 内联 shell 命令。

**延后原因：** Skill 中的 shell 展开是重大安全风险。仅当 Claude Code 原生支持且具备适当沙箱时考虑。插件的安全模型需扫描展开语法中的危险 shell 命令。

### F25：配置注入

**状态：** 平台职责

**描述：** 在加载时从 `config.yaml` 注入值到 skill 模板。

**无需操作的原因：** 这是 Skill 加载功能，应由 Claude Code 的 Skill 系统处理。若 Claude Code 添加配置注入，可直接利用。无需插件操作。

## 总结

| F# | 功能 | 行动 |
|---|------|------|
| F26 | Hub 外部安装 | 受限于生态。未来：Hub 存在时实现 |
| F21 | Skill 索引缓存 | 可能不需要。仅当性能瓶颈时 |
| F22 | Slash 命令扫描 | 无需操作。已由 Claude Code 处理 |
| F23 | 模板变量替换 | 无需操作。平台职责 |
| F24 | 内联 Shell 展开 | 延后。安全顾虑 |
| F25 | 配置注入 | 无需操作。平台职责 |

P3 无验收标准 — 仅为记录，不用于实现规划。
