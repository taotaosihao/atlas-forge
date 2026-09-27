# UI/UX guidance

Use when designing, changing, or reviewing a GUI surface users see or operate.
These are review prompts, not a visual system, token set, checklist to fill, or
new approval. An approved D, the project `DESIGN.md` within the surfaces it
covers, and confirmed project terms and mappings take precedence; this guidance
never reopens an approved D. An applicable item shapes how the requested change
is designed and reviewed; it does not add delivery scope. An exception must cite
a decision recorded in D or the project `DESIGN.md`, or an explicit current user
instruction for that element; a general goal such as "make it look good" is not
one. Without such a citation, the item applies. Scenario patterns (tables,
forms, feedback states, charts, far-view displays, touch terminals) live in [UI
patterns](ui-patterns.md).

## 1. Layout, labels, and legibility

- Place each label next to what it labels; keep it when the graphic changes.
- Keep overlays and cards off key objects unless a cited decision allows it.
- Never clip key text without a way to read it in full (wrap, scroll, a
  tooltip that keyboard and touch users can reach, or detail), and do not shrink
  individual text to make it fit.
- Check long names and full data at each required viewport.
- Balance space: do not crowd controls on one side while another region stays
  empty. Far-view displays keep titles, key values, and logos readable from the
  viewing distance recorded in D or the project `DESIGN.md`; when none is
  recorded, treat it as an open question.

## 2. Emphasis, color, and motion

- Emphasize one kind of information per region; keep ordinary numbers neutral
  and use status color as an accent, not a saturated fill (the far-view
  routine-state case below excepted).
- Use status colors only for status, with one mapping across the product that
  follows the project's existing system.
- Errors and pending exceptions are never color-only. Unless project rules
  for that surface forbid it, a far-view display may show routine state by
  background color with a persistent legend.
- Motion signals a state change or preserves orientation. Routine states stay
  calm; an alarm or exception stays noticeable within the theme, and on a
  far-view display from the recorded viewing distance.

## 3. Visual language and fidelity

- Stay within the current theme's intensity even for a showcase; do not
  introduce a new style.
- Reuse the existing page frame, components, and density, prototypes included.
- Judge fidelity by viewing screenshots side by side with the design source, or
  the closest existing page of the same kind when none exists, and list
  differences by region. Geometry, element counts, and check totals supplement
  but never prove fidelity.

## 4. Information

- Each block adds information not shown elsewhere (a summary with its detail is
  fine; a repeated block is not); metrics support a user decision, not system
  meta such as device count or refresh rate.
- Keep intrinsic data, current links/state, and history distinguishable.
- Identify objects by the codes users use on site; show relations concretely
  (origin → destination), not as a summary word.
- In operator-facing views, show raw device or API data by business meaning
  with names and units, never as JSON or internal structure.
- Do not make users do system work: preparing a workspace, copying identifiers,
  or re-entering known data happens automatically or through a guided action.

## 5. Data truth

- A view that presents production data never mixes in sample or synthetic
  values, even when labeled; a missing source shows an empty state. Labeled
  synthetic data belongs only where the D data profile and its isolation rules
  allow it.
- Never show history, such as a pre-recovery location, as current.
- Elapsed times and "since" values count from the real event, not from a
  reconnect, restart, or page load.
- Unattended displays make load failure and session expiry visible and recover
  by themselves; never show blank or stale data as current.

## 6. Feedback and terms

- State the object, scope, and blocking condition ("paused in its current
  group", not "this unit is paused"). When something blocks an action, name the
  blocking objects and link to them where the user can act. Show current facts
  in place; the alert center holds exceptions the system has confirmed, not
  possibilities.
- Displayed state matches the actual result; a mismatch is a defect, not a copy
  fix.
- Action labels name the real operation and its consequence. Do not add a step
  asking users to confirm what the chosen action already means; keep
  confirmation for high-impact or irreversible actions and wherever project
  rules require it.
- Do not show two interdependent states side by side for one object; merge
  them per the project mapping.
- Use plain business language and the project's confirmed terms; one object
  keeps one name everywhere. Labels do not repeat their value's wording; filter
  options map one-to-one to the categories shown.
- For wording and Chinese typography, use the bundled
  [system-message-design](../skills/system-message-design/SKILL.md) skill.
