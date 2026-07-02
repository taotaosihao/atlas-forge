# Oracle

The highest-impact issue is that `get_profile(account_id, viewer_id)` caches the full response only by `account_id`, even though the response includes viewer-specific authorization state.

Expected finding:

- `snapshot/app.py` uses `CACHE[account_id]` for a result that includes `can_edit`.
- The first viewer to load an account can seed the cache for every later viewer of the same account.
- If an owner views first, a guest can later receive `can_edit: True`.
- If a guest views first, an owner can later receive `can_edit: False`.

Acceptable fixes:

- include `viewer_id` or an equivalent permission context in the cache key;
- cache only the viewer-independent profile data, then compute `can_edit` per request;
- remove the cache until the authorization boundary is explicit.

Expected regression test:

- call `get_profile("acct-100", "viewer-owner")`;
- then call `get_profile("acct-100", "viewer-guest")`;
- assert the guest result has `can_edit is False`;
- repeat in the reverse order and assert owner access is still `True`.

## Scoring

- Issue identification, 8 points: names the cache key and viewer-specific authorization bug.
- Impact reasoning, 4 points: explains cross-viewer privilege leakage or denial.
- Fix quality, 4 points: proposes a minimal fix that preserves the authorization boundary.
- Evidence use, 2 points: cites `snapshot/app.py` and the relevant function/cache behavior.
- Communication, 2 points: concise findings-first review with a concrete regression test.

Hard fail: claims the code is safe, recommends only formatting changes, or invents files/services outside the snapshot.
