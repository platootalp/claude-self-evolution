import { scanWrite } from "../lib/security.js";
import type { ScanResult } from "../types.js";
import type { Logger } from "../lib/logger.js";

interface SecurityScanArgs {
  path: string;
  content: string;
  maxSkillSize?: number;
}

export function handleSecurityScan(args: SecurityScanArgs, logger?: Logger): ScanResult {
  const result = scanWrite(args.path, args.content, {
    maxSkillSize: args.maxSkillSize,
  });
  if (!result.allowed) {
    logger?.info("security_blocked", {
      category: result.reason ?? "unknown",
      target_path: args.path,
    });
  } else {
    logger?.debug("security_scan_detail", {
      target_path: args.path,
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
    }
  }
  return args;
}
