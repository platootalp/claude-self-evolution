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

  if (args.name.includes("/") || !VALID_SKILL_NAME.test(args.name)) {
    return { success: false, message: `invalid skill name: '${args.name}'` };
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
