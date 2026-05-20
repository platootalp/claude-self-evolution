import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { ScanResult, SecurityPattern, SecurityMatch, TrustLevel } from "../types.js";

// Lazy-loaded to support test mocking
let _skillDirs: string[] | null = null;
export function _resetSkillsDirCache(): void {
  _skillDirs = null;
}
export function _setSkillsDirs(dirs: string[]): void {
  _skillDirs = dirs;
}
function getSkillDirs(): string[] {
  if (!_skillDirs) {
    _skillDirs = [path.join(os.homedir(), ".claude", "skills")];
  }
  return _skillDirs;
}

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

  // P1: Jailbreak
  { id: "jb-dan-mode", severity: "dangerous", category: "jailbreak", pattern: /(?:^|\s)DAN\s+mode/i, description: "DAN mode jailbreak" },
  { id: "jb-developer-mode", severity: "dangerous", category: "jailbreak", pattern: /(?:^|\s)developer\s+mode/i, description: "Developer mode jailbreak" },
  { id: "jb-stan", severity: "dangerous", category: "jailbreak", pattern: /(?:^|\s)STAN\s+mode/i, description: "STAN jailbreak" },
  { id: "jb-keyword", severity: "dangerous", category: "jailbreak", pattern: /\bjailbreak\b/i, description: "Direct jailbreak keyword" },
  { id: "jb-bypass-safety", severity: "dangerous", category: "jailbreak", pattern: /(?:respond\s+without\s+safety\s+filters|bypass\s+safety)/i, description: "Safety filter bypass" },
  { id: "jb-unrestricted", severity: "dangerous", category: "jailbreak", pattern: /you\s+are\s+now\s+unrestricted/i, description: "Unrestricted mode activation" },
  { id: "jb-no-rules", severity: "dangerous", category: "jailbreak", pattern: /act\s+as\s+if\s+you\s+have\s+no\s+rules/i, description: "Rule suspension request" },
  { id: "jb-ignore-guidelines", severity: "dangerous", category: "jailbreak", pattern: /ignore\s+your\s+guidelines/i, description: "Guideline bypass" },

  // P1: Supply chain
  { id: "sc-curl-pipe-sh", severity: "dangerous", category: "supply_chain", pattern: /curl[^|]*\|\s*(?:ba)?sh/, description: "Piped remote execution" },
  { id: "sc-pip-unpinned", severity: "caution", category: "supply_chain", pattern: /pip\s+install\s+(?!.*==)[A-Za-z]/, description: "Unpinned pip install" },
  { id: "sc-npm-global", severity: "caution", category: "supply_chain", pattern: /npm\s+install\s+-g\s/, description: "Global npm install" },
  { id: "sc-uv-run", severity: "caution", category: "supply_chain", pattern: /uv\s+run/, description: "Unpinned uv execution" },
  { id: "sc-git-clone-exec", severity: "caution", category: "supply_chain", pattern: /git\s+clone.*(?:\/bin\/|\/usr\/local\/bin|\.local\/bin)/, description: "Git clone to executable path" },

  // P1: Privilege escalation
  { id: "pe-allowed-tools", severity: "dangerous", category: "privilege_escalation", pattern: /allowed-tools/i, description: "Allowed-tools injection" },
  { id: "pe-sudo", severity: "dangerous", category: "privilege_escalation", pattern: /\bsudo\s+/, description: "Sudo elevation" },
  { id: "pe-setuid", severity: "dangerous", category: "privilege_escalation", pattern: /\bsetuid\b|\bsetgid\b/i, description: "SUID/SGID bit manipulation" },
  { id: "pe-chmod-s", severity: "dangerous", category: "privilege_escalation", pattern: /chmod\s+\+s\b/, description: "Setting SUID/SGID bits" },
  { id: "pe-nopasswd", severity: "dangerous", category: "privilege_escalation", pattern: /NOPASSWD/i, description: "Passwordless sudo" },

  // P1: Agent config tampering
  { id: "ac-agents-md", severity: "dangerous", category: "agent_config_tampering", pattern: /AGENTS\.md/i, description: "AGENTS.md modification" },
  { id: "ac-claude-md", severity: "dangerous", category: "agent_config_tampering", pattern: /CLAUDE\.md/i, description: "CLAUDE.md modification" },
  { id: "ac-claude-dir", severity: "dangerous", category: "agent_config_tampering", pattern: /\.claude\/(?:settings|hooks|config)/, description: ".claude/ config modification" },
  { id: "ac-settings-json", severity: "dangerous", category: "agent_config_tampering", pattern: /settings\.local\.json/, description: "Local settings modification" },

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

