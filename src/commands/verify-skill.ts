import { scanWrite } from "../lib/security.js";
import { validateSkill } from "./validate-skill.js";

export interface VerifyResult {
  verified: boolean;
  errors: string[];
}

export interface VerifySkillArgs {
  path: string;
  content: string;
}

/**
 * Verifies a skill by running both security scan AND validation.
 * Returns combined results from both checks.
 */
export function verifySkill(skillPath: string, content: string): VerifyResult {
  const errors: string[] = [];

  // 1. Run security scan
  const scanResult = scanWrite(skillPath, content);
  if (!scanResult.allowed) {
    errors.push(`security: ${scanResult.reason}`);
  }

  // 2. Run validation
  const validationResult = validateSkill(skillPath, content);
  if (!validationResult.valid) {
    errors.push(...validationResult.errors);
  }

  return {
    verified: errors.length === 0,
    errors,
  };
}

/**
 * Parse command-line arguments for verify-skill command.
 */
export function parseVerifySkillArgs(argv: string[]): VerifySkillArgs {
  const args: VerifySkillArgs = { path: "", content: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--path" && argv[i + 1]) {
      args.path = argv[++i];
    } else if (argv[i] === "--content" && argv[i + 1]) {
      args.content = argv[++i];
    }
  }
  return args;
}

/**
 * Handler for verify-skill CLI command.
 */
export function handleVerifySkill(path: string, content: string): VerifyResult {
  return verifySkill(path, content);
}
