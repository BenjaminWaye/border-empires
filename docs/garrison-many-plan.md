# Garrison Many implementation plan

Status: implemented and verified locally; not merged or deployed
Owner: client maintainers
Last verified: 2026-10-19
Replaces: playtest improvement plan item 2, automatic connected garrison

## Current interaction

Garrison Many starts with the originating eligible tile selected. Tap frontier
tiles to select or deselect at any time. Drag pans and pinch zooms; neither
changes the selection. Both canvas paint paths and the true-3D map show gold
selection outlines and translucent fills. Invalidated selections turn orange.

The compact bottom bar shows selected count, total cost, a short tap hint,
and only **Confirm** and **Cancel**. There is no separate review/edit state,
coordinate list, connected-selection shortcut, clear action or queue breakdown.
Keep existing brass surfaces, typography, spacing and 44px touch targets.

Confirm recomputes ownership, visibility, reach exemptions, existing garrisons,
queue capacity and cumulative affordability including existing queued garrisons.
If a selected tile became unavailable, block the whole batch and ask the player
to deselect orange tiles. Never silently queue a subset. Valid selections go
straight into the existing paced development queue with one confirmation;
changes to unrelated queued work do not add another approval step. Costs are
paid when each garrison starts. Queue rules and server validation are unchanged.

Cancel/Escape, disconnect, account/season change, joining a season, switching
to space or another tile action clear this temporary selection. Retain the
60-tile hard bound, matching total development queue capacity. No selection
state is persisted in snapshots or local storage.

## Implementation and acceptance

1. Replace automatic connected garrison with an explicitly typed selection
   controller; extract targeting defaults and map-paint helpers from oversized
   integration files before adding wiring.
2. Keep the map editable throughout selection, with count/cost and Confirm/Cancel
   always visible on phones. Remove the former review screen and its diagnostics.
3. Revalidate immediately on confirmation. Block invalid or unaffordable batches
   without spending; let users deselect orange tiles and confirm the remainder.
4. Cover direct confirmation, deselection, cancellation, changing reach/ownership,
   aggregate cost, existing queued garrisons, queue capacity, session resets,
   input suppression, pan/pinch and renderer parity with regression/integration tests.
5. Update gameplay documentation, roadmap and changelog; run client tests, type
   checks/build, file-line, documentation and changelog gates. Verify mobile layout.

## Verification history

- 2026-10-18: the original implementation passed 5,058 client tests in 734 files,
  TypeScript/build and file/docs/changelog gates. Both renderers were checked in
  a disposable local rewrite-stack game at desktop and 390x844; confirming two
  tiles spent exactly 40 manpower, while cancellation spent nothing. Touch paths
  have automated integration coverage; this was not a physical-phone playtest.
- That first UI included a Review/Edit selection step, connected selection,
  coordinate list and slot/queue counts. The product feedback on 2026-10-19
  supersedes those controls with direct selection and Confirm/Cancel.
- The direct-confirm regression fails against the previous UI. New coverage
  verifies that a changed/invalid tile blocks the whole batch until deselected,
  and valid selections do not acquire an extra confirmation step.
- No staging or production deployment has been performed. Full repository CI is
  required before opening a feature PR.

## Direct-confirm verification, 2026-10-19

- All 5,104 client tests in 742 files pass, including 22 selection, input and
  renderer scenarios. The direct-controls regression failed against the old UI.
- Client production build (including strict TypeScript) passes after rebuilding
  dependency packages against the latest develop branch.
- A temporary component fixture using the real controller, stylesheet and canvas
  selection paint was checked at 390x844. Taps selected/deselected directly;
  the bar measured approximately 154px high and both buttons measured 44px high.
  One Confirm closed selection without a review step. The fixture and its local
  server were removed, the browser viewport reset, and the temporary tab closed.
- Both map overlays are unchanged; their parity tests pass. The existing input
  integration still verifies taps, panning and pinching. This follow-up did not
  rerun a complete local rewrite-stack game or a physical-phone playtest.

## Review fixes, 2026-10-19

- Fixed alert hit priority when committing input on mouse-up/touch-end. Without
  this fix, mouse-up committed the tile underneath an alert and suppressed its
  following click; consecutive touch alerts could be swallowed by the shared
  suppression flag. The new input regression failed with `(40,40)` selected
  instead of the alert target `(8,9)`, then passed for mouse and repeated touches.
- Fixed a misleading gold outline left on the originating tile after it was
  deselected from the batch. The batch overlay now owns selection in both
  canvas paint paths and the true-3D selected marker. Ordinary selection is
  restored when the mode ends. The canvas regression failed with one lingering
  outline before the fix; canvas and 3D marker regressions now pass.
- Triage: two correctness findings fixed; no speculative or cosmetic changes.
