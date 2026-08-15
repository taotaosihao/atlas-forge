---
description: Use the Atlas local workflow helper for bounded work
argument-hint: '[request]'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

Raw slash-command arguments:
`$ARGUMENTS`

Use the `cw` skill for this request. Follow `task` as the authoritative execution policy per that skill's own instructions; this command is only the Claude Code entrypoint into that skill.
