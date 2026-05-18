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
