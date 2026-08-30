# Player wire refactor — Phase 1 + 2 implementation plan

Follows `docs/player-wire-refactor-plan.md` (Phase 0, shipped in #1643). This
covers Phase 1 (merge the two duplicate `applyPlayerMessageToSnapshot`
copies) and Phase 2 (exhaustive field manifest) together, as one PR.

## Current state (verified against `main` @ `e279b5c8`)

Two independently-maintained copies of the same merge function:

- `apps/simulation/src/subscription-snapshot-cache/subscription-snapshot-cache.ts` (206 lines)
- `apps/realtime-gateway/src/subscription-snapshot-sync/subscription-snapshot-sync.ts` (192 lines)

Each exports two functions:

- `applyTileDeltasToSnapshot` — **genuinely different implementations**,
  same behavior. Sim uses a binary search over a sorted array; gateway
  uses a `WeakMap`-cached tile-key→index map. Both are tested, both
  correct, and neither has ever drifted (nothing here is a per-field
  allowlist, so there's no drift *mechanism*). **Out of scope** — leave
  both as they are.
- `applyPlayerMessageToSnapshot` (+ its `playerProgressionFieldsFromPayload`
  helper) — **field-for-field identical** right now except one line: the
  sim copy still has a dead `storageCap` branch the gateway copy never had
  (confirmed dead in the Phase 0 doc: the client reads `msg.storageCap` at
  the wire-message top level, never `msg.player.storageCap`, and the field
  isn't part of `PlayerSubscriptionSnapshot["player"]` at all). This is
  the actual target.

Four call sites:

| File | Line | Calls |
|---|---|---|
| `apps/simulation/src/simulation-service/simulation-service.ts` | 1513 | `applyPlayerMessageToSnapshot` |
| `apps/simulation/src/player-snapshot-cache/player-snapshot-cache.ts` | 169 | `applyPlayerMessageToSnapshot` (via `applyNonTileEventToCache`) |
| `apps/realtime-gateway/src/gateway-app/gateway-app.ts` | 1452, 1459 | `applyPlayerMessageToSnapshot` |
| `apps/simulation/src/simulation-service/simulation-service.ts` | 1981 | `applyTileDeltasToSnapshot` (untouched) |
| `apps/realtime-gateway/src/gateway-app/gateway-app.ts` | 1514 | `applyTileDeltasToSnapshot` (untouched) |

## New finding while scoping this: a live gap the manifest will catch

`emitPlayerStateUpdate` (`apps/simulation/src/runtime-player-state-update.ts`)
puts `eventLog` and `logisticsThroughputPerMinute` on every `PLAYER_UPDATE`
payload it sends (§20 event log, logistics throughput — both real, both
sent on nearly every player action). **Neither merge copy merges either
field.** Same bug shape as `devQueue`/`waypointQueue` before #1637/#1640:
a value the sim actively pushes, silently dropped at the cache-merge step,
invisible until a reconnect happens to be served the stale cached
snapshot instead of a full rebuild.

This isn't scope creep — it's exactly the class of bug Phase 2 exists to
make impossible, and enumerating the manifest will surface it whether we
look for it deliberately or not. Fixing it is folded into this PR.

(`imperialWardCharges`, `wonderLastFreeRushBuyAt`, the two
`galacticWonder*` fields, `techIds`/`domainIds`/`mods`/`modBreakdown`/
`chosenTrickleResource` are **not** on the `PLAYER_UPDATE` payload — the
last five go out via `TECH_UPDATE`/`DOMAIN_UPDATE` instead, already merged
by `playerProgressionFieldsFromPayload`. The first two change rarely
enough — ward charges on consumption, rush-buy once/UTC-day — that they
appear to be intentionally reconnect-only, covered by Phase 0's
`init-payload-reconnect-fields.ts`. Flagging for awareness, not fixing:
if they turn out to need live updates too, that's a one-line manifest
addition once confirmed, not a blocker to this PR.)

## Where the shared code goes

`packages/shared` cannot host this: `applyPlayerMessageToSnapshot` needs
`PlayerSubscriptionSnapshot`, which lives in `@border-empires/sim-protocol`,
and `shared` has no dependency on `sim-protocol` (correctly — `shared` is
the lower-level package; `sim-protocol` depends on `shared`, not the
reverse). Adding that edge would be a structural change of its own and
isn't warranted here.

Both `apps/simulation` and `apps/realtime-gateway` already depend on
`@border-empires/sim-protocol` directly (gateway imports
`PlayerSubscriptionSnapshot` from it today). So the function moves into
**`packages/sim-protocol/src/`**, as a new subfolder module — matching the
existing `command-coverage-sets/`, `snapshot-diagnostics/`,
`galaxy-specialization.ts` pattern in that package. No new package, no new
dependency edges, pure move.

New module: `packages/sim-protocol/src/subscription-snapshot-merge/subscription-snapshot-merge.ts`

## Phase 2 design: the exhaustive manifest

Goal: adding a field to `PlayerSubscriptionSnapshot["player"]` without
teaching the merge about it should be a **compile error**, not a silent
drop discovered three bug reports later.

```ts
// A merge rule: how to pull one field out of an untyped wire payload and
// write it onto the cached player snapshot, or skip it if absent/wrong shape.
type PlayerMergeRule<K extends keyof PlayerStateSnapshot> =
  (payload: Record<string, unknown>) => Pick<PlayerStateSnapshot, K> | undefined;

// One entry per field PLAYER_UPDATE (or TECH_UPDATE/DOMAIN_UPDATE) can carry.
// `satisfies Record<keyof PlayerStateSnapshot, ...>` is the enforcement:
// omit a field here and this line fails to compile the moment that field
// is added to PlayerSubscriptionSnapshot["player"].
const PLAYER_MERGE_RULES = {
  id: () => undefined,              // identity fields: never patched via a live update
  name: () => undefined,
  gold: (p) => (typeof p.gold === "number" ? { gold: p.gold } : undefined),
  manpower: (p) => (typeof p.manpower === "number" ? { manpower: p.manpower } : undefined),
  // ...one line per field, mechanically ported from the existing spreads...
  eventLog: (p) => (Array.isArray(p.eventLog) ? { eventLog: p.eventLog as PlayerStateSnapshot["eventLog"] } : undefined),
  logisticsThroughputPerMinute: (p) =>
    typeof p.logisticsThroughputPerMinute === "number" ? { logisticsThroughputPerMinute: p.logisticsThroughputPerMinute } : undefined,
  devQueue: (p) => (Array.isArray(p.devQueue) ? { devQueue: p.devQueue as PlayerStateSnapshot["devQueue"] } : undefined),
  waypointQueue: (p) => (Array.isArray(p.waypointQueue) ? { waypointQueue: p.waypointQueue as PlayerStateSnapshot["waypointQueue"] } : undefined),
  // fields intentionally reconnect-only (not pushed via PLAYER_UPDATE today):
  imperialWardCharges: () => undefined,
  wonderLastFreeRushBuyAt: () => undefined,
  galacticWonderManpowerRegenBonusPerMinute: () => undefined,
  galacticWonderVisionRadiusBonus: () => undefined,
  // ...
} as const satisfies Record<keyof PlayerStateSnapshot, PlayerMergeRule<any>>;

const mergePlayerFields = (
  current: PlayerStateSnapshot,
  payload: Record<string, unknown>
): PlayerStateSnapshot => {
  let next = current;
  for (const rule of Object.values(PLAYER_MERGE_RULES)) {
    const patch = rule(payload);
    if (patch) next = { ...next, ...patch };
  }
  return next;
};
```

Notes on this design, deliberately:

- **A rule that always returns `undefined` (like `id`/`name`) is still
  required to be listed.** That's the point — it's a documented, explicit
  "this field is never live-patched," not a silent omission. A reviewer
  can tell the difference between "considered and excluded" and "forgotten."
- **Per-field type guards are preserved**, not flattened to a generic
  presence check — this payload originates from `emitPlayerStateUpdate`
  internally, not untrusted input, but keeping the existing `typeof`/
  `Array.isArray` guards costs nothing and keeps `git blame` readable
  against the current code.
- The `TECH_UPDATE`/`DOMAIN_UPDATE` branch merges a small subset
  (`gold`, `strategicResources`, `incomePerMinute`, plus
  `playerProgressionFieldsFromPayload`'s fields) — kept as a second,
  smaller rule table or a filtered pass over the same one. Exact shape is
  an implementation-time call; both are equally exhaustive.
- `satisfies Record<keyof PlayerStateSnapshot, ...>` is checked against
  the **full** field set including `worldStatus`-only concerns like
  `id`/`name`/`techRootId`-adjacent fields that live on
  `GatewayInitPayload`, not `PlayerSubscriptionSnapshot["player"]` — don't
  conflate the two types. This manifest only needs to be exhaustive over
  `PlayerStateSnapshot = NonNullable<PlayerSubscriptionSnapshot["player"]>`
  (32 fields today), not over the separate `GatewayInitPayload["player"]`
  allowlist in `init-payload.ts` (that's Phase 3, a different file, a
  different exhaustiveness problem — a manually-written type vs. a
  manually-written object literal, not an untyped-payload merge).

## Steps

1. **Move.** Create
   `packages/sim-protocol/src/subscription-snapshot-merge/subscription-snapshot-merge.ts`.
   Copy the gateway version of `applyPlayerMessageToSnapshot` +
   `playerProgressionFieldsFromPayload` (the one without the dead
   `storageCap` branch) verbatim as the starting point, plus the shared
   types (`PlayerStateSnapshot`, `WorldStatusSnapshot`) currently
   duplicated at the top of both files.
2. **Convert to the manifest form** described above, verifying every
   existing conditional spread has a 1:1 rule — this is a mechanical
   port, not a rewrite of behavior.
3. **Add the two missing rules** (`eventLog`,
   `logisticsThroughputPerMinute`) discovered above.
4. **Export** `applyPlayerMessageToSnapshot` from
   `packages/sim-protocol/src/index.ts` (or directly from the subfolder,
   matching how `galaxy-specialization` is re-exported today — check the
   existing convention before choosing).
5. **Delete** both old copies of `applyPlayerMessageToSnapshot` /
   `playerProgressionFieldsFromPayload` and their shared-type
   duplication; **keep** `applyTileDeltasToSnapshot` untouched in both
   files, along with whichever of the two shared-type aliases it still
   needs.
6. **Repoint the 4 call sites** (table above) to import from
   `@border-empires/sim-protocol` instead of the local module.
7. **Merge the tests.** Move the `applyPlayerMessageToSnapshot`-related
   `describe` blocks from both
   `subscription-snapshot-cache.test.ts` and
   `subscription-snapshot-sync.test.ts` into one new
   `packages/sim-protocol/src/subscription-snapshot-merge/subscription-snapshot-merge.test.ts`,
   de-duplicating overlapping cases. Leave each app's remaining
   `applyTileDeltasToSnapshot` tests in place. Add:
   - a regression test for `eventLog` and `logisticsThroughputPerMinute`
     now merging (would have failed before step 3);
   - one test that intentionally omits a field from the manifest and
     asserts `tsc` rejects it — or, more practically, a `// @ts-expect-error`
     line in the test file exercising the `satisfies` guard, since a
     true "delete a manifest entry and confirm the build fails" check
     can't run inside `vitest` itself.
8. **Verify.** `pnpm build` (sim-protocol must build before simulation/
   gateway consume it — same order Phase 0's `waypointQueue` type change
   required), `tsc --noEmit` in both apps, full test suites for
   `simulation` and `realtime-gateway`, `pnpm check:file-lines`.
9. **Changelog entry** — this changes live behavior (eventLog/logistics
   now correctly staying current across a cache-served reconnect), so it
   needs one per `AGENTS.md`'s changelog gate.

## Risk / rollback

- Both call-site families (`simulation-service.ts` /
  `player-snapshot-cache.ts` on the sim side, `gateway-app.ts` on the
  gateway side) are exercised by existing integration tests
  (`rewrite-stack.integration.test.ts` and friends) — run those, not just
  the unit tests for the moved module.
- If `sim-protocol`'s build/publish step has any subtlety (it doesn't
  appear to — it's a workspace package, both apps already consume its
  `dist/` output for `PlayerSubscriptionSnapshot` today), that would be
  the first thing to hit; the existing `packages/sim-protocol` build
  command already runs in this repo's normal `pnpm build`.
- Rollback is trivial: this is a pure move + one added rule pair, fully
  reversible by reverting the single PR.

## Explicitly out of scope for this PR

- `applyTileDeltasToSnapshot` unification (different perf strategies,
  no drift risk, not asked for).
- Phase 3 (`init-payload.ts` inversion) and Phase 4 (collapsing the sim's
  four player-projection sites) — separate PRs per the original plan doc.
- The `resolveCommand` pairing generalization — separate, smaller,
  unrelated to this file pair.
- Confirming whether `imperialWardCharges`/`wonderLastFreeRushBuyAt`/
  `galacticWonder*` genuinely need live-update coverage — noted above,
  deferred pending confirmation from whoever owns the galactic-campaign
  feature.
