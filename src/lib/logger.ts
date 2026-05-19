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

function shouldLog(level: string, eventLevel: string): boolean {
  if (level === "off") return false;
  if (level === "debug") return true;
  // level === "info" -> only info events
  return eventLevel === "info";
}

export interface Logger {
  info(event: string, kv: Record<string, unknown>): void;
  debug(event: string, kv: Record<string, unknown>): void;
  logDecision(decision: string, detail: string, durationMs: number): void;
}

export function createLogger(sessionsDir: string, sessionId: string, logLevel: string): Logger {
  const logPath = path.join(sessionsDir, sessionId, "log.jsonl");

  function writeEntry(eventLevel: string, event: string, kv: Record<string, unknown>): void {
    if (!shouldLog(logLevel, eventLevel)) return;
    try {
      // kv fields first so that fixed fields (ts, level, event, session_id, pid) take precedence
      const entry = {
        ...kv,
        ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        level: eventLevel,
        event,
        session_id: sessionId,
        pid: process.pid,
      };
      appendLine(logPath, JSON.stringify(entry));
    } catch {
      // Best-effort: serialization or write failures must not abort the caller
    }
  }

  return {
    info(event, kv) { writeEntry("info", event, kv); },
    debug(event, kv) { writeEntry("debug", event, kv); },
    logDecision(decision, detail, durationMs) {
      writeEntry("info", "review_decision", {
        decision,
        detail,
        duration_ms: durationMs,
      });
    },
  };
}
