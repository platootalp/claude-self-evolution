import path from "node:path";
import os from "node:os";
import type { ScanResult } from "../types.js";

const SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");

// Patterns
const PI_PATTERN = /(?:ignore previous|disregard above|<\||system:.*you are now|dump.*database|forget.*instructions)/i;
const BASH_PATTERN = /rm -rf \/(?: |$)|curl[^|]*\| *(?:ba)?sh|eval\s+\$\(|wget[^|]*-O\s*-/;
const SECRET_PATTERN = /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9]{36})/;

interface ScanOptions {
  maxSkillSize?: number;
}

export function scanWrite(
  targetPath: string,
  content: string,
  options: ScanOptions = {}
): ScanResult {
  const maxSkillSize = options.maxSkillSize ?? 15360;

  // 1. Path whitelist: only ~/.claude/skills/<name>/SKILL.md
  const normalizedTarget = path.normalize(targetPath);
  const normalizedSkillsDir = path.normalize(SKILLS_DIR);
  const normalizedClaudeDir = path.normalize(path.join(os.homedir(), ".claude"));

  if (normalizedTarget.startsWith(normalizedClaudeDir + path.sep) || normalizedTarget === normalizedClaudeDir) {
    const rel = path.relative(normalizedSkillsDir, normalizedTarget);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return { allowed: false, reason: "path_escape: write to ~/.claude/ outside skills/<name>/SKILL.md" };
    }
    if (!/^[^/]+\/SKILL\.md$/.test(rel)) {
      return { allowed: false, reason: "path_escape: write to ~/.claude/skills/ must be to <name>/SKILL.md" };
    }
  }

  // 2. Prompt injection (raw)
  if (PI_PATTERN.test(content)) {
    return { allowed: false, reason: "prompt-injection pattern" };
  }

  // 3. Dangerous bash (raw)
  if (BASH_PATTERN.test(content)) {
    return { allowed: false, reason: "dangerous bash pattern" };
  }

  // 4. Secret leak (raw)
  if (SECRET_PATTERN.test(content)) {
    return { allowed: false, reason: "secret leak pattern" };
  }

  // 5. Base64 decoded scan
  const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
  const MAX_TOKENS = 50;
  let tokenCount = 0;
  let match: RegExpExecArray | null;
  while ((match = base64Pattern.exec(content)) !== null && tokenCount < MAX_TOKENS) {
    tokenCount++;
    try {
      const decoded = Buffer.from(match[0], "base64").toString("utf-8");
      if (decoded.length < 4) continue;
      const printable = decoded.replace(/[^\x20-\x7E\t\n]/g, "").length;
      if (printable * 100 < decoded.length * 80) continue;
      if (PI_PATTERN.test(decoded)) {
        return { allowed: false, reason: "prompt-injection pattern (base64-decoded)" };
      }
      if (BASH_PATTERN.test(decoded)) {
        return { allowed: false, reason: "dangerous bash pattern (base64-decoded)" };
      }
      if (SECRET_PATTERN.test(decoded)) {
        return { allowed: false, reason: "secret leak pattern (base64-decoded)" };
      }
    } catch {
      // Not valid base64, skip
    }
  }

  // 6. Size limit
  const size = Buffer.byteLength(content, "utf-8");
  if (size > maxSkillSize) {
    return { allowed: false, reason: `file too large (${size} > ${maxSkillSize} bytes)` };
  }

  return { allowed: true };
}