// ─── Trust Policy ──────────────────────────────────────────────────────

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

interface ScanOptions {
  maxSkillSize?: number;
  trust?: string;
}

export function scanWrite(
  targetPath: string,
  content: string,
  options: ScanOptions = {}
): ScanResult {
  const maxSkillSize = options.maxSkillSize ?? 262144;

  // 1. Path whitelist: check against all configured skill dirs
  const normalizedTarget = path.normalize(targetPath);
  const skillDirs = getSkillDirs();

  let matchedSkillsDir: string | null = null;
  for (const dir of skillDirs) {
    const normalizedSkillsDir = path.normalize(dir);
    if (normalizedTarget.startsWith(normalizedSkillsDir + path.sep) || normalizedTarget === normalizedSkillsDir) {
      matchedSkillsDir = normalizedSkillsDir;
      break;
    }
  }

  if (matchedSkillsDir) {
    const rel = path.relative(matchedSkillsDir, normalizedTarget);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return { allowed: false, reason: "path_escape: write outside skills/<name>/" };
    }

    const isSkillMd = /^[^/]+\/SKILL\.md$/.test(rel);
    const isReferences = /^[^/]+\/references\//.test(rel);
    const isTemplates = /^[^/]+\/templates\//.test(rel);

    if (!isSkillMd && !isReferences && !isTemplates) {
      return { allowed: false, reason: "path_escape: write to skills/ must be to <name>/SKILL.md, <name>/references/**, or <name>/templates/**" };
    }

    const ALLOWED_AUX_EXTENSIONS = [".md", ".txt", ".yaml", ".yml", ".json"];
    if (isReferences || isTemplates) {
      const ext = path.extname(normalizedTarget).toLowerCase();
      if (!ALLOWED_AUX_EXTENSIONS.includes(ext)) {
        return { allowed: false, reason: `file_type: auxiliary files must be one of ${ALLOWED_AUX_EXTENSIONS.join(", ")}, got '${ext}'` };
      }
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

  // 4. Determine result based on matches and trust policy
  const trust = options.trust ?? "agent-created";
  const blockedDangerous = allMatches.filter((m) => m.severity === "dangerous" && !applyTrustPolicy("dangerous", trust));
  const blockedCaution = allMatches.filter((m) => m.severity === "caution" && !applyTrustPolicy("caution", trust));
  const warnCaution = allMatches.filter((m) => m.severity === "caution" && applyTrustPolicy("caution", trust));

  if (blockedDangerous.length > 0) {
    const categories = [...new Set(blockedDangerous.map((m) => m.category))];
    const isBase64 = blockedDangerous.some((m) => m.id.includes("__base64"));
    const reason = isBase64
      ? `${categories.join(", ")} pattern (base64-decoded)`
      : `${categories.join(", ")} pattern`;
    return { allowed: false, reason, matches: allMatches };
  }

  if (blockedCaution.length > 0) {
    const categories = [...new Set(blockedCaution.map((m) => m.category))];
    return { allowed: false, reason: `caution (blocked by trust '${trust}'): ${categories.join(", ")} pattern`, matches: allMatches };
  }

  // 5. Size limit
  const size = Buffer.byteLength(content, "utf-8");
  if (size > maxSkillSize) {
    return { allowed: false, reason: `file too large (${size} > ${maxSkillSize} bytes)` };
  }

  // 6. Caution matches: allowed but with warning (only if trust policy permits)
  if (warnCaution.length > 0) {
    const categories = [...new Set(warnCaution.map((m) => m.category))];
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
