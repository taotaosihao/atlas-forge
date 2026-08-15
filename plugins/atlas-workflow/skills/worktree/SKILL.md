---
name: worktree
description: Use the Atlas worktree flow when a task needs an isolated git worktree.
---

Use the Atlas worktree flow for this request.

## Host Note

Codex invokes this flow as `$atlas-workflow:worktree`; Claude Code invokes it as `/worktree` or by calling the `worktree` skill directly. For CLI commands below, prefer the bare `atlas-workflow` command on `PATH`, falling back to the absolute `~/.codex/workflow/bin/codex-workflow` only when no `PATH` command is available.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

## Short Request Intake Gate

Before creating a worktree or isolated environment, classify the request.
One-line or low-information requests default to intake or clarify when they have
multiple plausible meanings, lack a clear acceptance path, or omit important
user, data, permission, deployment, workflow, or ownership boundaries. In that
case, do not create the worktree or edit code; ask the fewest blocking questions
needed and give critical feedback about the main ambiguity, risk, simpler
alternative, or stop condition.

Direct worktree setup is allowed only after the tiny escape hatch is satisfied
or after non-tiny documentation is in place. For the tiny escape hatch, the
affected surface, expected behavior, validation path, and risk are all clear; the
change does not touch data, permissions, deployment, migration, product strategy,
or architecture boundaries; and the scope is normally a single file or similarly
small. If tiny classification is uncertain, ask one short question before
creating the worktree.

Non-tiny work must have auditable documentation before worktree setup or code
changes. Existing external issues, PRDs, or design docs may count as equivalent
evidence only when the current workflow artifact cites them and fills missing
acceptance, verification, risk, and stop-condition gaps. At minimum use
`context.md` and `spec.md`; execution-ready changes should also have a project
doc or lightweight implementation contract.

Follow this loop:

1. Apply the short request intake gate before deciding whether a worktree is actually needed.
   - If the request fails the gate, switch to `$atlas-workflow:intake` or `$atlas-workflow:clarify` instead of creating a worktree.
2. Decide whether a worktree is actually needed.
   - Do not use one for a small feature, small fix, copy change, or other bounded edit.
   - Use one when the user asks for isolation, the change is broad or risky, the work will run for a while, or you need to keep the current workspace clean.
   - If a worktree is not needed, stay in the current workspace and continue with the normal Atlas task flow.
3. Start from the active Atlas task when possible.
   - Run `~/.codex/workflow/bin/codex-workflow list`.
   - Reuse the relevant `doing` task or create/start one.
   - Prefer a branch and worktree name derived from the task id.
4. Choose the worktree location in this order:
   - existing `.worktrees/`
   - existing `worktrees/`
   - repo instructions in `AGENTS.md`, `README.md`, or nearby docs
   - otherwise default to `~/.codex/worktrees/<project-name>/`
5. If you use `.worktrees/` or `worktrees/`, verify the directory is ignored with `git check-ignore`.
   - If it is not ignored, either add the ignore rule before continuing or fall back to the global Atlas location.
   - Do not create a project-local worktree inside a tracked directory.
6. Create the worktree on a non-main branch.
   - Never do the work on `main` or `master`.
   - Example:
     - `project_root="$(git rev-parse --show-toplevel)"`
     - `project_name="$(basename "$project_root")"`
     - `branch_name="<task-id-or-short-slug>"`
     - `git worktree add "$path" -b "$branch_name"`
7. Run the project setup from inside the new worktree.
   - Use the repo's real setup path based on its lockfiles and tooling.
8. If the repo has Docker Compose files and the user did not explicitly say otherwise, start a separate Compose project for this worktree before testing.
   - Detect `compose.yml`, `compose.yaml`, `docker-compose.yml`, or `docker-compose.yaml`.
   - Use a unique project name derived from the repo and branch, for example `docker compose -p "$compose_project" up -d`.
   - Do not reuse the main branch's default Compose project or containers.
   - If ports or env settings collide and the repo has no documented way to isolate them, ask one short blocking question instead of silently falling back to the main stack.
9. Verify the isolated environment before implementation.
   - When Compose is used, run `docker compose -p "$compose_project" ps`.
   - Run the repo's normal baseline tests from the worktree.
   - If the baseline is already failing, stop and report that before adding new changes.
10. Before reporting the worktree ready, run the relevant `~/.codex/workflow/bin/codex-workflow ready <task-id> --require ...` check when planning artifacts exist, or `ready --skip "<why worktree setup is intentionally minimal>"` when this is only environment setup.
11. Report the ready state with the task id, branch, worktree path, Compose project name if one was started, and readiness/skip result.
12. When implementation is complete, switch to `$atlas-workflow:finish`.
    - Do not merge, discard, shut down the dedicated Compose project, or remove the worktree automatically at this stage.
    - Default behavior is to stop for user confirmation before any of those actions.
    - Only skip that pause when the user has already said to merge straight back to the main branch without confirmation.
13. In the final reply, include the task id, branch, worktree path, Compose project name if used, readiness/skip result, baseline verification command and result, and the next `$atlas-workflow:finish` handoff.
