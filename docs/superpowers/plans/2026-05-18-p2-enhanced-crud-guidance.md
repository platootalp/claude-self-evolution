# P2 Enhanced CRUD + Behavior Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the self-evolution plugin with P2 features: P2 threat patterns, trust policy, auxiliary file support, CRUD enforcement, behavior guidance, and skill deletion.

**Architecture:** Minimal-delta approach — extend existing `security.ts` patterns and path whitelist, add `applyTrustPolicy` function, create `delete-skill` command handler, and update prompt/markdown files for behavior guidance and enforcement. No new modules or abstractions.

**Tech Stack:** TypeScript, Node.js, vitest

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/security.ts` | Modify | Add P2 patterns, trust policy, auxiliary path whitelist |
| `src/commands/delete-skill.ts` | Create | Handle skill deletion with path validation |
| `src/runtime.ts` | Modify | Register `delete-skill`, add `--trust` flag to security-scan |
| `src/types.ts` | Modify | Add `DELETED` to decision types, `TrustLevel` type |
| `src/lib/state.ts` | Modify | Support `DELETED` in `updateStats` |
| `agents/skill-reviewer.md` | Modify | Add behavior guidance + enforcement steps |
| `prompts/review-prompt.md` | Modify | Add guidance + enforcement |
| `prompts/review-prompt-combined.md` | Modify | Same |
| `prompts/review-prompt-skill.md` | Modify | Same (create only) |
| `prompts/review-prompt-update.md` | Modify | Same (update + patch) |
| `skills/evolve-skill-writer/SKILL.md` | Modify | Add `trust` field, auxiliary file support |
| `commands/evolve-skill-delete.md` | Create | Slash command for `/evolve-skill-delete` |
| `src/__tests__/security.test.ts` | Modify | P2 pattern tests, trust policy tests, auxiliary path tests |
| `src/__tests__/delete-skill.test.ts` | Create | Delete skill command tests |
| `.claude-plugin/plugin.json` | Modify | Version bump |

---

### Task 1: P2 Threat Patterns (F17)

**Files:**
- Modify: `src/lib/security.ts:103` (after last P1 pattern, before closing `];`)
- Modify: `src/__tests__/security.test.ts` (add P2 pattern tests)

- [ ] **Step 1: Write the failing tests for P2 patterns**

Add to `src/__tests__/security.test.ts`:

```typescript
// P2: Crypto mining
it("blocks crypto mining: 'xmrig'", () => {
  const result = scanWrite(
    path.join(SKILLS_DIR, "meta-miner", "SKILL.md"),
    "---\nname: test\n---\n\nRun xmrig --pool stratum+tcp://pool.minexmr.com:443"
  );
  expect(result.allowed).toBe(false);
  expect(result.reason).toContain("crypto_mining");
});

it("blocks crypto mining: 'monero'", () => {
  const result = scanWrite(
    path.join(SKILLS_DIR, "meta-miner2", "SKILL.md"),
    "---\nname: test\n---\n\nConfigure monero mining with minerd"
  );
  expect(result.allowed).toBe(false);
  expect(result.reason).toContain("crypto_mining");
});

it("blocks crypto mining: 'cpuminer'", () => {
  const result = scanWrite(
    path.join(SKILLS_DIR, "meta-miner3", "SKILL.md"),
    "---\nname: test\n---\n\nUse cpuminer for cryptonight algorithm"
  );
  expect(result.allowed).toBe(false);
  expect(result.reason).toContain("crypto_mining");
});

// P2: Exfiltration services
it("blocks exfiltration service: 'webhook.site'", () => {
  const result = scanWrite(
    path.join(SKILLS_DIR, "meta-exfil", "SKILL.md"),
    "---\nname: test\n---\n\nSend data to webhook.site/abc123"
  );
  expect(result.allowed).toBe(false);
  expect(result.reason).toContain("exfiltration_service");
});

it("blocks exfiltration service: 'pastebin.com'", () => {
  const result = scanWrite(
    path.join(SKILLS_DIR, "meta-exfil2", "SKILL.md"),
    "---\nname: test\n---\n\nUpload to pastebin.com for sharing"
  );
  expect(result.allowed).toBe(false);
  expect(result.reason).toContain("exfiltration_service");
});

it("blocks exfiltration service: 'requestbin.com'", () => {
  const result = scanWrite(
    path.join(SKILLS_DIR, "meta-exfil3", "SKILL.md"),
    "---\nname: test\n---\n\nPost to requestbin.com for debugging"
  );
  expect(result.allowed).toBe(false);
  expect(result.reason).toContain("exfiltration_service");
});

