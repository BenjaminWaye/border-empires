# Garrison Many implementation plan

Status: implemented and verified locally; not merged or deployed
Owner: client maintainers
Last verified: 2026-10-18
Replaces: playtest improvement plan item 2, automatic connected garrison

## Interaction

Replace Garrison Connected with Garrison Many. Start with the originating tile
selected. Tap owned, eligible frontier tiles to toggle them; preserve drag to
pan and pinch to zoom. Select connected adds the originating connected region,
filtered through the same eligibility rules; users can then remove any tile.
Keep a compact toolbar above the mobile safe area with selected count, total
manpower/coin cost, Review and Cancel. Use existing brass, dark surfaces,
typography and button spacing. Review stays compact so the highlighted map
remains visible, and lists selected coordinates and excluded tiles/reasons.
Escape cancels without spending. No commands are issued before confirmation.

## Implementation sequence

1. Extract targeting defaults from the oversized client state module. Add an
   ephemeral, explicitly capped selection, cleared on cancellation, disconnect
   or account/season changes. Do not persist it in snapshots or local storage.
2. Share eligibility/review logic for ownership, terrain, visibility, reach
   exemptions, active/queued work, queue capacity and cumulative affordability.
   Show selected total versus available manpower, account for existing queued
   garrisons, and block confirmation when the entire eligible selection cannot
   be afforded. Do not silently choose an affordable subset.
3. Replace the bulk dispatcher with a typed selection controller and compact
   review sheet. Preserve the existing paced development queue. Explain that
   entries wait behind existing work and dispatch as slots become available.
   Recompute and compare the reviewed plan at confirmation; changed eligibility,
   queue or affordability requires another review before any enqueue.
4. Render gold selection outlines and translucent fills in both canvas and
   true-3D, conforming to terrain and camera movement. Highlight invalidated
   selections in warning orange. Route normal tile taps to selection while
   active, preserving gesture suppression and preventing accidental expansion.
5. Add integration/regression tests for edit/review/confirm/cancel, reach,
   duplicate and lost tiles, insufficient combined manpower, queue capacity,
   changed review, input and renderer parity. Check mobile layout and both
   renderers visually, then run client type checks/build and relevant gates.
6. Update gameplay documentation, playtest roadmap and client changelog with
   actual shipped behavior and verification evidence.

## Acceptance

- The user controls the exact tile set and sees it on the map before spending.
- No spending/queue mutation occurs on entry, editing, review or cancellation.
- Confirmation never queues a changed or silently truncated plan.
- Current queue pacing and server settlement rules remain authoritative.
- Both renderers and touch pan/zoom remain supported.

## Implementation and verification

- Implemented editable selection, a 60-tile cap (matching development queue
  capacity), connected-region shortcut, review/exclusions, cumulative cost
  checks and confirmation-time revalidation. State is temporary and is cleared
  on Escape/cancel, disconnect, account/season change or reset.
- Kept the existing development queue and acknowledgement pacing. Extracted
  targeting defaults, canvas selection paint and 3D tile-marker placement from
  oversized integration files; each integration file is now smaller.
- Added flow/real-queue integration tests, input tests and renderer geometry
  tests. The input regression fails against the original input handler and
  passes with the fix: committed taps previously armed click suppression
  before the action-flow handler could consume them. Compatibility mouse
  events after touch are now prevented; panning/pinching never select tiles.
- Local browser verification used the real rewrite gateway/simulation and
  client on isolated ports 3187/50587/5187 with a disposable seed. The seed's
  town detail did not reach the established-economy menu gate, so that existing
  display gate was temporarily enabled for visual checks, then restored. No
  fixture or debug override remains in source. Unit coverage retains the
  original economy gating.
- Checked default 3D at desktop and 390x844, then forced `?renderer=2d` at
  390x844: origin highlight, connected add, manual add, review and expanded tile
  list; map pan preserves selection. All mobile action buttons measure at
  least 44px high. Confirming two tiles reduced actual manpower 1720→1680 and
  filled two development slots. A separate two-tile selection was cancelled
  without spending. Touch tap/drag/pinch paths have automated integration
  coverage; this was viewport testing, not a physical-phone playtest.

## Final checks

- All 5,058 client tests in 734 files pass, including 18 new selection/input/
  renderer scenarios. Client TypeScript and production build pass.
- File-line gate (27 changed source files), documentation gate and client
  changelog gate pass. Both canvas paint paths and the 3D render loop are
  wired to selection overlays; rendering guards were checked explicitly.
- Direct diff review covered input suppression, the extracted selection/support
  paint and 3D marker placement. Another tile action closes selection mode;
  account/season/join/space changes also discard it. No server rules changed.
- Temporary visual fixtures and instrumentation were restored, the browser
  viewport reset, and the isolated local servers stopped. No staging/production
  deployment was performed. A physical-phone playtest remains useful before
  promotion. Full repository CI is required before opening a feature PR.
