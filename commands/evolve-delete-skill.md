---
description: Delete a skill created by self-evolution. Requires confirmation.
allowed-tools: Bash(node:*)
argument-hint: "<skill-name>"
---

!`node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" delete-skill --name "$ARGUMENTS"`

If the result shows `{success: true}`, confirm to the user that the skill was deleted.
If `{success: false, message: "..."}`, report the error to the user.

After deletion, also log the decision:
!`node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "DELETED" "skill_name: $ARGUMENTS"`

IMPORTANT: Ask the user for confirmation before running the delete command. Show the skill name and explain this action cannot be undone.
