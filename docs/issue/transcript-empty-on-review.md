# Issue: Companion Agent Receives Empty Transcript

**Severity**: P0 — blocker, all reviews are SKIPPED
**Discovered**: 2026-05-15
**Status**: Open

## Symptom

Every companion agent review ends with `SKIPPED` because the transcript is empty. All 3 recorded decisions show empty-transcript skip reasons:

```
"Empty session: zero turns, no workflow to extract."
"empty transcript, no workflow to extract"
"Empty transcript: no conversation data to extract workflow from"
```

## Root Cause

**`transcript_path` is never passed from the stop-gate hook to the companion agent process.**

The data flow breaks at the spawner boundary:

```
Stop hook (stdin)
  → { session_id, transcript_path }     ✅ transcript_path present
    → stop-gate.ts
      → spawner.spawnReviewProcess({     ✅ transcriptPath in SpawnOptions
          sessionId,
          transcriptPath,                ← value is here
          pluginRoot,
          pluginData
        })
          → spawner.ts (ClaudeCodeSpawner)
            → env: {                     ❌ transcriptPath NOT in env
                CLAUDE_PLUGIN_ROOT,
                CLAUDE_PLUGIN_DATA,
                SELF_EVOLUTION_SESSION_ID
              }
            → prompt template             ❌ no ${TRANSCRIPT_PATH} substitution
```

### The broken link: `src/lib/spawner.ts:69-74`

```typescript
env: {
  ...process.env,
  CLAUDE_PLUGIN_ROOT: opts.pluginRoot,
  CLAUDE_PLUGIN_DATA: opts.pluginData,
  SELF_EVOLUTION_SESSION_ID: opts.sessionId,
  // MISSING: SELF_EVOLUTION_TRANSCRIPT_PATH: opts.transcriptPath
},
```

### The receiving side: `src/runtime.ts:88`

```typescript
const transcriptPath = args[0] || process.env.SELF_EVOLUTION_TRANSCRIPT_PATH || "";
// args[0] is empty (prompt doesn't pass it as CLI arg)
// SELF_EVOLUTION_TRANSCRIPT_PATH env var is never set
// → falls back to "" → empty transcript
```

## Secondary Issues

### 2. Prompt template doesn't pass transcript path as argument

`prompts/review-prompt.md` line 8:
```
node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context
```

The `review-context` command accepts an optional `args[0]` for the transcript path, but the prompt template doesn't supply it. Even if the env var fix is applied, the prompt should also be updated for defense-in-depth.

### 3. `buildReviewPrompt` doesn't substitute transcript path

`src/lib/spawner.ts:43-46` — only substitutes 3 variables:
```typescript
return template
  .replace(/\${SELF_EVOLUTION_SESSION_ID}/g, opts.sessionId)
  .replace(/\${CLAUDE_PLUGIN_ROOT}/g, opts.pluginRoot)
  .replace(/\${CLAUDE_PLUGIN_DATA}/g, opts.pluginData);
// MISSING: .replace(/\${SELF_EVOLUTION_TRANSCRIPT_PATH}/g, opts.transcriptPath)
```

### 4. Silent failure in `parseTranscript`

`src/lib/transcript.ts:13-17`:
```typescript
try {
  raw = fs.readFileSync(transcriptPath, "utf-8").trim();
} catch {
  return summary;  // silently returns empty summary
}
```

When `transcriptPath` is `""`, `readFileSync("")` throws, and the empty summary is returned with no error message. This makes debugging extremely difficult — the reviewer sees "zero turns" but has no indication that the path was missing.

### 5. Detached companion with no feedback

`src/lib/spawner.ts:66-77`: The companion process is spawned with `stdio: "ignore"` and `detached: true`. If it fails or produces errors, there's no log or feedback mechanism. The main session has no way to know the companion's outcome beyond the `log-decision` command.

## Fix Plan

### Fix 1 (Critical): Pass transcript path as env var

In `src/lib/spawner.ts`, add to the `env` object:

```typescript
env: {
  ...process.env,
  CLAUDE_PLUGIN_ROOT: opts.pluginRoot,
  CLAUDE_PLUGIN_DATA: opts.pluginData,
  SELF_EVOLUTION_SESSION_ID: opts.sessionId,
  SELF_EVOLUTION_TRANSCRIPT_PATH: opts.transcriptPath,  // ADD THIS
},
```

### Fix 2 (Defense-in-depth): Update prompt template

In `prompts/review-prompt.md`, update the review-context command:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context "${SELF_EVOLUTION_TRANSCRIPT_PATH}"
```

And in `buildReviewPrompt`, add the substitution:

```typescript
.replace(/\${SELF_EVOLUTION_TRANSCRIPT_PATH}/g, opts.transcriptPath)
```

### Fix 3 (Observability): Add warning when transcript path is empty

In `src/runtime.ts:88`, add a log when the path is missing:

```typescript
const transcriptPath = args[0] || process.env.SELF_EVOLUTION_TRANSCRIPT_PATH || "";
if (!transcriptPath) {
  logger.warn("review_context_missing_transcript_path", { args, env: !!process.env.SELF_EVOLUTION_TRANSCRIPT_PATH });
}
```

### Fix 4 (Robustness): Add error logging in `parseTranscript`

In `src/lib/transcript.ts`, log when the path is empty or read fails:

```typescript
if (!transcriptPath) {
  // Return empty with indication that path was missing
  return summary;
}
try {
  raw = fs.readFileSync(transcriptPath, "utf-8").trim();
} catch (err) {
  // At minimum, stderr so the companion agent can see it
  process.stderr.write(`[self-evolution] Failed to read transcript at "${transcriptPath}": ${err}\n`);
  return summary;
}
```

## Affected Files

| File | Change |
|------|--------|
| `src/lib/spawner.ts` | Add `SELF_EVOLUTION_TRANSCRIPT_PATH` to env + prompt substitution |
| `prompts/review-prompt.md` | Add `${SELF_EVOLUTION_TRANSCRIPT_PATH}` to review-context command |
| `src/runtime.ts` | Add warning log when transcript path is empty |
| `src/lib/transcript.ts` | Add error output when read fails |
