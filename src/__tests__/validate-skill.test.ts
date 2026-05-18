import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateSkill,
  handleValidateSkill,
  parseValidateSkillArgs,
} from "../commands/validate-skill.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ─── F11: YAML Frontmatter Format Validation ────────────────────────

describe("F11: YAML Frontmatter Format Validation", () => {
  it("accepts valid frontmatter", () => {
    const content = `---
name: foo-bar
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects content without opening ---", () => {
    const content = `name: foo-bar
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/opening/i);
  });

  it("rejects content without closing ---", () => {
    const content = `---
name: foo-bar
description: A useful skill
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/closing/i);
  });

  it("rejects YAML that parses to a scalar", () => {
    const content = `---
just a string
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/object/i);
  });

  it("rejects YAML that parses to an array", () => {
    const content = `---
- item1
- item2
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/object/i);
  });

  it("rejects missing name field", () => {
    const content = `---
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/name/i);
  });

  it("rejects empty name field", () => {
    const content = `---
name: ""
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/name/i);
  });

  it("rejects missing description field", () => {
    const content = `---
name: foo-bar
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/description/i);
  });

  it("rejects empty description field", () => {
    const content = `---
name: foo-bar
description: ""
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/description/i);
  });

  it("rejects content with no body after frontmatter", () => {
    const content = `---
name: foo-bar
description: A useful skill
---
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo-bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/body/i);
  });
});

// ─── F12: Naming Convention Validation ──────────────────────────────

describe("F12: Naming Convention Validation", () => {
  it("rejects name with uppercase letters", () => {
    const content = `---
name: FooBar
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/FooBar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("name") && e.includes("convention"))
    ).toBe(true);
  });

  it("rejects name with spaces", () => {
    const content = `---
name: foo bar
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo bar/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects name starting with hyphen", () => {
    const content = `---
name: -foo
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/-foo/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("accepts name with hyphens, underscores, dots", () => {
    const content = `---
name: foo_bar.baz-qux
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/foo_bar.baz-qux/SKILL.md",
      content
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects name exceeding 64 characters", () => {
    const longName = "a".repeat(65);
    const content = `---
name: ${longName}
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      `/home/user/.claude/skills/${longName}/SKILL.md`,
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("64"))).toBe(true);
  });

  it("accepts name at exactly 64 characters", () => {
    const exactName = "a".repeat(64);
    const content = `---
name: ${exactName}
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      `/home/user/.claude/skills/${exactName}/SKILL.md`,
      content
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects name that does not match directory name", () => {
    const content = `---
name: foo-bar
description: A useful skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/baz-qux/SKILL.md",
      content
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("directory"))).toBe(true);
  });
});

// ─── F14: Cross-Directory Collision Detection ───────────────────────

describe("F14: Cross-Directory Collision Detection", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-validate-test-"));
    vi.spyOn(os, "homedir").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports collision in create mode when same name exists at different path", () => {
    const skillsDir = path.join(tmpDir, ".claude", "skills");
    const existingDir = path.join(skillsDir, "existing-skill");
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(
      path.join(existingDir, "SKILL.md"),
      `---
name: existing-skill
description: Existing skill
---
# Body
`
    );

    const content = `---
name: existing-skill
description: New skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/existing-skill/SKILL.md",
      content,
      "create"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("collision"))).toBe(true);
  });

  it("allows collision in update mode", () => {
    const skillsDir = path.join(tmpDir, ".claude", "skills");
    const existingDir = path.join(skillsDir, "existing-skill");
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(
      path.join(existingDir, "SKILL.md"),
      `---
name: existing-skill
description: Existing skill
---
# Body
`
    );

    const content = `---
name: existing-skill
description: Updated skill
---
# Body
`;
    const result = validateSkill(
      "/home/user/.claude/skills/existing-skill/SKILL.md",
      content,
      "update"
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("does not report collision when path matches existing skill in create mode", () => {
    const skillsDir = path.join(tmpDir, ".claude", "skills");
    const existingDir = path.join(skillsDir, "same-skill");
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(
      path.join(existingDir, "SKILL.md"),
      `---
name: same-skill
description: Existing skill
---
# Body
`
    );

    const content = `---
name: same-skill
description: New skill
---
# Body
`;
    const result = validateSkill(
      path.join(skillsDir, "same-skill", "SKILL.md"),
      content,
      "create"
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── CLI Args Parsing ───────────────────────────────────────────────

describe("parseValidateSkillArgs", () => {
  it("parses --path, --content, and --mode", () => {
    const args = parseValidateSkillArgs([
      "--path",
      "/foo/bar.md",
      "--content",
      "hello",
      "--mode",
      "update",
    ]);
    expect(args.path).toBe("/foo/bar.md");
    expect(args.content).toBe("hello");
    expect(args.mode).toBe("update");
  });

  it("defaults mode to create", () => {
    const args = parseValidateSkillArgs([
      "--path",
      "/foo/bar.md",
      "--content",
      "hello",
    ]);
    expect(args.mode).toBe("create");
  });

  it("returns empty strings for missing args", () => {
    const args = parseValidateSkillArgs([]);
    expect(args.path).toBe("");
    expect(args.content).toBe("");
    expect(args.mode).toBe("create");
  });
});

// ─── Handler Wrapper ────────────────────────────────────────────────

describe("handleValidateSkill", () => {
  it("returns valid result for good input", () => {
    const content = `---
name: foo-bar
description: A useful skill
---
# Body
`;
    const result = handleValidateSkill({
      path: "/home/user/.claude/skills/foo-bar/SKILL.md",
      content,
      mode: "create",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns invalid result for bad input", () => {
    const result = handleValidateSkill({
      path: "/home/user/.claude/skills/foo-bar/SKILL.md",
      content: "no frontmatter",
      mode: "create",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
