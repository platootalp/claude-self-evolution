---
description: Manually trigger skill review on the current conversation.
allowed-tools: Task, Read, Write, Bash, Glob, Grep, Skill
argument-hint: [topic]
---

Use the Task tool to launch the `skill-reviewer` subagent.

Pass these inputs:
- Topic focus (optional): $ARGUMENTS
- Conversation transcript: the last 30 turns
- Existing skills: ~/.claude/skills/

After the subagent completes, summarize in ONE sentence.
