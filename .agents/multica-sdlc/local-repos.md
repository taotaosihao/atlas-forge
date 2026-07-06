# Local Repository Registry

Prefer these local repositories before using `multica repo checkout` or cloning.

| Project | Local path | Primary remote | Default base branch |
| --- | --- | --- | --- |
| gearjob | `$GEARJOB_REPO` | `git@github.com:taotaosihao/gearjob.git` | `develop` |
| beezer | `$BEEZER_REPO` | `https://cnb.cool/gewu-data/beezer` | `main` |
| hive | `$HIVE_REPO` | `git@github.com:taotaosihao/hive.git` | `develop` |

Rules:
- Use the local path when it exists and is a git work tree.
- Create a dedicated branch or worktree from the configured base branch inside the local repository when isolation is needed.
- If the planned code delta is estimated above 100 lines, a dedicated git worktree is mandatory. If the estimate is unknown, treat it as above 100 lines until proven otherwise.
- Keep dedicated worktrees until the related PR review is complete and the PR is confirmed merged into the configured base branch. Then remove the worktree and delete the merged local branch when the worktree is clean and the branch is contained in the base branch.
- Use `multica repo checkout <url>` only when the local path is missing, unreadable, explicitly stale, or the issue requires a clean remote checkout.
- Do not clone a second copy of these repositories by default.
- For these three projects, completion requires local deployment/runtime startup before draft PR.
- Frontend/UI changes require local visual evidence: screenshot plus GIF or MP4 when interaction, animation, responsive behavior, or multi-step flow is relevant.
- Backend/API/worker/data changes require local runtime evidence: command output, request/response, job log, migration log, server log, or database assertion that proves the task works.
- Store or reference evidence paths in the PR-ready gate and draft PR body.
