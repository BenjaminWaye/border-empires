# Reach vision — implementation plan

Status: implemented 2026-10-04
Owner: Border Empires maintainers
Last verified: 2026-10-04
Replaces: none; gameplay rule recorded in `docs/game-mechanics.md`.

## Problem

Reach and fog-of-war use different sources of truth. Reach is the simulation's
authoritative, persistent `Runtime.reachBorder`: a tile-key-to-owner map that
is updated when an anchor activates, deactivates, is captured, or loses a
contest. It may contain water/coastal cells, land-gated shapes, holes, and
transferred sections; it is not simply a union of the player's owned tiles.

Frontier vision currently follows a different rule: every owned `FRONTIER`
tile contributes a permanent, flat radius-one visibility footprint. Reach,
however, does not itself reveal neutral or unowned cells inside its granted
area. A player can therefore lose all frontier tiles and no longer see the
space their towns/outposts/docks still allow them to claim.

The desired rule is: every tile in an empire's *current authoritative reach*
has vision radius one. This keeps all of reach visible and naturally reveals
one tile beyond its outside edge; it changes immediately when reach grows,
is clipped, transferred, or shrinks.

## Current behavior and constraints

- `packages/shared/src/reach/reach.ts` owns the persistent-border rules.
  Active town/AFC, outpost-family, and dock anchors grant reach; an anchor
  loss rechecks only its covered disk and may retain, transfer, or vacate
  reach tiles.
- `apps/simulation/src/runtime-reach-update/runtime-reach-border-apply.ts`
  is the mutation seam. It has both previous and next border maps and already
  tracks the bounded changed keys in the affected anchor disk.
- `apps/simulation/src/visibility-coverage-cache.ts` is the ref-counted,
  incremental fog source used by both streaming tile deltas and full visible
  state exports. Its terrain-aware footprint table already handles hills,
  forests, mountains, and toroidal wrapping.
- `FRONTIER_STANDING_VISION_RADIUS` remains the existing frontier-ownership
  rule. Reach vision is additive: it works when no frontier tiles exist and
  does not remove the scouting behavior already granted by frontier claims.
- Normal reach disks use wrapped Chebyshev geometry and their land-gated
  variant uses 8-connected traversal. Every resulting reach key is a source,
  so clipped coastlines, holes, and world seams need no special boundary
  geometry.
- Alliances currently share territory-based vision. Preserve that behavior
  for reach-border vision unless a later product decision explicitly makes
  border scouting private.

## Proposed change

### Rule

For a player `P`, let `R(P)` be the keys whose authoritative reach-border
owner is `P`. Every key in `R(P)` is a vision source.

Every source contributes the existing terrain-aware visibility footprint at
radius one to `P` and to P's current allies. The sources make every key inside
reach visible and make the outermost keys expose one additional ring. Existing
frontier, settled-tile, town/Observatory/Relay Beacon, dock, temporary, and
lock visibility are unchanged.

This creates a one-tile band outside the real reach outline while maintaining
vision throughout its interior. The important product guarantee is that all
current reach remains scouted even when it contains no frontier tiles, and
retracted reach stops providing its own vision immediately.

### Reach-vision synchronizer

Add a small, explicit reach-boundary source tracker adjacent to
`VisibilityCoverageTracker` (or as a narrowly scoped extension of it):

- Add/remove each changed reach key using the cache's existing ref-counted
  footprint APIs with radius one and a distinct audit reason such as
  `reach:self` / `reach:ally:<sourceId>`.
- Reuse the current viewer lookup so alliance formation and breakage add or
  remove reach-vision contributions as well as normal territory vision.
- Do not use tile `ownerId` or `ownershipState` to decide whether a source
  exists. The source is driven only by `reachBorder`; it therefore works for
  neutral reach cells, contested transfers, and a frontier tile awaiting
  decay.

### Incremental synchronization

At each reach mutation, compare the old and new border ownership only over
the existing bounded changed-key set. For every affected owner/key pair:

1. Remove the old owner's radius-one footprint if the key left their reach.
2. Add the new owner's radius-one footprint if the key entered their reach.

This makes reach reduction correct immediately, without waiting for frontier
decay. Ownership transfers process both the old and new reach owners.

Use the same synchronization primitive during world initialization after
`reachBorder` is seeded. Do not infer it from `REACH_UPDATE`: that message is
client-facing and coalesced, while fog authorization must remain simulation
authoritative and synchronous with the mutation.

### Preserve frontier-owned vision

Do not change the existing `FRONTIER_STANDING_VISION_RADIUS` behavior.
Frontier vision remains useful as a claim-specific source; the new reach
source is what guarantees visibility when the reach area is neutral, owned
settled land, or no longer contains frontier tiles.

## Implementation sequence

1. Implement the ref-counted reach-vision synchronizer and its exact
   add/remove/alliance behavior. Give it explicit dependency types; do not
   add untyped runtime dependency bags.
3. Wire initialization after reach-border seeding, then wire activation and
   deactivation through `runtime-reach-border-apply.ts`, before reach/fog
   deltas are flushed.
4. Preserve frontier standing-vision contributions and update comments/tests
   to distinguish them from reach vision.
5. Add player-facing changelog copy describing the new behavior: scouting
   follows the live reach edge and retreats when that edge retreats.
6. Confirm the existing fog state reaches both renderers. This is not a new
   overlay, but map visibility must be checked on both the 2D fallback and
   true-3D renderer under `isTrue3DRendererActive()`.

## Acceptance criteria

- A newly expanded reach makes every granted reach tile visible and exposes
  one radius-one scouting band beyond its authoritative boundary.
- Removing, disabling, or losing an anchor immediately removes/repositions
  the corresponding reach vision, even if affected tiles remain FRONTIER
  while out-of-reach decay is pending.
- A contested reach transfer removes the old owner's reach contribution
  and gives the new owner the correct one in the same simulation update.
- Land-gated coastlines, holes in contested reach, and world-wrap seams have
  no stale vision or diagonal gaps.
- Allied viewers receive and lose the same reach visibility on
  alliance changes, matching existing shared-vision rules.
- Full visible-state exports and streaming delta filtering return the same
  visible set.
- The 2D and true-3D clients show the same fog result because both consume
  the same server-authorized visibility data.

## Verification

Add regression tests that fail with the current frontier-source model:

- focused reach-vision tests for interior reach visibility, the second tile
  beyond the boundary remaining fogged, ownership transfer, and world wrap;
- a reach-retraction test proving a formerly owned frontier tile no longer
  reveals adjacent fog before its decay timer expires;
- contested transfer and alliance formation/breakage tests;
- parity tests for `filterTileDeltasForPlayer` and
  `exportVisibleStateForPlayer` across the same transition.

Run the focused shared/simulation tests first, then `pnpm ci:local`. Before
opening a PR, inspect the `isTrue3DRendererActive()` branches and perform a
manual fog check in each renderer. Add the required entry to
`packages/client/src/client-changelog/client-changelog-data.ts` with
`createdAt: Date.now()`.

When delivered, update `docs/game-mechanics.md`'s fog-of-war description and
change this document to implemented or archive it according to
`docs/README.md`'s lifecycle policy.