it("blocks exfiltration service: 'hastebin.com'", () => {
  const result = scanWrite(
    path.join(SKILLS_DIR, "meta-exfil4", "SKILL.md"),
    "---\nname: test\n---\n\nShare via hastebin.com"
  );
  expect(result.allowed).toBe(false);
  expect(result.reason).toContain("exfiltration_service");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/security.test.ts`
Expected: All 7 new tests FAIL (patterns don't exist yet)

- [ ] **Step 3: Add P2 threat patterns to SECURITY_PATTERNS**

Add after line 103 (after the `ac-settings-json` pattern, before the closing `];`) in `src/lib/security.ts`:

```typescript
  // P2: Crypto mining
  { id: "cm-xmrig", severity: "dangerous", category: "crypto_mining", pattern: /\bxmrig\b/i, description: "XMRig crypto miner" },
  { id: "cm-monero", severity: "dangerous", category: "crypto_mining", pattern: /\bmonero\b/i, description: "Monero cryptocurrency mining" },
  { id: "cm-stratum", severity: "dangerous", category: "crypto_mining", pattern: /stratum\+tcp/i, description: "Stratum mining protocol" },
  { id: "cm-minerd", severity: "dangerous", category: "crypto_mining", pattern: /\bminerd\b/i, description: "minerd crypto miner" },
  { id: "cm-cpuminer", severity: "dangerous", category: "crypto_mining", pattern: /\bcpuminer\b/i, description: "cpuminer crypto miner" },
  { id: "cm-cryptonight", severity: "dangerous", category: "crypto_mining", pattern: /\bcryptonight\b/i, description: "CryptoNight mining algorithm" },
  { id: "cm-hashrate", severity: "dangerous", category: "crypto_mining", pattern: /\bhashrate\b/i, description: "Mining hashrate monitoring" },
  { id: "cm-minexmr", severity: "dangerous", category: "crypto_mining", pattern: /pool\.minexmr/i, description: "MineXMR mining pool" },

  // P2: Exfiltration services
  { id: "es-webhook-site", severity: "dangerous", category: "exfiltration_service", pattern: /webhook\.site/i, description: "Webhook.site exfiltration endpoint" },
  { id: "es-pastebin", severity: "dangerous", category: "exfiltration_service", pattern: /pastebin\.com/i, description: "Pastebin exfiltration service" },
  { id: "es-requestbin", severity: "dangerous", category: "exfiltration_service", pattern: /requestbin\.com/i, description: "RequestBin exfiltration service" },
  { id: "es-hastebin", severity: "dangerous", category: "exfiltration_service", pattern: /hastebin\.com/i, description: "Hastebin exfiltration service" },
  { id: "es-dumpz", severity: "dangerous", category: "exfiltration_service", pattern: /dumpz\.org/i, description: "Dumpz exfiltration service" },
  { id: "es-pipedream", severity: "dangerous", category: "exfiltration_service", pattern: /pipedream\.net/i, description: "Pipedream exfiltration service" },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/security.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/security.ts src/__tests__/security.test.ts
git commit -m "feat(security): add P2 threat patterns (F17 crypto_mining, exfiltration_service)"
```

---

### Task 2: Trust Policy (F20)

**Files:**
- Modify: `src/lib/security.ts` (add `applyTrustPolicy` + `TrustLevel` type)
- Modify: `src/types.ts` (add `TrustLevel` type)
- Modify: `src/commands/security-scan.ts` (add `--trust` flag)
- Modify: `src/runtime.ts:76-91` (pass trust flag to security scan)
- Modify: `src/__tests__/security.test.ts` (add trust policy tests)

- [ ] **Step 1: Write the failing tests for trust policy**

Add to `src/__tests__/security.test.ts`:

```typescript
import { applyTrustPolicy } from "../lib/security.js";

describe("applyTrustPolicy", () => {
  it("allows safe severity for agent-created trust", () => {
    expect(applyTrustPolicy("safe", "agent-created")).toBe(true);
  });

  it("allows caution severity for agent-created trust", () => {
    expect(applyTrustPolicy("caution", "agent-created")).toBe(true);
  });

  it("blocks dangerous severity for agent-created trust", () => {
    expect(applyTrustPolicy("dangerous", "agent-created")).toBe(false);
  });

  it("defaults to agent-created trust when not specified", () => {
    expect(applyTrustPolicy("dangerous")).toBe(false);
  });

  it("allows safe for any trust level", () => {
    expect(applyTrustPolicy("safe", "community")).toBe(true);
  });

  it("blocks caution for community trust", () => {
    expect(applyTrustPolicy("caution", "community")).toBe(false);
  });

  it("allows dangerous for trusted trust", () => {
    expect(applyTrustPolicy("dangerous", "trusted")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/security.test.ts`
Expected: Trust policy tests FAIL (function not exported)

- [ ] **Step 3: Add TrustLevel type to types.ts**

Add after the `SecurityMatch` interface in `src/types.ts` (after line 45):

```typescript
export type TrustLevel = "agent-created" | "community" | "trusted";
```

- [ ] **Step 4: Add applyTrustPolicy to security.ts**

Add after the `scanContent` function (after line 114) in `src/lib/security.ts`:

```typescript
const TRUST_POLICY: Record<string, Record<string, boolean>> = {
  "agent-created": { safe: true, caution: true, dangerous: false },
  "community": { safe: true, caution: false, dangerous: false },
  "trusted": { safe: true, caution: true, dangerous: true },
};

export function applyTrustPolicy(
  severity: "safe" | "caution" | "dangerous",
  trust: string = "agent-created"
): boolean {
  const policy = TRUST_POLICY[trust];
  if (!policy) return severity !== "dangerous";
  return policy[severity] ?? false;
}
```

- [ ] **Step 5: Wire trust policy into scanWrite**

Modify the dangerousMatches block in `scanWrite` (lines 170-179) to apply trust policy. Replace the dangerousMatches filter:

```typescript
  // 4. Determine result based on matches and trust policy
  const trust = options.trust ?? "agent-created";
  const dangerousMatches = allMatches.filter((m) => m.severity === "dangerous" && !applyTrustPolicy("dangerous", trust));
  const cautionMatches = allMatches.filter((m) => m.severity === "caution" && !applyTrustPolicy("caution", trust));
```

Also update the `ScanOptions` interface (line 116-118):

```typescript
interface ScanOptions {
  maxSkillSize?: number;
  trust?: string;
}
```

- [ ] **Step 6: Add --trust flag to security-scan command**

In `src/commands/security-scan.ts`, add `trust?: string` to `SecurityScanArgs` interface (after line 12):

```typescript
  trust?: string;
```

In `parseSecurityScanArgs`, add parsing after `--max-total-size` (after line 61):

```typescript
    } else if (argv[i] === "--trust" && argv[i + 1]) {
      args.trust = argv[++i];
    }
```

In `handleSecurityScan`, pass trust to `scanWrite` options (around line 25):

```typescript
    result = scanWrite(args.path, args.content, {
      maxSkillSize: args.maxSkillSize,
      trust: args.trust,
    });
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/security.test.ts`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/security.ts src/types.ts src/commands/security-scan.ts src/__tests__/security.test.ts
git commit -m "feat(security): add trust policy for agent-created skills (F20)"
```

---

### Task 3: Auxiliary File Whitelist (F9-F10)

**Files:**
- Modify: `src/lib/security.ts:127-140` (scanWrite path whitelist)
- Modify: `src/__tests__/security.test.ts` (auxiliary path tests)

- [ ] **Step 1: Write the failing tests for auxiliary file paths**

Add to `src/__tests__/security.test.ts`:

```typescript
describe("auxiliary file whitelist", () => {
  it("allows write to ~/.claude/skills/<name>/references/guide.md", () => {
    const result = scanWrite(
      path.join(SKILLS_DIR, "debug-foo", "references", "guide.md"),
      "safe reference content"
    );
    expect(result.allowed).toBe(true);
  });

  it("allows write to ~/.claude/skills/<name>/templates/config.yaml", () => {
    const result = scanWrite(
      path.join(SKILLS_DIR, "debug-foo", "templates", "config.yaml"),
      "key: value"
    );
    expect(result.allowed).toBe(true);
  });

  it("allows write to ~/.claude/skills/<name>/references/data.json", () => {
    const result = scanWrite(
      path.join(SKILLS_DIR, "debug-foo", "references", "data.json"),
      '{"key": "value"}'
    );
    expect(result.allowed).toBe(true);
  });

  it("allows write to ~/.claude/skills/<name>/templates/notes.txt", () => {
    const result = scanWrite(
      path.join(SKILLS_DIR, "debug-foo", "templates", "notes.txt"),
      "notes here"
    );
    expect(result.allowed).toBe(true);
  });

  it("allows write to ~/.claude/skills/<name>/references/schema.yml", () => {
    const result = scanWrite(
      path.join(SKILLS_DIR, "debug-foo", "references", "schema.yml"),
      "type: object"
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks write to ~/.claude/skills/<name>/references/script.sh", () => {
    const result = scanWrite(
      path.join(SKILLS_DIR, "debug-foo", "references", "script.sh"),
      "#!/bin/bash"
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("file_type");
  });

  it("blocks write to ~/.claude/skills/<name>/templates/binary.exe", () => {
    const result = scanWrite(
      path.join(SKILLS_DIR, "debug-foo", "templates", "binary.exe"),
      "binary"
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("file_type");
  });

  it("blocks write to ~/.claude/skills/<name>/scripts/run.py", () => {
    const result = scanWrite(
      path.join(SKILLS_DIR, "debug-foo", "scripts", "run.py"),
      "print('hello')"
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("path_escape");
  });

  it("blocks write to ~/.claude/skills/<name>/references/nested/deep.md", () => {
    const result = scanWrite(
      path.join(SKILLS_DIR, "debug-foo", "references", "nested", "deep.md"),
      "nested content"
    );
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/security.test.ts`
Expected: Auxiliary path tests FAIL (path whitelist too restrictive)

- [ ] **Step 3: Extend scanWrite path whitelist**

Replace the path whitelist block in `scanWrite` (lines 127-140 in `src/lib/security.ts`) with:

```typescript
  // 1. Path whitelist: SKILL.md, references/**, templates/**
  const normalizedTarget = path.normalize(targetPath);
  const normalizedSkillsDir = path.normalize(getSkillsDir());
  const normalizedClaudeDir = path.normalize(path.join(os.homedir(), ".claude"));

  if (normalizedTarget.startsWith(normalizedClaudeDir + path.sep) || normalizedTarget === normalizedClaudeDir) {
    const rel = path.relative(normalizedSkillsDir, normalizedTarget);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return { allowed: false, reason: "path_escape: write to ~/.claude/ outside skills/<name>/" };
    }

    const isSkillMd = /^[^/]+\/SKILL\.md$/.test(rel);
    const isReferences = /^[^/]+\/references\//.test(rel);
    const isTemplates = /^[^/]+\/templates\//.test(rel);

    if (!isSkillMd && !isReferences && !isTemplates) {
      return { allowed: false, reason: "path_escape: write to ~/.claude/skills/ must be to <name>/SKILL.md, <name>/references/**, or <name>/templates/**" };
    }

    // File type restriction for auxiliary directories
    const ALLOWED_AUX_EXTENSIONS = [".md", ".txt", ".yaml", ".yml", ".json"];
    if (isReferences || isTemplates) {
      const ext = path.extname(normalizedTarget).toLowerCase();
      if (!ALLOWED_AUX_EXTENSIONS.includes(ext)) {
        return { allowed: false, reason: `file_type: auxiliary files must be one of ${ALLOWED_AUX_EXTENSIONS.join(", ")}, got '${ext}'` };
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/security.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/security.ts src/__tests__/security.test.ts
git commit -m "feat(security): extend path whitelist for auxiliary files (F9-F10)"
```

---

### Task 4: Delete Skill Command (F8)

**Files:**
- Create: `src/commands/delete-skill.ts`
- Modify: `src/runtime.ts:1-15,39-151` (import + register command)
- Create: `src/__tests__/delete-skill.test.ts`

- [ ] **Step 1: Write the failing tests for delete-skill**

Create `src/__tests__/delete-skill.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleDeleteSkill, parseDeleteSkillArgs } from "../commands/delete-skill.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");
const TEST_SKILL = "test-delete-me";

describe("parseDeleteSkillArgs", () => {
  it("parses --name flag", () => {
    const args = parseDeleteSkillArgs(["--name", "my-skill"]);
    expect(args.name).toBe("my-skill");
  });

  it("returns empty name when no flag", () => {
    const args = parseDeleteSkillArgs([]);
    expect(args.name).toBe("");
  });
});

describe("handleDeleteSkill", () => {
  beforeEach(() => {
    const skillDir = path.join(SKILLS_DIR, TEST_SKILL);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: test-delete-me\n---\nbody");
  });

  afterEach(() => {
    const skillDir = path.join(SKILLS_DIR, TEST_SKILL);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
  });

  it("deletes an existing skill", () => {
    const result = handleDeleteSkill({ name: TEST_SKILL });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(SKILLS_DIR, TEST_SKILL))).toBe(false);
  });

  it("returns error for non-existent skill", () => {
    const result = handleDeleteSkill({ name: "non-existent-skill" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("returns error for empty name", () => {
    const result = handleDeleteSkill({ name: "" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("missing");
  });

  it("rejects path traversal in skill name", () => {
    const result = handleDeleteSkill({ name: "../etc-passwd" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("invalid");
  });

  it("rejects names with slashes", () => {
    const result = handleDeleteSkill({ name: "foo/bar" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("invalid");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/delete-skill.test.ts`
Expected: All tests FAIL (module not found)

- [ ] **Step 3: Create delete-skill.ts**

Create `src/commands/delete-skill.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface DeleteSkillArgs {
  name: string;
}

export interface DeleteSkillResult {
  success: boolean;
  message: string;
}

const VALID_SKILL_NAME = /^[a-z0-9][a-z0-9._-]*$/;

export function handleDeleteSkill(args: DeleteSkillArgs): DeleteSkillResult {
  if (!args.name) {
    return { success: false, message: "missing skill name" };
  }

  if (!VALID_SKILL_NAME.test(args.name)) {
    return { success: false, message: `invalid skill name: '${args.name}'` };
  }

  if (args.name.includes("/")) {
    return { success: false, message: `invalid skill name: '${args.name}' (no slashes allowed)` };
  }

  const skillDir = path.join(os.homedir(), ".claude", "skills", args.name);
  const normalizedSkillDir = path.normalize(skillDir);
  const normalizedSkillsDir = path.normalize(path.join(os.homedir(), ".claude", "skills"));

  if (!normalizedSkillDir.startsWith(normalizedSkillsDir + path.sep) && normalizedSkillDir !== normalizedSkillsDir) {
    return { success: false, message: `invalid skill name: '${args.name}' (path traversal blocked)` };
  }

  if (!fs.existsSync(skillDir)) {
    return { success: false, message: `skill '${args.name}' not found` };
  }

  try {
    fs.rmSync(skillDir, { recursive: true, force: true });
    return { success: true, message: `skill '${args.name}' deleted` };
  } catch (err) {
    return { success: false, message: `failed to delete skill '${args.name}': ${err}` };
  }
}

export function parseDeleteSkillArgs(argv: string[]): DeleteSkillArgs {
  const args: DeleteSkillArgs = { name: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--name" && argv[i + 1]) {
      args.name = argv[++i];
    }
  }
  return args;
}
```

- [ ] **Step 4: Register delete-skill in runtime.ts**

Add import at top of `src/runtime.ts` (after line 15):

```typescript
import { handleDeleteSkill, parseDeleteSkillArgs } from "./commands/delete-skill.js";
```

Add command case in the switch block (before `default:`):

```typescript
      case "delete-skill": {
        const delArgs = parseDeleteSkillArgs(args);
        if (!delArgs.name) {
          process.stdout.write(JSON.stringify({ success: false, message: "missing --name" }) + "\n");
          return 1;
        }
        const result = handleDeleteSkill(delArgs);
        process.stdout.write(JSON.stringify(result) + "\n");
        return result.success ? 0 : 1;
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/delete-skill.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/commands/delete-skill.ts src/runtime.ts src/__tests__/delete-skill.test.ts
git commit -m "feat(delete-skill): add delete-skill command (F8)"
```

---

### Task 5: Support DELETED in log-decision + stats (F8)

**Files:**
- Modify: `src/types.ts:9,15,108,189` (add DELETED to decision types)
- Modify: `src/lib/state.ts:187-201` (support DELETED in updateStats)
- Modify: `src/commands/log-decision.ts:21-47` (handle DELETED decision)

- [ ] **Step 1: Write the failing tests for DELETED decision**

Add to `src/__tests__/state.test.ts` or create a focused test. Verify that `updateStats` handles `DELETED`:

```typescript
it("handles DELETED decision in updateStats", () => {
  const statsPath = path.join(tmpDir, "stats.json");
  fs.writeFileSync(statsPath, JSON.stringify({
    last_updated: "",
    total_sessions: 0,
    total_created: 0,
    total_updated: 0,
    total_skipped: 0,
    skip_reasons: {},
    recent_decisions: [],
  }));
  updateStats(statsPath, "DELETED" as any, "skill_name: debug-foo", "session-1", "debug-foo");
  const stats = loadStats(statsPath);
  expect(stats.total_sessions).toBe(1);
  expect(stats.recent_decisions[0].decision).toBe("DELETED");
});
```

- [ ] **Step 2: Add DELETED to decision types in types.ts**

In `src/types.ts`, update the `Job` interface (line 15):

```typescript
  decision?: "CREATED" | "UPDATED" | "SKIPPED" | "DELETED";
```

Update `SessionStateFull` (line 98):

```typescript
  review_decision?: "CREATED" | "UPDATED" | "SKIPPED" | "DELETED";
```

Update `RecentDecision` (line 109):

```typescript
  decision: "CREATED" | "UPDATED" | "SKIPPED" | "DELETED";
```

Add `total_deleted` to `Stats` interface (after line 119):

```typescript
  total_deleted: number;
```

- [ ] **Step 3: Update updateStats to handle DELETED**

In `src/lib/state.ts`, update the `EMPTY_STATS` constant (add `total_deleted: 0`) and the `updateStats` function to handle DELETED:

```typescript
const EMPTY_STATS: Stats = {
  last_updated: "",
  total_sessions: 0,
  total_created: 0,
  total_updated: 0,
  total_skipped: 0,
  total_deleted: 0,
  skip_reasons: {},
  recent_decisions: [],
};
```

Add DELETED handling in `updateStats` (after the SKIPPED block):

```typescript
  if (decision === "CREATED") stats.total_created += 1;
  else if (decision === "UPDATED") stats.total_updated += 1;
  else if (decision === "SKIPPED") {
    stats.total_skipped += 1;
    stats.skip_reasons[detail] = (stats.skip_reasons[detail] ?? 0) + 1;
  } else if (decision === "DELETED") {
    stats.total_deleted += 1;
  }
```

- [ ] **Step 4: Update handleLogDecision to accept DELETED**

In `src/commands/log-decision.ts`, extend the decision check (line 21, 29):

```typescript
  if (decision === "CREATED" || decision === "UPDATED" || decision === "SKIPPED" || decision === "DELETED") {
```

Appear in both the `logger.info` check (line 21) and the `updateStats`/`updateSessionResult` block (line 29). Also update the type assertion:

```typescript
    updateStats(statsPath, decision as "CREATED" | "UPDATED" | "SKIPPED" | "DELETED", detail, sessionId, skillName);
    updateSessionResult(sessionsDir, sessionId, {
      review_decision: decision as "CREATED" | "UPDATED" | "SKIPPED" | "DELETED",
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/state.ts src/commands/log-decision.ts
git commit -m "feat(stats): support DELETED decision type (F8)"
```

---

### Task 6: /evolve-skill-delete Slash Command (F8)

**Files:**
- Create: `commands/evolve-skill-delete.md`

- [ ] **Step 1: Create the slash command file**

Create `commands/evolve-skill-delete.md`:

```markdown
---
description: Delete a skill created by self-evolution. Requires confirmation.
allowed-tools: Bash(node:*)
argument-hint: "<skill-name>"
---

Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" delete-skill --name "$ARGUMENTS"

If the result shows {success: true}, confirm to the user that the skill was deleted.
If {success: false, message: "..."}, report the error to the user.

After deletion, also log the decision:
node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "DELETED" "skill_name: $ARGUMENTS"

IMPORTANT: Ask the user for confirmation before running the delete command. Show the skill name and explain this action cannot be undone.
```

- [ ] **Step 2: Commit**

```bash
git add commands/evolve-skill-delete.md
git commit -m "feat(commands): add /evolve-skill-delete slash command (F8)"
```

---

### Task 7: Behavior Guidance + CRUD Enforcement in Reviewer (F27 + F5-F7)

**Files:**
- Modify: `agents/skill-reviewer.md`
- Modify: `prompts/review-prompt.md`
- Modify: `prompts/review-prompt-combined.md`
- Modify: `prompts/review-prompt-skill.md`
- Modify: `prompts/review-prompt-update.md`

- [ ] **Step 1: Update skill-reviewer.md**

Replace the entire content of `agents/skill-reviewer.md` with:

```markdown
---
name: skill-reviewer
description: Reviews recent conversation and creates/updates a skill if a reusable, non-trivial workflow was demonstrated. Invoked manually via /evolve-review or as a Task subagent.
model: inherit
effort: low
maxTurns: 8
tools: [Read, Write, Edit, Bash, Glob, Grep, Skill]
disallowedTools: [Task, WebFetch, WebSearch]
---

You are a Skill Reviewer. Decide CREATE / UPDATE / SKIP.

## Skill Guidance (F27)

After complex multi-step workflows, proactively suggest saving a skill even if the threshold hasn't been met. When a workflow contradicts or extends an existing skill, suggest UPDATING it. Reference the `evolve-skill-writer` meta-skill for generation.

## Pipeline

Step 1 — Get context:
  Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context
  Returns JSON with transcript summary and existing skills.

Step 2 — Rationale (MUST before any tool call):
  Write ONE sentence (<=30 words) WHY this workflow should be captured.
  Reject if trivial, one-off, or lacks generalizability.

Step 3 — Security scan (MUST before Write):
  Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" security-scan --path <path> --content <content>
  If {allowed: false}, do NOT Write. Output: SKIPPED: hard_gate_blocked: <reason>

Step 4 — Generate skill:
  If CREATE or UPDATE, invoke Skill('self-evolution:evolve-skill-writer', context).
  - For CREATE: use Write to save to ~/.claude/skills/<name>/SKILL.md
  - For UPDATE: Read the existing skill first, then use Write to overwrite
  - For PATCH (targeted edits): use Edit tool for specific changes

Step 5 — Validate (MUST after Write):
  Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" validate-skill --path <path> --content <content>
  If {valid: false}, delete the written file and output: SKIPPED: validation_failed: <errors>

Step 6 — Verify (MUST after Write/Edit):
  Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" verify-skill --path <path> --content <content>
  If {verified: false}, delete the written file and output: SKIPPED: verification_failed: <errors>

Step 7 — Log:
  Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "<VERB>" "<reason>"

Step 8 — Output:
  CREATED: <name> | rationale: <line>
  UPDATED: <name> | rationale: <line>
  SKIPPED: <reason>
```

- [ ] **Step 2: Update review-prompt.md**

Replace the entire content of `prompts/review-prompt.md` with:

```markdown
You are a self-evolution reviewer. A conversation has ended and the nudge threshold was met.

Session: ${SELF_EVOLUTION_SESSION_ID}
Plugin Root: ${CLAUDE_PLUGIN_ROOT}
Plugin Data: ${SELF_EVOLUTION_PLUGIN_DATA}

## Skill Guidance

After complex multi-step workflows, proactively suggest saving a skill. When a workflow contradicts or extends an existing skill, suggest UPDATING it.

Your task:
1. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context "${SELF_EVOLUTION_TRANSCRIPT_PATH}"
   Returns transcript summary and existing skills.

2. Decide CREATE / UPDATE / SKIP. SKIP unless: reusable (>=3 steps), generalizable, no one-off data.

3. Write ONE sentence (<=30 words) explaining WHY. Reject if trivial.

4. Before writing, run security scan:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" security-scan --path <path> --content <content>
   If {allowed: false}, output: SKIPPED: hard_gate_blocked: <reason>

5. If CREATE or UPDATE, invoke Skill('self-evolution:evolve-skill-writer', context) and Write.
   For UPDATE: Read the existing skill first before writing.
   For PATCH (targeted edits): use Edit tool instead of full Write.

6. After Write, MUST run validation:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" validate-skill --path <path> --content <content>
   If {valid: false}, delete the written file and output: SKIPPED: validation_failed: <errors>

7. After Write/Edit, MUST run verification:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" verify-skill --path <path> --content <content>
   If {verified: false}, delete the written file and output: SKIPPED: verification_failed: <errors>

8. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "<VERB>" "<reason>"

9. Output your final decision.

NEVER output ok:false. Always complete and exit.
```

- [ ] **Step 3: Update review-prompt-combined.md**

Replace the entire content of `prompts/review-prompt-combined.md` with:

```markdown
You are a self-evolution reviewer. A conversation has ended and the nudge threshold was met.

Session: ${SELF_EVOLUTION_SESSION_ID}
Plugin Root: ${CLAUDE_PLUGIN_ROOT}
Plugin Data: ${SELF_EVOLUTION_PLUGIN_DATA}

## Skill Guidance

After complex multi-step workflows, proactively suggest saving a skill. When a workflow contradicts or extends an existing skill, suggest UPDATING it.

Your task is to evaluate whether the conversation contains a **reusable skill worth creating** or an **existing skill worth updating**.

Focus on these signals:
- Was a **non-trivial approach** used to complete a task?
- Did the task require **trial and error** or changing course?
- Did the **user expect or desire a different method or outcome**?
- Does an existing skill contain **outdated or incorrect** information?
- Are there **missing steps, traps, or edge cases** in an existing skill?

Steps:
1. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context "${SELF_EVOLUTION_TRANSCRIPT_PATH}"
   Returns transcript summary and existing skills.

2. Decide CREATE / UPDATE / SKIP. SKIP unless: reusable (>=3 steps), generalizable, no one-off data.

3. Write ONE sentence (<=30 words) explaining WHY. Reject if trivial.

4. Before writing, run security scan:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" security-scan --path <path> --content <content>
   If {allowed: false}, output: SKIPPED: hard_gate_blocked: <reason>

5. If CREATE or UPDATE, invoke Skill('self-evolution:evolve-skill-writer', context) and Write.
   For UPDATE: Read the existing skill first before writing.
   For PATCH (targeted edits): use Edit tool instead of full Write.

6. After Write, MUST run validation:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" validate-skill --path <path> --content <content>
   If {valid: false}, delete the written file and output: SKIPPED: validation_failed: <errors>

7. After Write/Edit, MUST run verification:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" verify-skill --path <path> --content <content>
   If {verified: false}, delete the written file and output: SKIPPED: verification_failed: <errors>

8. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "<VERB>" "<reason>"

9. Output your final decision.

NEVER output ok:false. Always complete and exit.
```

- [ ] **Step 4: Update review-prompt-skill.md**

Replace the entire content of `prompts/review-prompt-skill.md` with:

```markdown
You are a self-evolution reviewer. A conversation has ended and the nudge threshold was met.

Session: ${SELF_EVOLUTION_SESSION_ID}
Plugin Root: ${CLAUDE_PLUGIN_ROOT}
Plugin Data: ${SELF_EVOLUTION_PLUGIN_DATA}

## Skill Guidance

After complex multi-step workflows, proactively suggest saving a skill. When a workflow contradicts or extends an existing skill, suggest UPDATING it.

Your task is to evaluate whether the conversation contains a **new, reusable skill** worth creating.

Focus on these signals:
- Was a **non-trivial approach** used to complete a task (not just following standard docs)?
- Did the task require **trial and error** or changing course due to experiential findings?
- Did the **user expect or desire a different method or outcome** than what was first attempted?
- Is the approach **reusable** across similar tasks, not a one-off solution?

Steps:
1. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context "${SELF_EVOLUTION_TRANSCRIPT_PATH}"
   Returns transcript summary and existing skills.

2. Decide CREATE / SKIP. SKIP unless: reusable (>=3 steps), generalizable, no one-off data.

3. Write ONE sentence (<=30 words) explaining WHY. Reject if trivial.

4. Before writing, run security scan:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" security-scan --path <path> --content <content>
   If {allowed: false}, output: SKIPPED: hard_gate_blocked: <reason>

5. If CREATE, invoke Skill('self-evolution:evolve-skill-writer', context) and Write.

6. After Write, MUST run validation:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" validate-skill --path <path> --content <content>
   If {valid: false}, delete the written file and output: SKIPPED: validation_failed: <errors>

7. After Write, MUST run verification:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" verify-skill --path <path> --content <content>
   If {verified: false}, delete the written file and output: SKIPPED: verification_failed: <errors>

8. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "<VERB>" "<reason>"

9. Output your final decision.

NEVER output ok:false. Always complete and exit.
```

- [ ] **Step 5: Update review-prompt-update.md**

Replace the entire content of `prompts/review-prompt-update.md` with:

```markdown
You are a self-evolution reviewer. A conversation has ended and the nudge threshold was met.

Session: ${SELF_EVOLUTION_SESSION_ID}
Plugin Root: ${CLAUDE_PLUGIN_ROOT}
Plugin Data: ${SELF_EVOLUTION_PLUGIN_DATA}

## Skill Guidance

After complex multi-step workflows, proactively suggest saving a skill. When a workflow contradicts or extends an existing skill, suggest UPDATING it.

Your task is to evaluate whether the conversation reveals that an **existing skill needs updating**.

Focus on these signals:
- Does an existing skill contain **outdated or incorrect** information?
- Did the conversation reveal a workflow that **contradicts or extends** an existing skill?
- Did the user **correct or improve upon** an existing skill's guidance?
- Are there **missing steps, traps, or edge cases** in an existing skill?

You may also CREATE a new skill if the conversation reveals a completely new reusable pattern.

Steps:
1. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context "${SELF_EVOLUTION_TRANSCRIPT_PATH}"
   Returns transcript summary and existing skills.

2. Decide UPDATE / CREATE / SKIP. SKIP unless: the update adds real value or the new skill meets quality standards.

3. Write ONE sentence (<=30 words) explaining WHY. Reject if trivial.

4. Before writing, run security scan:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" security-scan --path <path> --content <content>
   If {allowed: false}, output: SKIPPED: hard_gate_blocked: <reason>

5. If UPDATE or CREATE, invoke Skill('self-evolution:evolve-skill-writer', context) and Write.
   For UPDATE: Read the existing skill first before writing.
   For PATCH (targeted edits): use Edit tool instead of full Write.

6. After Write, MUST run validation:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" validate-skill --path <path> --content <content>
   If {valid: false}, delete the written file and output: SKIPPED: validation_failed: <errors>

7. After Write/Edit, MUST run verification:
   node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" verify-skill --path <path> --content <content>
   If {verified: false}, delete the written file and output: SKIPPED: verification_failed: <errors>

8. Run: node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "<VERB>" "<reason>"

9. Output your final decision.

NEVER output ok:false. Always complete and exit.
```

- [ ] **Step 6: Commit**

```bash
git add agents/skill-reviewer.md prompts/review-prompt.md prompts/review-prompt-combined.md prompts/review-prompt-skill.md prompts/review-prompt-update.md
git commit -m "feat(review): add behavior guidance + CRUD enforcement (F27, F5-F7)"
```

---

### Task 8: Update evolve-skill-writer for trust + auxiliary files (F20, F9-F10)

**Files:**
- Modify: `skills/evolve-skill-writer/SKILL.md`

- [ ] **Step 1: Update SKILL.md frontmatter and body**

In `skills/evolve-skill-writer/SKILL.md`, make these changes:

1. Add `trust` to the frontmatter schema section (around line 82-89). Update the frontmatter example:

```yaml
---
name: <category>-<kebab-name>
description: <one sentence, see Description Rules below>
when_to_use: |
  <trigger condition + 1-2 example user phrases>
paths: ["**/*"]
allowed-tools: <space-separated list, narrow as appropriate>
trust: agent-created
version: "1.0.0"
---
```

2. Add field rule for `trust` after the `version` rule (after line 103):

```markdown
- `trust`: always `agent-created` for self-evolution generated skills. This marks the skill's trust level for security policy enforcement.
```

3. Update the Anatomy section (around line 48-55) to mention auxiliary files:

```markdown
## Anatomy (v2: SKILL.md + auxiliary files)

\```
<category>-<kebab-name>/
├── SKILL.md          # primary skill file
├── references/       # supplementary docs (.md, .txt, .yaml, .yml, .json)
└── templates/        # reusable templates (.md, .txt, .yaml, .yml, .json)
\```

Auxiliary files in `references/` and `templates/` support richer skills.
Allowed file types: `.md`, `.txt`, `.yaml`, `.yml`, `.json`.
No executables, scripts, or binary files.
```

4. Remove the old v1 anatomy note about `scripts/, references/, assets/` being reserved for v2+.

- [ ] **Step 2: Commit**

```bash
git add skills/evolve-skill-writer/SKILL.md
git commit -m "feat(skill-writer): add trust field + auxiliary file support (F20, F9-F10)"
```

---

### Task 9: Version Bump + Full Test Suite

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `src/__tests__/runtime.test.ts` (add delete-skill + trust flag tests if needed)

- [ ] **Step 1: Bump version in plugin.json**

Update version from `0.8.0` to `0.9.0` in `.claude-plugin/plugin.json`:

```json
"version": "0.9.0"
```

- [ ] **Step 2: Build and run full test suite**

Run: `npm run build && npm test`
Expected: All tests PASS, build succeeds

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "chore: bump version to 0.9.0"
```

---

### Task 10: Integration Verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 3: Verify delete-skill runtime command**

Run: `node dist/runtime.mjs delete-skill --name non-existent-skill`
Expected: `{"success":false,"message":"skill 'non-existent-skill' not found"}`

- [ ] **Step 4: Verify security-scan with --trust flag**

Run: `node dist/runtime.mjs security-scan --path /tmp/test.md --content "safe content" --trust agent-created`
Expected: `{"allowed":true}`

- [ ] **Step 5: Verify P2 patterns**

Run: `node dist/runtime.mjs security-scan --path /tmp/test.md --content "xmrig --pool stratum+tcp://pool.example.com"`
Expected: `{"allowed":false,"reason":"crypto_mining pattern",...}`
