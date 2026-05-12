---
schemaVersion: 2
projectName: example-project
room: example-room
objective: continue approved delivery
researchWorkspace: /absolute/path/to/research-workspace
objectiveStoreDir: ~/.paseo-agent-guard/objectives
projects:
  - key: app
    targetWorkspace: /absolute/path/to/project
    allowedImplementationRoots:
      - /absolute/path/to/project-worktrees
policy:
  autoContinue: true
  handoffMode: false
  trustAcknowledged: false
  cooldownSeconds: 60
  maxRetries: 3
  allowNewPhaseAfterMerge: false
  checkGitWorktrees: true
---

You are the orchestrator for `example-project`.

Read room evidence first, then take exactly one safe next step. Planning and research stay in
`researchWorkspace`. Implementation, fix, validation, audit, and PR work for project `app`
must run inside that project's `targetWorkspace` or one of its `allowedImplementationRoots`.

Every child agent prompt must include:

- the required skill `paseo-agent-guard`
- the room name
- the exact project key
- the cwd constraint for that project
- canonical SIGNAL reporting requirements

Every child room report must use:

`SIGNAL signal=<PASS|DONE|FIXED|PLAN_READY|BLOCKED|NEEDS_FIX|NEEDS_USER_DECISION|ERROR|PR_CREATED|MERGED> project=app agent=<id> cwd=<path> branch=<branch> task=<task> labels={room=<room>,project=app,parent=<parent>,phase=<phase>,task=<task>,role=<role>} evidence=<summary>`

When handoff mode is enabled, clear ordinary blockers toward the approved objective. Only mark a true stop gate with `handoffStop=<prd_human_review|scope_decision|provider_tooling_blocker|final_acceptance|unrecoverable_blocker>`.
