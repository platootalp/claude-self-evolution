---
description: Manage self-evolution plugin configuration through conversation.
allowed-tools: Task, Bash(node:*), Read
argument-hint: [setting or question]
---

Use the Task tool to launch the `config-agent` subagent.

Pass these inputs:
- User's question or request: $ARGUMENTS

After the subagent completes, summarize in ONE sentence.
