import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export interface ValidateResult {
  valid: boolean;
  errors: string[];
}

interface ValidateSkillArgs {
  path: string;
  content: string;
  mode: "create" | "update";
}

// ─── Simple YAML Frontmatter Parser ─────────────────────────────────

function parseFrontmatter(lines: string[]): Record<string, string> | null {
  const result: Record<string, string> = {};
  let hasKeyValuePairs = false;

  for (const line of lines) {
    const match = line.match(/^\s*(\w+)\s*:\s*(.*?)\s*$/);
    if (match) {
      hasKeyValuePairs = true;
      const key = match[1];
      let value = match[2];

      // Handle quoted values (both single and double quotes)
      const singleQuoteMatch = value.match(/^'([^']*)'$/);
      const doubleQuoteMatch = value.match(/^"([^"]*)"$/);

      if (singleQuoteMatch) {
        value = singleQuoteMatch[1];
      } else if (doubleQuoteMatch) {
        value = doubleQuoteMatch[1];
      }

      result[key] = value;
    }
  }

  // If no key-value pairs found and frontmatter is not empty, it's likely
  // a scalar or array — reject it.
  if (!hasKeyValuePairs && lines.some((l) => l.trim() !== "")) {
    return null;
  }

  return result;
}

// ─── Collision Detection Helpers ────────────────────────────────────

function findSkillFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findSkillFiles(fullPath));
      } else if (entry.name === "SKILL.md") {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read — no skills to collide with.
  }
  return results;
}

function extractNameFromFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const match = content.match(/^name:\s*(.+)$/m);
    if (match) {
      let name = match[1].trim();
      // Remove surrounding quotes if present
      const singleQuoteMatch = name.match(/^'([^']*)'$/);
      const doubleQuoteMatch = name.match(/^"([^"]*)"$/);
      if (singleQuoteMatch) {
        name = singleQuoteMatch[1];
      } else if (doubleQuoteMatch) {
        name = doubleQuoteMatch[1];
      }
      return name;
    }
  } catch {
    // Can't read file — treat as no name.
  }
  return null;
}

// ─── Main Validation Function ───────────────────────────────────────

export function validateSkill(
  skillPath: string,
  content: string,
  mode: "create" | "update" = "create"
): ValidateResult {
  const errors: string[] = [];

  // ── F11: YAML Frontmatter Format Validation (fail-fast, in order) ──

  const lines = content.split(/\r?\n/);

  // 1. Content must start with --- on line 1
  if (lines[0] !== "---") {
    return { valid: false, errors: ["missing opening frontmatter delimiter '---'"] };
  }

  // 2. Closing --- must exist after the opening delimiter
  let closingLineIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      closingLineIndex = i;
      break;
    }
  }

  if (closingLineIndex === -1) {
    return { valid: false, errors: ["missing closing frontmatter delimiter '---'"] };
  }

  const frontmatterLines = lines.slice(1, closingLineIndex);
  const bodyLines = lines.slice(closingLineIndex + 1);
  const body = bodyLines.join("\n").trim();

  // 3. YAML between delimiters must parse to a non-null object (not scalar or array)
  const parsed = parseFrontmatter(frontmatterLines);
  if (parsed === null) {
    return { valid: false, errors: ["frontmatter must parse to an object, not a scalar or array"] };
  }

  // 4. name field: required, non-empty string
  const name = parsed.name;
  if (typeof name !== "string" || name.trim() === "") {
    return { valid: false, errors: ["frontmatter 'name' is required and must be a non-empty string"] };
  }

  // 5. description field: required, non-empty string
  const description = parsed.description;
  if (typeof description !== "string" || description.trim() === "") {
    return { valid: false, errors: ["frontmatter 'description' is required and must be a non-empty string"] };
  }

  // 6. Content after closing --- must be non-empty
  if (body === "") {
    return { valid: false, errors: ["skill body must be non-empty after frontmatter"] };
  }

  // ── F12: Naming Convention Validation ──────────────────────────────

  const trimmedName = name.trim();

  if (!/^[a-z0-9][a-z0-9._-]*$/.test(trimmedName)) {
    errors.push(
      "name must match convention: start with alphanumeric, followed by alphanumeric, dots, underscores, or hyphens"
    );
  }

  if (trimmedName.length > 64) {
    errors.push("name must be 64 characters or fewer");
  }

  const dirName = path.basename(path.dirname(skillPath));
  if (trimmedName !== dirName) {
    errors.push("name must match the parent directory name");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // ── F14: Cross-Directory Collision Detection ───────────────────────

  if (mode === "create") {
    const skillsDir = path.join(os.homedir(), ".claude", "skills");
    const normalizedTarget = path.normalize(skillPath);
    const existingSkills = findSkillFiles(skillsDir);

    for (const existingPath of existingSkills) {
      const normalizedExisting = path.normalize(existingPath);
      if (normalizedExisting === normalizedTarget) {
        continue; // Same path — not a cross-directory collision
      }
      const existingName = extractNameFromFile(existingPath);
      if (existingName === trimmedName) {
        return {
          valid: false,
          errors: [`collision: skill with name '${trimmedName}' already exists at '${existingPath}'`],
        };
      }
    }
  }

  return { valid: true, errors: [] };
}

// ─── CLI Helpers ────────────────────────────────────────────────────

export function parseValidateSkillArgs(argv: string[]): ValidateSkillArgs {
  const args: ValidateSkillArgs = { path: "", content: "", mode: "create" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--path" && argv[i + 1]) {
      args.path = argv[++i];
    } else if (argv[i] === "--content" && argv[i + 1]) {
      args.content = argv[++i];
    } else if (argv[i] === "--mode" && argv[i + 1]) {
      args.mode = argv[++i] as "create" | "update";
    }
  }
  return args;
}

export function handleValidateSkill(args: ValidateSkillArgs): ValidateResult {
  return validateSkill(args.path, args.content, args.mode);
}
