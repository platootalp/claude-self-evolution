---
description: Manually trigger skill review on the current conversation.
allowed-tools: Task
argument-hint: "[topic]"
---
Use the Task tool to launch the `skill-reviewer` subagent.

Pass these inputs to the subagent:
- Topic focus (optional, may be empty): $ARGUMENTS
- Conversation transcript: the last 30 turns of the current session
- Existing skills directory: ~/.claude/skills/

After the subagent completes, summarize what action was taken in ONE sentence.