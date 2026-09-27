# Manifest step 9 (§7 item 9) — Retort Transmutation implementation plan

Status: active proposal, not yet implemented

Source: `docs/manifest-full-plan.md` §7 item 9 ("Retort must permit Umbrite
as an output") and `docs/manifest-aether-fixes-plan.md`'s "Remaining"
section, which scoped this out as: *"Retort switches a resource tile's
kind for another, Crystal is one of the choices" — implement the missing
`RETORT_RECAST` server handler with FARM/TITANIUM/GEMS/UMBRITE as
swappable targets (client already offers Food/Titanium/Crystal; Umbrite
needs adding to the message schema + client menu).*

This is the last open item in §7 (item 8, Siphon redesign, is explicitly
skipped per user direction — do not touch it as part of this work).
Completing this closes out §10 step 9 entirely.

## Current state (read from code, 2026-09-27)

The client already has a full UI for this ability and sends a real
command — the server just silently ignores it today:

- **Message schema** (`packages/shared/src/messages/messages.ts:234-239`):
  `RETORT_RECAST` exists with `x`, `y`, and
  `targetResource: z.enum(["FARM", "TITANIUM", "GEMS"])`. **Missing
  `"UMBRITE"`.**
- **Client send path**: `client-action-flow.ts:1517` sends the command
  with a player-picked `retortTargetResource`. `client-crystal-targeting.ts`
  presumably builds the picker's resource options (check it for a
  FARM/TITANIUM/GEMS-only list that also needs UMBRITE added — the
  Aether-fixes doc's finding above says "client already offers
  Food/Titanium/Crystal", which needs re-verifying: the message schema
  says GEMS not CRYSTAL, so confirm the exact current option set before
  editing rather than trusting that summary).
- **Ability info card** (`client-crystal-ability-info.ts:140-149`, key
  `retort_recasting`): title "Retort Transmutation", cooldown
  `RETORT_RECAST_COOLDOWN_MS = 20 * 60_000` (20 min), target text "Any land
  resource tile within observatory range that has no town, dock, fort,
  observatory, siege line, or economic structure on it", no crystal cost
  (`costBits: []`) — matches the `create_mountain`/`remove_mountain`
  pattern (also observatory-range-gated, also no crystal cost).
- **Gating**: `hasRetortRecastingCapability` (client,
  `client-tile-action-logic.ts:177`) checks
  `state.techIds.includes("matterwright-retort")`. There is **no
  `ABILITY_DEFS` entry** for `retort_recasting` in
  `server-game-constants.ts` yet — Phase 9a's ability-gating unification
  (`packages/game-domain/src/ability-gating/`) does not cover this ability
  because the server has never had a handler to gate.
- **Server**: zero references to `RETORT_RECAST` anywhere under
  `apps/simulation/src` outside tests. No handler, no dispatch wiring, no
  rejection code. The command is presumably parsed by the generic envelope
  schema and then dropped on the floor by whatever the default/unhandled
  case in command dispatch does — check `runtime-command-dispatch.ts` to
  confirm it isn't silently erroring today, so the actual player-visible
  bug is "nothing happens," not a crash.

## Closest existing patterns to copy

`apps/simulation/src/runtime-map-command-handlers.ts`'s
`handleCreateMountainCommand`/`handleRemoveMountainCommand` are the
closest analog: both are single-owned-tile mutations gated on a tech id,
validated against a list of "nothing else built here" tile fields, and
(per their cooldown constant name) presumably observatory-range +
cooldown gated the same way Retort's client copy already describes.
Read the full handler (not just the excerpt already pulled) before writing
the new one, including how it uses
`pickReadyOwnedObservatoryForTarget`/`stampObservatoryCooldown` — Retort's
"within observatory range" + 20-minute cooldown target text strongly
suggests it should use the exact same mechanism, not a new one.

## Implementation steps

1. **Shared schema**: add `"UMBRITE"` to the `targetResource` enum in
   `messages.ts`. Check `packages/client-protocol` and
   `packages/sim-protocol` for any generated/mirrored copy of this enum
   that also needs updating (the way other Manifest work in this branch
   had to touch `simulation.proto` for wire fields — RETORT_RECAST may or
   may not need a proto change depending on whether it already round-trips
   as opaque JSON).
