# Player wire refactor plan

## Problem

The player-state path from sim → gateway → client is not a single typed
contract — it's several hand-maintained allowlists that silently drop any
field not explicitly listed at each hop. `applyPlayerMessageToSnapshot` is
duplicated (once in the sim, once in the gateway) and the two copies have
already drifted. `waypointQueue` alone has to be independently declared in
14 files to survive the trip. That's the root cause behind the waypoint
bug fixed in #1640, and the same shape of bug is still present today.

## Findings from auditing the current path

**Fields that have drifted between the two copies of
`applyPlayerMessageToSnapshot`** (one side merges the field into the
snapshot, the other silently drops it):

| Field | sim copy | gateway copy |
|---|---|---|
| `storageCap` | merges | drops |
| `upkeepPerMinute` | merges | drops |
| `economyBreakdown` | merges | drops |
| `seasonWinner` | merges | drops |
| `chosenTrickleResource` | drops | merges |

**Fields the client reads off `msg.player` that `init-payload.ts` never
sets on reconnect** — the same class of bug as #1640:

- `logisticsThroughputPerMinute` (read at line 192)
- `eventLog` (line 180)
- `imperialWardCharges` (line 231) — assigned unconditionally with no `??`
  fallback, so every reconnect actively wipes it
- `wonderLastFreeRushBuyAt` (line 232) — same unconditional wipe

The last two look like live bugs today (unconditional overwrite, not just
a missing merge) but each deserves a quick repro/confirm before being
fixed as a bug rather than assumed.

## The structural fix

Invert the default from "drop unless listed" to "carry through unless
excluded": make the player wire shape declared once, in one place, and
exhaustive by construction, so adding a field to player state is a
compile error until every hop that needs it is updated.

`packages/shared` is the right home for the shared type/manifest — sim,
gateway, and client all already depend on it. (The client depends on
`shared` and `game-domain` only, not `sim-protocol`, so `shared` is the
only package all three sides can use.)

## Phases

Each phase is independently shippable and verifiable via
`pnpm lint && pnpm test && pnpm check:file-lines` (no PR CI in this repo).

- **Phase 0 — Stop the bleeding.** Fix the 9 findings above as a plain
  bug-fix PR, no structural change. User-visible today; ship first
  regardless of whether the rest of this plan is pursued.
- **Phase 1 — One merge function.** Move `applyPlayerMessageToSnapshot`
  into `packages/shared`, delete both copies, both apps import the shared
  one. Drift becomes structurally impossible. Low risk, existing test
  coverage.
- **Phase 2 — The exhaustive manifest.** Add a `PLAYER_WIRE_KEYS`
  manifest and drive the merge off it, replacing ~60 lines of per-field
  conditional spreads. From here, adding a field to the player type won't
  compile until the manifest lists it. Trade-off: the generic loop
  replaces per-field `typeof` guards with a presence check — acceptable
  since the payload is internally produced by `emitPlayerStateUpdate`, not
  untrusted input; a per-field validator map can be kept alongside if
  stricter validation is wanted.
- **Phase 3 — Invert `init-payload.ts`.** Extract the player-payload
  builder into its own file (also required by the file-cap rule —
  `init-payload.ts` is at 1069 lines, already over the 500-line cap, and
  must be net-smaller via extraction before it can change further).
  Rewrite it as "spread the snapshot player, then overlay
  computed/fallback fields" instead of listing ~30 fields by hand. This is
  the riskiest phase since it feeds every login — gate it with a
  golden-snapshot test that builds the INIT payload before and after the
  change and asserts deep-equal.
- **Phase 4 — optional.** Collapse the four near-identical sim-side
  projections (`runtime-state-export`, `runtime-visible-state`,
  `runtime-player-state-update`, `player-snapshot`) onto one
  `playerWireFromSummary()`.

### Related, separate, smaller

The `COMMAND_RESOLVED` + `emitPlayerStateUpdate` pairing (bugs
#1633/#1634): introduce one `context.resolveCommand()` that always does
both, so a future command queue can't reproduce that bug by omission.
Same bug family, but independent of the phases above and much cheaper to
land on its own.

## Recommendation

Do Phase 0 now — small, low-risk, four-to-nine real bugs. Then Phases 1 +
2 together as one PR: mostly deletion, and it's where nearly all the
structural value is (permanently kills the drift class). Phase 3 is worth
doing but needs the golden-snapshot test and a careful eye — treat it as
its own PR after 1+2 have been on staging for a day. Phase 4 and the
`resolveCommand()` cleanup are optional follow-ups, not blockers.
