# UI patterns

Scenario patterns for designing and reviewing GUI surfaces, adapted from Apple's
Human Interface Guidelines and product field feedback. Read only the sections
the current surface needs. The shared [UI/UX guidance](ui-ux.md) holds the
cross-cutting rules and wins if the two disagree; wording belongs to the
`system-message-design` skill. An approved D, confirmed project decisions, and
the project `DESIGN.md` within the surfaces it covers take precedence, and these
patterns never reopen an approved D or add delivery scope. The only numbers
here are accessibility thresholds and recommendations; a project may set its
own.

## Contents

1. Hierarchy and layout
2. Typography
3. Color and contrast
4. Tables and lists
5. Forms and data entry
6. Feedback, loading, empty, and error states
7. Modals, menus, and controls
8. Charts and dashboards
9. Far-view displays
10. Touch terminals

## 1. Hierarchy and layout

- Order content by importance in reading order: the object and status the user
  judges first sit at the top and leading side.
- Align elements to shared edges; use indentation only for subordination. Group
  related items with spacing or a divider before adding a container, and avoid
  nested containers.
- Disclose progressively: show what the current decision needs and move rarely
  used options into menus, expandable sections, or a detail view.
- Keep controls visually distinct from content; content never looks clickable
  when it is not, and controls keep one consistent style.
- When space changes, keep the same functions and change only how many are
  visible (for example, move lower-priority actions into an overflow menu).
- Set density from viewing distance and input: desk-distance pointer screens can
  be dense, touch terminals need larger targets, far-view displays need fewer
  and larger elements.

## 2. Typography

- Size and weight text for the real viewing distance; avoid thin weights for
  small or distant text.
- Express hierarchy with a few steps of size, weight, and color, using one text
  family plus a monospaced or tabular-figure face for codes and changing numbers
  so columns and live values do not jitter.
- Give long text a comfortable line length and looser leading; tight leading
  suits one or two lines only.
- Leave room for text to grow (longer names, larger zoom, other languages): wrap
  or stack before truncating, and keep the primary content in place when text
  grows.

## 3. Color and contrast

- Do not use the interaction accent to decorate non-interactive text.
- Text and essential icons meet WCAG AA contrast: 4.5:1 for body text, 3:1 for
  large text (about 24 px regular or 18.7 px bold) and for graphics or control
  boundaries users must see.
- Check colors on the actual screen and in the actual lighting: bright workshops
  wash colors out, dark rooms make them look more saturated.
- Separate adjacent color areas (chart segments, heat maps, tiles) with a
  visible gap or boundary.

## 4. Tables and lists

- Prefer a table or list over cards when users compare many records.
- Use descriptive column headings with units; keep cell text short.
- Right-align quantity columns (not codes or IDs) with consistent units and
  decimals; left-align text.
- A truncated cell offers its full text through an expansion tooltip that
  keyboard and touch users can reach, or through the detail view.
- Show the current sort, filter, and search scope, and give feedback when a row
  is selected.

## 5. Forms and data entry

- Fill what the system already knows (context, defaults, previous choices)
  instead of asking again.
- Offer choices instead of free text for bounded values; use number, date, and
  time inputs with formatters rather than plain text fields.
- Make required data clear before users start; validate as they go and show the
  message next to the field.
- Size fields to their expected content, space them evenly, and make tab order
  follow visual order.
- A hint inside a field supplements its label and never replaces it.

## 6. Feedback, loading, empty, and error states

- Match the delivery to the significance: routine status appears inline in the
  interface, a brief confirmation follows a significant completed task, and an
  interrupting alert is reserved for critical information the user must act on.
  Do not alert for common, undoable actions or on page load.
- Show something immediately and keep the rest of the page usable while content
  loads; use a placeholder shaped like the real layout.
- Prefer determinate progress and report it accurately; switch from
  indeterminate to determinate once the total is known; keep the indicator in a
  consistent place; allow halting when feasible and state what halting loses.
- An empty screen says why it is empty and offers the next action as a button or
  link; "no data yet" differs from "no results for these filters".
- Put an error next to what caused it, without blame, and say how to fix it.
  When a command cannot run, say why.
- Prefer undo for reversible actions; confirmation for high-impact or
  irreversible actions follows the UI/UX guidance.
- Represent urgency honestly in alarms and notifications, and repeat an
  interruption only while it is still actionable.

## 7. Modals, menus, and controls

- Open a modal only when it clearly helps; keep it to one short task with an
  obvious way to dismiss it, never stack modals, and move complex or multistep
  work to a page.
- Give the most likely action the prominent style; distinguish the preferred
  choice by style, not size. A destructive action is not the primary button
  unless the user deliberately started it (such as confirming a delete they
  chose), and a safe cancel is always available.
- Every custom button shows a pressed state; use text when it is clearer than an
  icon, and give icon-only controls an accessible name.
- In menus, list frequent items first, group related commands, show unavailable
  items as disabled rather than hiding them, and keep submenus shallow.
- A toggle names what it affects and makes its two states visibly different; a
  segmented control holds a few same-type options labeled with nouns.

## 8. Charts and dashboards

- Use a chart only when it highlights something the user needs; prefer common
  types: bars to compare categories, lines for trends over time, points for
  individual values.
- Give each chart a title or summary that says what it shows or its main
  message, and label axes with units.
- Use a fixed axis range when the scale has a fixed meaning (0–100%
  utilization); otherwise size the range to the data. Start bar axes at zero;
  line charts need not.
- Keep series colors, scales, and ordering consistent across charts that share
  data.
- Never require hover or other interaction to reveal critical information, and
  make important changes (threshold crossings, new alarms) easy to notice.

## 9. Far-view displays

- Design for the recorded viewing distance: fewer and larger elements, with the
  key values and labels readable from that distance.
- Nothing depends on hover, focus, or clicks; data refreshes by itself and shows
  when it was last updated.
- A presentation or full-screen mode hides application chrome and keeps only a
  discreet control to exit it.
- Keep motion subtle and fluid, limited to state changes; review the screen on
  the actual display in the room's lighting before accepting it.

## 10. Touch terminals

- Touch targets are at least 44×44 CSS px (Apple's recommendation and WCAG AAA;
  the WCAG AA minimum is 24×24) unless the project sets otherwise, with enough
  spacing between them to prevent wrong taps.
- Use simple gestures for frequent actions, and give every gesture (pinch,
  swipe, long press) a visible on-screen control as an alternative.
- Minimize typing: prefer choices, scanning, and defaults.
- Nothing essential depends on hover or right-click.
- Pair any audio cue with a visible one; workshops are noisy.