2. **`ABILITY_DEFS`**: add a `retort_recasting` (or matching id — confirm
   the exact `AbilityDefinition["id"]` union member name against
   `server-shared-types.ts`) entry with `requiredTechIds: ["matterwright-retort"]`
   and `cooldownMs: RETORT_RECAST_COOLDOWN_MS`-equivalent (define the
   constant server-side rather than importing the client one — follow how
   `TERRAIN_SHAPING_COOLDOWN_MS` is defined server-side and mirrored
   client-side today, if it is).
3. **New handler file**: `apps/simulation/src/runtime-retort-recast-command-handler.ts`
   (or fold into `runtime-map-command-handlers.ts` if it's small enough to
   stay under the 500-line cap there — check that file's current line
   count first). Validate, in order: actor exists, payload parses,
   `playerHasAbilityTech` via the unified ability-gating helper (not a
   hand-rolled `techIds.has` check — Phase 9a's whole point was one source
   of truth), target tile owned by actor, target tile is a resource tile
   with no town/dock/fort/observatory/siegeOutpost/economicStructure
   (mirror `handleCreateMountainCommand`'s exact field list), an owned
   ready Observatory covers the target
   (`pickReadyOwnedObservatoryForTarget`), cooldown not active
   (`getAbilityCooldownUntil`/`setAbilityCooldownUntil`), `targetResource`
   differs from the tile's current `resource` (reject a no-op recast
   rather than silently accepting it). On success: set
   `tile.resource = targetResource`, `replaceTileState`, emit the tile
   delta, stamp the cooldown, emit a `RETORT_RECAST_RESULT`-style player
   message (check what event type the client's Retort FX layer
   (`client-map-3d-retort-recast-fx.ts`) expects to trigger its transmute
   animation — wire to that exact event so the existing FX code lights up
   for free).
4. **Command dispatch**: wire the new handler into
   `runtime-command-dispatch.ts` / `runtime-command-parsers.ts` alongside
   the other map/ability commands.
5. **Client target picker**: confirm and, if needed, add UMBRITE to
   whichever component builds the Retort resource-choice UI (likely near
   `client-action-flow.ts:1517`'s `retortTargetResource` source).
6. **Regression tests** (new file beside the handler, per repo convention
   — tests live next to the module they cover): accept path (tile resource
   changes, event emitted, cooldown stamped); reject paths (no tech,
   cooldown active, tile has a town/structure on it, target outside
   observatory range, target resource unchanged, not owned by actor);
   parity with `ABILITY_DEFS` the way `ability-gating.test.ts` already
   checks other abilities — add `retort_recasting` to that test's table
   rather than leaving it uncovered.
7. **Changelog entry**: this is new player-visible behavior (Retort goes
   from doing nothing to actually working, plus a new Umbrite target) —
   required per `AGENTS.md`'s changelog gate. Append to
   `client-changelog-data.ts`, not insert at the top.
8. **Docs**: once implemented, update this file's own status line and
   `docs/manifest-full-plan.md`'s progress-report table (§10 step 9 goes
   from "in progress" to "done", since item 8 is a decided skip and item 9
   is the only other open item in §7).

## Open questions to resolve before or during implementation

- Does Retort cost Crystal to cast? The client info card shows
  `costBits: []` (matching `create_mountain`), suggesting no — but confirm
  this against the plan's general Aether-copy rule ("Crystal powers its
  active use") before assuming zero cost is correct, since every other
  Aether ability in `ABILITY_DEFS` has a `crystalCost`.
- Exact current client-side target-resource option set (FARM/TITANIUM/GEMS
  per the schema, or does the client already show something else that
  doesn't match the schema — worth checking for a pre-existing
  client/server drift bug while touching this code).
- Whether `RETORT_RECAST_RESULT` (or whatever event the FX layer listens
  for) already has a defined shape in `sim-protocol`/`client-protocol` that
  this handler must conform to, or whether that also needs adding.
