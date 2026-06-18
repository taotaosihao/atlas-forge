---
name: learn
description: Use the legacy Atlas learning flow to save a manual archival lesson.
---

Use the local learning helper only when a user explicitly wants a legacy Atlas lesson file. MemPalace is the default long-term memory and semantic recall layer.

Follow this loop:

1. Prefer searching MemPalace first to avoid saving the same lesson twice.
2. Run `~/.codex/workflow/bin/codex-workflow list`.
3. Prefer the task id provided by the user. If none is provided, find the most relevant `done` task. If that is not clear, ask one short question.
4. Use `~/.codex/workflow/bin/codex-workflow show <task-id>` if you need the task details before saving the lesson.
5. Only save a lesson for a task that is already `done`.
6. Save the lesson with:
   - `~/.codex/workflow/bin/codex-workflow learn <task-id> "<lesson title>" "<lesson>"`
7. In the final reply, include the task id, lesson title, learning path or id, and whether MemPalace already had related content.
