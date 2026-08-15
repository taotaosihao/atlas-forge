---
description: Use the Atlas team flow with native collaboration by default and Paseo only when explicitly selected for a Team, lane, or dispatch
argument-hint: '[request]'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion, Agent, SendMessage, TaskList, TaskGet, TaskOutput, TaskStop
---

Raw slash-command arguments:
`$ARGUMENTS`

Use the `team` skill for this request. Follow its backend selection, staffing, model, release, and lease rules exactly as written there, including the Claude Native Collaboration tool mapping; this command is only the Claude Code entrypoint into that skill.
