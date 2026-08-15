---
description: Use the Atlas finish flow when isolated branch work is complete and needs confirmation, integration, or cleanup
argument-hint: '[request]'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

Raw slash-command arguments:
`$ARGUMENTS`

Use the `finish` skill for this request. Follow its confirmation and integration rules exactly as written there; this command is only the Claude Code entrypoint into that skill.
