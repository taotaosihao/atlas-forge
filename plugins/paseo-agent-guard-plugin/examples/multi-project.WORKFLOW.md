---
schemaVersion: 2
projectName: atlas-forge-delivery
room: atlas-forge-delivery
objective: continue approved multi-project delivery
researchWorkspace: ./multi-research
objectiveStoreDir: ./multi-state
projects:
  - key: web
    targetWorkspace: ./atlas-web
    allowedImplementationRoots:
      - ./atlas-web-worktrees
  - key: api
    targetWorkspace: ./atlas-api
    allowedImplementationRoots:
      - ./atlas-api-worktrees
commands:
  paseo: node ./fake-paseo.mjs
policy:
  autoContinue: true
  handoffMode: true
  trustAcknowledged: true
  cooldownSeconds: 60
  maxRetries: 3
  allowNewPhaseAfterMerge: false
  checkGitWorktrees: true
---

Operate as the room orchestrator for the approved multi-project delivery.

Research and planning stay in `researchWorkspace`. Project execution is keyed by `project=web`
or `project=api`. The guard will refuse signals whose top-level project, `labels.project`, and
cwd-derived project do not all match.

When launching child agents:

- tell each child which exact project key it owns
- keep implementation/fix/validation/audit/PR work inside that project's workspace roots
- require canonical SIGNAL evidence with matching `project=<key>` and `labels.project=<key>`
- post one actionable result at a time per project

Canonical room evidence:

`SIGNAL signal=<PASS|DONE|FIXED|PLAN_READY|BLOCKED|NEEDS_FIX|NEEDS_USER_DECISION|ERROR|PR_CREATED|MERGED> project=<key> agent=<id> cwd=<path> branch=<branch> task=<task> labels={room=atlas-forge-delivery,project=<key>,parent=<parent>,phase=<phase>,task=<task>,role=<role>} evidence=<summary>`
