import { scanWrite, scanDirectory, _setSkillsDirs } from "../lib/security.js";
import { getAdapter } from "../lib/adapter.js";
import type { ScanResult } from "../types.js";
import type { Logger } from "../lib/logger.js";

interface SecurityScanArgs {
  path: string;
  content: string;
  maxSkillSize?: number;
  scanDir?: string;
  maxFiles?: number;
  maxFileSize?: number;
  maxTotalSize?: number;
  trust?: string;
}

export function handleSecurityScan(args: SecurityScanArgs, logger?: Logger): ScanResult {
  const adapter = getAdapter();
  _setSkillsDirs(adapter.skillDirs);

  let result: ScanResult;

  if (args.scanDir) {
    result = scanDirectory(args.scanDir, {
      maxFiles: args.maxFiles,
      maxFileSize: args.maxFileSize,
      maxTotalSize: args.maxTotalSize,
    });
  } else {
    result = scanWrite(args.path, args.content, {
      maxSkillSize: args.maxSkillSize,
      trust: args.trust,
    });
  }

  if (!result.allowed) {
    logger?.info("security_blocked", {
      category: result.reason ?? "unknown",
      target_path: args.scanDir ?? args.path,
    });
  } else {
    logger?.debug("security_scan_detail", {
      target_path: args.scanDir ?? args.path,
      result: "passed",
    });
  }
  return result;
}

export function parseSecurityScanArgs(argv: string[]): SecurityScanArgs {
  const args: SecurityScanArgs = { path: "", content: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--path" && argv[i + 1]) {
      args.path = argv[++i];
    } else if (argv[i] === "--content" && argv[i + 1]) {
      args.content = argv[++i];
    } else if (argv[i] === "--max-size" && argv[i + 1]) {
      args.maxSkillSize = parseInt(argv[++i], 10);
    } else if (argv[i] === "--scan-dir" && argv[i + 1]) {
      args.scanDir = argv[++i];
    } else if (argv[i] === "--max-files" && argv[i + 1]) {
      args.maxFiles = parseInt(argv[++i], 10);
    } else if (argv[i] === "--max-file-size" && argv[i + 1]) {
      args.maxFileSize = parseInt(argv[++i], 10);
    } else if (argv[i] === "--max-total-size" && argv[i + 1]) {
      args.maxTotalSize = parseInt(argv[++i], 10);
    } else if (argv[i] === "--trust" && argv[i + 1]) {
      args.trust = argv[++i];
    }
  }
  return args;
}
