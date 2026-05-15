import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { ScanResult, SecurityPattern, SecurityMatch } from "../types.js";

const SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");

const SECURITY_PATTERNS: SecurityPattern[] = [
  // Prompt injection (migrated from PI_PATTERN)
  { id: "pi-ignore-previous", severity: "dangerous", category: "prompt_injection", pattern: /(?:ignore previous|disregard above|<\||system:.*you are now|dump.*database|forget.*instructions)/i, description: "Prompt injection attempt" },

  // Dangerous bash (migrated from BASH_PATTERN)
  { id: "bash-rf-slash", severity: "dangerous", category: "execution", pattern: /rm -rf \/(?: |$)|curl[^|]*\| *(?:ba)?sh|eval\s+\$\(|wget[^|]*-O\s*-/, description: "Dangerous bash command" },

  // Secret leaks (migrated from SECRET_PATTERN)
  { id: "secret-api-key", severity: "dangerous", category: "secret", pattern: /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9]{36})/, description: "Secret or credential leak" },

  // Persistence
  { id: "persist-crontab", severity: "dangerous", category: "persistence", pattern: /crontab\s+/, description: "Crontab persistence" },
  { id: "persist-bashrc", severity: "dangerous", category: "persistence", pattern: /\.(?:bashrc|zshrc|profile|bash_profile)\b/, description: "Shell RC file modification" },
  { id: "persist-authorized-keys", severity: "dangerous", category: "persistence", pattern: /authorized_keys/, description: "SSH authorized_keys modification" },
  { id: "persist-systemd", severity: "dangerous", category: "persistence", pattern: /systemctl\s+(?:enable|start|create)/, description: "Systemd service persistence" },
  { id: "persist-launchd", severity: "dangerous", category: "persistence", pattern: /launchctl\s+(?:load|start)/, description: "Launchd persistence" },
  { id: "persist-at", severity: "caution", category: "persistence", pattern: /\bat\b\s+/, description: "At command scheduled execution" },

  // Network
  { id: "net-reverse-shell-tcp", severity: "dangerous", category: "network", pattern: /\/dev\/tcp\//, description: "Bash /dev/tcp reverse shell" },
  { id: "net-reverse-shell", severity: "dangerous", category: "network", pattern: /(?:nc|ncat|netcat)\s+.*-[elv]/, description: "Netcat reverse shell" },
  { id: "net-tunnel", severity: "dangerous", category: "network", pattern: /(?:ngrok|cloudflared)\s+/, description: "Tunneling tool usage" },
  { id: "net-hardcoded-ip", severity: "caution", category: "network", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}\b/, description: "Hardcoded IP:port" },
  { id: "net-socat", severity: "dangerous", category: "network", pattern: /socat\s+/, description: "Socat network relay" },
  { id: "net-nc-listen", severity: "dangerous", category: "network", pattern: /nc\s+-l/, description: "Netcat listener" },

  // Execution
  { id: "exec-subprocess", severity: "dangerous", category: "execution", pattern: /subprocess\.(?:call|run|Popen|check_output)/, description: "Python subprocess execution" },
  { id: "exec-os-system", severity: "dangerous", category: "execution", pattern: /os\.system\s*\(/, description: "os.system execution" },
  { id: "exec-os-exec", severity: "dangerous", category: "execution", pattern: /os\.exec[a-z]+\s*\(/, description: "os.exec family execution" },
  { id: "exec-child-process", severity: "dangerous", category: "execution", pattern: /child_process\.exec(?:Sync)?\s*\(/, description: "Node.js child_process.exec" },
  { id: "exec-eval", severity: "caution", category: "execution", pattern: /eval\s*\(/, description: "eval() execution" },
  { id: "exec-popen", severity: "dangerous", category: "execution", pattern: /(?:os\.)?popen\s*\(/, description: "popen execution" },

  // Path traversal
  { id: "path-traversal-dot", severity: "dangerous", category: "path_traversal", pattern: /\.\.[\\\/]/, description: "Directory traversal with ../" },
  { id: "path-etc-passwd", severity: "dangerous", category: "path_traversal", pattern: /\/etc\/passwd/, description: "Access to /etc/passwd" },
  { id: "path-proc-self", severity: "dangerous", category: "path_traversal", pattern: /\/proc\/self/, description: "Access to /proc/self" },
  { id: "path-root-ssh", severity: "dangerous", category: "path_traversal", pattern: /\/root\/\.ssh/, description: "Access to /root/.ssh" },
  { id: "path-etc-shadow", severity: "dangerous", category: "path_traversal", pattern: /\/etc\/shadow/, description: "Access to /etc/shadow" },

  // Data exfiltration
  { id: "exfil-curl-token", severity: "dangerous", category: "data_exfiltration", pattern: /curl.*\$\{?[A-Z_]+[A-Z_0-9]*\}?/, description: "curl with env var token" },
  { id: "exfil-environ-pipe", severity: "dangerous", category: "data_exfiltration", pattern: /os\.environ.*\|/, description: "os.environ piped externally" },
  { id: "exfil-dns", severity: "dangerous", category: "data_exfiltration", pattern: /(?:nslookup|dig|host)\s+.*\$/, description: "DNS exfiltration" },
  { id: "exfil-markdown-image", severity: "dangerous", category: "data_exfiltration", pattern: /!\[.*\]\(https?:\/\/[^)]*\$\{/, description: "Markdown image exfiltration" },
  { id: "exfil-env-log", severity: "dangerous", category: "data_exfiltration", pattern: /(?:console\.log|print|logger).*os\.environ/, description: "Environment variable logging" },
  { id: "exfil-proc-environ", severity: "dangerous", category: "data_exfiltration", pattern: /\/proc\/self\/environ/, description: "Access to /proc/self/environ" },
  { id: "exfil-webhook-secret", severity: "dangerous", category: "data_exfiltration", pattern: /(?:webhook|hook)\s+.*(?:token|key|secret|password)/, description: "Webhook with secret" },

  // Unicode
  { id: "unicode-bidi-override", severity: "dangerous", category: "unicode", pattern: /[‪-‮]/, description: "Bidirectional override character" },
  { id: "unicode-zero-width", severity: "caution", category: "unicode", pattern: /[​‌‍﻿]/, description: "Zero-width or BOM character" },
  { id: "unicode-function-app", severity: "caution", category: "unicode", pattern: /[⁡-⁤]/, description: "Invisible function application character" },
  { id: "unicode-soft-hyphen", severity: "caution", category: "unicode", pattern: /­/, description: "Soft hyphen" },
  { id: "unicode-grapheme-joiner", severity: "caution", category: "unicode", pattern: /͏/, description: "Combining grapheme joiner" },
];

function scanContent(content: string): SecurityMatch[] {
  const matches: SecurityMatch[] = [];
  for (const p of SECURITY_PATTERNS) {
    if (p.pattern.test(content)) {
      matches.push({ id: p.id, severity: p.severity, category: p.category, description: p.description });
    }
  }
  return matches;
}

interface ScanOptions {
  maxSkillSize?: number;
}

export function scanWrite(
  targetPath: string,
  content: string,
  options: ScanOptions = {}
): ScanResult {
  const maxSkillSize = options.maxSkillSize ?? 262144;

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

  // 2. Scan raw content with all patterns
  const rawMatches = scanContent(content);

  // 3. Scan base64-decoded content with all patterns
  const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
  const MAX_TOKENS = 50;
  let tokenCount = 0;
  let match: RegExpExecArray | null;
  const base64Matches: SecurityMatch[] = [];
  while ((match = base64Pattern.exec(content)) !== null && tokenCount < MAX_TOKENS) {
    tokenCount++;
    try {
      const decoded = Buffer.from(match[0], "base64").toString("utf-8");
      if (decoded.length < 4) continue;
      const printable = decoded.replace(/[^\x20-\x7E\t\n]/g, "").length;
      if (printable * 100 < decoded.length * 80) continue;
      const decodedMatches = scanContent(decoded);
      for (const m of decodedMatches) {
        base64Matches.push({ ...m, id: `${m.id}__base64` });
      }
    } catch {
      // Not valid base64, skip
    }
  }

  const allMatches = [...rawMatches, ...base64Matches];

  // 4. Determine result based on matches
  const dangerousMatches = allMatches.filter((m) => m.severity === "dangerous");
  const cautionMatches = allMatches.filter((m) => m.severity === "caution");

  if (dangerousMatches.length > 0) {
    const categories = [...new Set(dangerousMatches.map((m) => m.category))];
    const isBase64 = dangerousMatches.some((m) => m.id.includes("__base64"));
    const reason = isBase64
      ? `${categories.join(", ")} pattern (base64-decoded)`
      : `${categories.join(", ")} pattern`;
    return { allowed: false, reason, matches: allMatches };
  }

  // 5. Size limit
  const size = Buffer.byteLength(content, "utf-8");
  if (size > maxSkillSize) {
    return { allowed: false, reason: `file too large (${size} > ${maxSkillSize} bytes)` };
  }

  // 6. Caution matches: allowed but with warning
  if (cautionMatches.length > 0) {
    const categories = [...new Set(cautionMatches.map((m) => m.category))];
    return { allowed: true, reason: `caution: ${categories.join(", ")} pattern`, matches: allMatches };
  }

  return { allowed: true };
}

// ─── Directory Structural Scan ────────────────────────────────────────

interface DirectoryScanOptions {
  maxFiles?: number;
  maxFileSize?: number;
  maxTotalSize?: number;
  binaryExtensions?: string[];
}

export function scanDirectory(
  dirPath: string,
  options: DirectoryScanOptions = {}
): ScanResult {
  const maxFiles = options.maxFiles ?? 50;
  const maxFileSize = options.maxFileSize ?? 262144;
  const maxTotalSize = options.maxTotalSize ?? 1048576;
  const binaryExtensions = options.binaryExtensions ?? [".exe", ".dll", ".so", ".dylib", ".bin", ".bat", ".cmd", ".ps1", ".com"];

  const normalizedDir = path.normalize(dirPath);
  let fileCount = 0;
  let totalSize = 0;

  // Resolve real path to handle macOS /var → /private/var symlink
  let resolvedBaseDir: string;
  try {
    resolvedBaseDir = fs.realpathSync(normalizedDir);
  } catch {
    resolvedBaseDir = normalizedDir;
  }

  function walkDir(currentDir: string): ScanResult | null {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return { allowed: false, reason: `cannot scan directory: ${currentDir}` };
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        const subResult = walkDir(fullPath);
        if (subResult && !subResult.allowed) return subResult;
        continue;
      }

      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) {
        const resolved = fs.realpathSync(fullPath);
        const normalizedResolved = path.normalize(resolved);
        const baseDir = path.normalize(resolvedBaseDir);
        if (!normalizedResolved.startsWith(baseDir + path.sep) && normalizedResolved !== baseDir) {
          return { allowed: false, reason: `symlink escape: ${entry.name} -> ${resolved}` };
        }
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (binaryExtensions.includes(ext)) {
        return { allowed: false, reason: `binary file: ${entry.name}` };
      }

      const stat = fs.statSync(fullPath);
      if (stat.size > maxFileSize) {
        return { allowed: false, reason: `file too large: ${entry.name} (${stat.size} > ${maxFileSize} bytes)` };
      }

      totalSize += stat.size;
      fileCount++;
    }

    return null;
  }

  try {
    const walkResult = walkDir(dirPath);
    if (walkResult && !walkResult.allowed) return walkResult;

    if (fileCount > maxFiles) {
      return { allowed: false, reason: `too many files: ${fileCount} > ${maxFiles}` };
    }

    if (totalSize > maxTotalSize) {
      return { allowed: false, reason: `total size too large: ${totalSize} > ${maxTotalSize} bytes` };
    }
  } catch {
    return { allowed: false, reason: `cannot scan directory: ${dirPath}` };
  }

  return { allowed: true };
}
