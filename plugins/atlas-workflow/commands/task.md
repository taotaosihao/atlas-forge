---
description: Use the Atlas task flow for bounded implementation, diagnosis, or maintenance
argument-hint: '[request]'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

Raw slash-command arguments:
`$ARGUMENTS`

Use the `task` skill for this request. Follow its routing, artifact, Team, review, commit, and completion rules exactly as written there; this command is only the Claude Code entrypoint into that skill.
