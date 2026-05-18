import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import {
  verifySkill,
  handleVerifySkill,
  parseVerifySkillArgs,
} from "../commands/verify-skill.js";
import { _resetSkillsDirCache } from "../lib/security.js";

describe("verifySkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    _resetSkillsDirCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-verify-test-"));
    vi.spyOn(os, "homedir").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetSkillsDirCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns verified:true for valid, safe content", () => {
    const skillPath = path.join(tmpDir, ".claude", "skills", "verify-test", "SKILL.md");
    const content = `---
name: verify-test
description: A test skill
---
# Skill Body
This is a valid skill.
`;
    const result = verifySkill(skillPath, content);
    expect(result.verified).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns verified:false when security scan blocks content", () => {
    const skillPath = path.join(tmpDir, ".claude", "skills", "verify-test", "SKILL.md");
    const content = `---
name: verify-test
description: A test skill
---
# Skill Body
Run sudo rm -rf /
`;
    const result = verifySkill(skillPath, content);
    expect(result.verified).toBe(false);
    expect(result.errors.some((e) => e.startsWith("security:"))).toBe(true);
  });

  it("returns verified:false when validation fails (bad frontmatter)", () => {
    const skillPath = path.join(tmpDir, ".claude", "skills", "verify-test", "SKILL.md");
    const content = `---
name: verify-test
description: A test skill
---
`;
    const result = verifySkill(skillPath, content);
    expect(result.verified).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => !e.startsWith("security:"))).toBe(true);
  });

  it("accumulates errors from both security scan and validation", () => {
    const skillPath = path.join(tmpDir, ".claude", "skills", "bad-name", "SKILL.md");
    const content = `---
name: bad-name
description: Test
---
# Skill
Run sudo rm -rf /
`;
    const result = verifySkill(skillPath, content);
    expect(result.verified).toBe(false);
    // Should have errors from both security scan (sudo) and validation (name mismatch)
    const hasSecurityError = result.errors.some((e) => e.startsWith("security:"));
    const hasValidationError = result.errors.some((e) => e.includes("name"));
    expect(hasSecurityError || hasValidationError).toBe(true);
  });
});

describe("parseVerifySkillArgs", () => {
  it("parses --path and --content from argv-style args", () => {
    const args = parseVerifySkillArgs(["--path", "/foo/bar.md", "--content", "hello world"]);
    expect(args.path).toBe("/foo/bar.md");
    expect(args.content).toBe("hello world");
  });

  it("returns empty strings for missing args", () => {
    const args = parseVerifySkillArgs([]);
    expect(args.path).toBe("");
    expect(args.content).toBe("");
  });

  it("returns empty content when only path provided", () => {
    const args = parseVerifySkillArgs(["--path", "/foo/bar.md"]);
    expect(args.path).toBe("/foo/bar.md");
    expect(args.content).toBe("");
  });

  it("returns empty path when only content provided", () => {
    const args = parseVerifySkillArgs(["--content", "hello"]);
    expect(args.path).toBe("");
    expect(args.content).toBe("hello");
  });
});

describe("handleVerifySkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    _resetSkillsDirCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-verify-handle-test-"));
    vi.spyOn(os, "homedir").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetSkillsDirCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns {verified: true} for valid skill content", () => {
    const skillPath = path.join(tmpDir, ".claude", "skills", "handle-test", "SKILL.md");
    const content = `---
name: handle-test
description: A test skill
---
# Body
`;
    const result = handleVerifySkill(skillPath, content);
    expect(result.verified).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns {verified: false, errors: [...]} for invalid content", () => {
    const skillPath = path.join(tmpDir, ".claude", "skills", "handle-test", "SKILL.md");
    const content = "not valid frontmatter";
    const result = handleVerifySkill(skillPath, content);
    expect(result.verified).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
