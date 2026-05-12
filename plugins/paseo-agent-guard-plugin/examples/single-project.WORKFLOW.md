---
schemaVersion: 2
projectName: gearjob-123-plm-next
room: gearjob-123-plm-next
objective: continue approved PLM delivery
researchWorkspace: ./demo-research
objectiveStoreDir: ./state
projects:
  - key: gearjob
    targetWorkspace: ./demo-project
    allowedImplementationRoots:
      - ./demo-project-worktrees
commands:
  paseo: node ./fake-paseo.mjs
policy:
  autoContinue: true
  handoffMode: false
  trustAcknowledged: false
  cooldownSeconds: 60
  maxRetries: 3
  allowNewPhaseAfterMerge: false
  checkGitWorktrees: true
---

Operate as the room orchestrator for the approved PLM delivery.

Keep planning, research, and orchestration in `researchWorkspace`.
All implementation, blocker fixes, validation, audit, review, PR, merge, and project execution
work for `project=gearjob` must be delegated to child agents in `./demo-project` or an allowed
linked worktree.

Child-agent contract:

- include the `paseo-agent-guard` skill in every child prompt
- pass labels `room`, `project`, `parent`, `phase`, `task`, `role`
- use background/no-wait child launches and start `paseo wait <agent-id> --json &`
- post only canonical room evidence with `project=gearjob`

Required room evidence:

`SIGNAL signal=<PASS|DONE|FIXED|PLAN_READY|BLOCKED|NEEDS_FIX|NEEDS_USER_DECISION|ERROR|PR_CREATED|MERGED> project=gearjob agent=<id> cwd=<path> branch=<branch> task=<task> labels={room=gearjob-123-plm-next,project=gearjob,parent=<parent>,phase=<phase>,task=<task>,role=<role>} evidence=<summary>`

Only child agents may author canonical project SIGNAL evidence. Orchestrator updates must use
diagnostic/progress/recovery messages, not child result SIGNALs.
