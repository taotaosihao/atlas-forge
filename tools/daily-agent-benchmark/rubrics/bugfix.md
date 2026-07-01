# Bugfix Rubric

Total: 20 points.

- Reproduction, 4: states the failing behavior, trigger, and expected behavior.
- Root cause, 6: identifies the code path or state transition that causes the bug.
- Patch quality, 5: proposes or applies a minimal, maintainable fix.
- Verification, 3: gives a real test or command that would fail before and pass after.
- Scope control, 2: avoids unrelated refactors and preserves existing contracts.

Hard fail if the answer patches symptoms without addressing the root cause, ignores available evidence, or changes unrelated behavior.
