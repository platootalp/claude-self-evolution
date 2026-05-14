import { scanWrite } from "../lib/security.js";
import type { ScanResult } from "../types.js";

interface SecurityScanArgs {
  path: string;
  content: string;
  maxSkillSize?: number;
}

export function handleSecurityScan(args: SecurityScanArgs): ScanResult {
  return scanWrite(args.path, args.content, {
    maxSkillSize: args.maxSkillSize,
  });
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
