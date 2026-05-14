import fs from "node:fs";
import path from "node:path";

function appendLine(logPath: string, line: string): void {
  try {
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logPath, line + "\n", "utf-8");
  } catch {
    // Best-effort: log failures must not abort the caller
  }
}

export function logEvent(
  logPath: string,
  level: string,
  event: string,
  kv: Record<string, unknown> = {}
): void {
  const entry = {
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    level,
    event,
    pid: process.pid,
    ...kv,
  };
  appendLine(logPath, JSON.stringify(entry));
}

export function logDecision(
  logPath: string,
  decision: string,
  detail: string,
  durationMs: number,
  sessionId: string
): void {
  const entry = {
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    level: "info",
    event: "reviewer_decision",
    decision,
    detail,
    duration_ms: durationMs,
    session_id: sessionId,
    pid: process.pid,
  };
  appendLine(logPath, JSON.stringify(entry));
}
