# Player-wire refactor — Phase 3 implementation plan (invert `init-payload.ts`)

Grounded against `main` @ `47822c325` (Phase 1+2 merged: `applyPlayerMessageToSnapshot`
unified into `packages/sim-protocol/src/subscription-snapshot-merge/`, with an
exhaustive `PLAYER_MERGE_RULES` table that fails to compile if a field on
`PlayerSubscriptionSnapshot["player"]` has no merge rule).

## Recap: why this is next

The root cause of every incident this whole effort has chased (PRs #1628,
#1631, #1633, #1634, #1637, #1640, #1643) was the same shape: a
hand-maintained field allowlist that silently drops a field when
`PlayerSubscriptionSnapshot["player"]` grows one. Phase 1+2 closed that hole
for the *live-update merge* path. `apps/realtime-gateway/src/init-payload/
init-payload.ts` — the *reconnect/bootstrap* path that builds the payload a
client receives when it first connects or reconnects — has the exact same
shape today, and is the one place in the plan explicitly named as "the
pattern that caused the original incidents" (`devQueue`/`waypointQueue` were
missing here, not from the merge logic, in the original bug: PR #1640).

## Current state

### `GatewayInitPayload["player"]` (init-payload.ts:92-124)

A struct with three kinds of fields, not one:

1. **Payload-only fields** with no `PlayerSubscriptionSnapshot["player"]`
   counterpart at all: `points`, `level`, `stamina`, `availableTechPicks`,
   `techRootId`, `canToggleFog`, `homeTile`, `tileColor`, `respawnNotice`.
   These are init-payload-specific view concerns (client bootstrap UI state,
   not persisted player state) and are out of scope for this phase.
2. **Fields with real legacy/bootstrap fallback logic**: `gold`, `manpower`,
   `manpowerCap`, `manpowerRegenPerMinute`, `manpowerBreakdown`,
   `incomePerMinute`, `strategicResources`, `strategicProductionPerMinute`,
   `resourceSlots`, `upkeepPerMinute`, `techIds`, `domainIds`,
   `chosenTrickleResource`, `mods`, `modBreakdown`. Each falls back through
   `liveSnapshotPlayer?.field ?? bootstrapProfile?.field ?? <legacy player
   field or hardcoded default>` — the exact fallback chain differs field to
   field (see init-payload.ts:902-969) because bootstrap/legacy snapshots
   predate some fields entirely (e.g. `resourceSlots`, per the comment at
   line 933). These need to stay bespoke; mechanically generalizing them
   would either lose a real fallback or paper over which fields legacy
   snapshots never had.
3. **Pure reconnect passthrough fields**: carry the live snapshot value
   through if present, omit otherwise, no fallback chain. This is where the
   bug lives. Currently split across *three* different mechanisms:
   - Some inlined directly with `...(liveSnapshotPlayer?.field ? { field: ... } : {})`
     (`developmentProcessLimit`, `activeDevelopmentProcessCount`,
     `pendingSettlements`, `autoSettlementQueue`, `economyBreakdown`,
     `upkeepLastTick`, `dormantStructures`).
   - Some crammed onto init-payload.ts:978's single line as a Phase-0
     drive-by fix (`devQueue`, `waypointQueue`) — added directly to the type
     literal at line 124 too, instead of through `PlayerReconnectFields`.
   - Some routed through `init-payload-reconnect-fields.ts`'s
     `playerReconnectFields()` — its own separate, still hand-maintained
     allowlist (`eventLog`, `logisticsThroughputPerMinute`,
     `imperialWardCharges`, `wonderLastFreeRushBuyAt`), added when the
     eventLog/logisticsThroughputPerMinute gap was found during Phase 1+2.

   None of these three mechanisms has any compiler check tying it to
   `PlayerSubscriptionSnapshot["player"]`'s actual field list. A new
   passthrough-shaped field added to that type today would compile silently
   here, exactly as `devQueue`/`waypointQueue`/`eventLog` did.

### The type itself is also duplicated

`GatewayInitPayload["player"]` (init-payload.ts:92-124) hand-copies the
shape of most `PlayerSubscriptionSnapshot["player"]` fields into a second,
independent type literal rather than deriving from it — a second axis of
drift risk on top of the value-construction one (a field's *type* can go
stale here even if a merge/passthrough rule exists).

## What Phase 3 does

Add one exhaustive, compiler-enforced table for the **pure-passthrough**
subset of fields — the ones with no legacy/bootstrap semantics — mirroring
`PLAYER_MERGE_RULES`'s shape, and route every current passthrough site
(inline conditional spreads, the crammed-in line 978 fields, and
`playerReconnectFields()`) through it. Fields with real fallback logic (list
2 above) are *not* mechanically rewritten — each instead gets a single
documented "handled inline below, not a mechanical passthrough" marker in
the same table, so the exhaustiveness check still covers all 32
`PlayerStateSnapshot` fields and a future field can't land in neither
bucket unnoticed.

### 1. New module: `packages/sim-protocol/src/reconnect-passthrough-fields/reconnect-passthrough-fields.ts`

```ts
import type { PlayerStateSnapshot } from "../subscription-snapshot-merge/subscription-snapshot-merge.js";

// One entry per PlayerStateSnapshot field, mirroring PLAYER_MERGE_RULES'
// shape and purpose: `satisfies Record<keyof PlayerStateSnapshot, ...>`
// means a field added to PlayerStateSnapshot without an entry here fails
// to compile, instead of silently defaulting to "dropped on reconnect".
//
// Two kinds of entry:
//  - a passthrough function: carry liveSnapshotPlayer[field] through to the
//    reconnect/init payload if present, omit otherwise (no legacy/bootstrap
//    fallback -- this table only covers fields with no such fallback).
//  - "handledInline": documents that this field DOES need bootstrap/legacy
//    fallback semantics and is intentionally built by hand in
//    init-payload.ts's player object literal, not mechanically here.
type PassthroughEntry =
  | { kind: "passthrough"; extract: (p: PlayerStateSnapshot) => Partial<PlayerStateSnapshot> | undefined }
  | { kind: "handledInline" };

export const RECONNECT_PASSTHROUGH_FIELDS = {
  id: { kind: "handledInline" },
  name: { kind: "handledInline" },
  gold: { kind: "handledInline" },
  manpower: { kind: "handledInline" },
  manpowerCap: { kind: "handledInline" },
  manpowerRegenPerMinute: { kind: "handledInline" },
  manpowerBreakdown: { kind: "handledInline" },
  incomePerMinute: { kind: "handledInline" },
  strategicResources: { kind: "handledInline" },
  strategicProductionPerMinute: { kind: "handledInline" },
  resourceSlots: { kind: "handledInline" },
  dormantStructures: {
    kind: "passthrough",
    extract: (p) => (p.dormantStructures ? { dormantStructures: p.dormantStructures } : undefined)
  },
  economyBreakdown: {
    kind: "passthrough",
    extract: (p) => (p.economyBreakdown ? { economyBreakdown: p.economyBreakdown } : undefined)
  },
  upkeepPerMinute: { kind: "handledInline" },
  upkeepLastTick: {
    kind: "passthrough",
    extract: (p) => (p.upkeepLastTick ? { upkeepLastTick: p.upkeepLastTick } : undefined)
  },
  developmentProcessLimit: {
    kind: "passthrough",
    extract: (p) => (p.developmentProcessLimit ? { developmentProcessLimit: p.developmentProcessLimit } : undefined)
  },
  activeDevelopmentProcessCount: {
    kind: "passthrough",
    extract: (p) =>
      typeof p.activeDevelopmentProcessCount === "number"
        ? { activeDevelopmentProcessCount: p.activeDevelopmentProcessCount }
        : undefined
  },
  pendingSettlements: {
    kind: "passthrough",
    extract: (p) => (p.pendingSettlements ? { pendingSettlements: p.pendingSettlements } : undefined)
  },
  autoSettlementQueue: {
    kind: "passthrough",
    extract: (p) => (p.autoSettlementQueue ? { autoSettlementQueue: p.autoSettlementQueue } : undefined)
  },
  devQueue: { kind: "passthrough", extract: (p) => (p.devQueue ? { devQueue: p.devQueue } : undefined) },
  waypointQueue: { kind: "passthrough", extract: (p) => (p.waypointQueue ? { waypointQueue: p.waypointQueue } : undefined) },
  eventLog: { kind: "passthrough", extract: (p) => (p.eventLog ? { eventLog: p.eventLog } : undefined) },
  techIds: { kind: "handledInline" },
  domainIds: { kind: "handledInline" },
  chosenTrickleResource: { kind: "handledInline" },
  mods: { kind: "handledInline" },
  modBreakdown: { kind: "handledInline" },
  logisticsThroughputPerMinute: {
    kind: "passthrough",
    extract: (p) =>
      typeof p.logisticsThroughputPerMinute === "number"
        ? { logisticsThroughputPerMinute: p.logisticsThroughputPerMinute }
        : undefined
  },
  imperialWardCharges: {
    kind: "passthrough",
    extract: (p) => (typeof p.imperialWardCharges === "number" ? { imperialWardCharges: p.imperialWardCharges } : undefined)
  },
  wonderLastFreeRushBuyAt: {
    kind: "passthrough",
    extract: (p) =>
      typeof p.wonderLastFreeRushBuyAt === "number" ? { wonderLastFreeRushBuyAt: p.wonderLastFreeRushBuyAt } : undefined
  },
  galacticWonderManpowerRegenBonusPerMinute: {
    kind: "passthrough",
    extract: (p) =>
      typeof p.galacticWonderManpowerRegenBonusPerMinute === "number"
        ? { galacticWonderManpowerRegenBonusPerMinute: p.galacticWonderManpowerRegenBonusPerMinute }
        : undefined
  },
  galacticWonderVisionRadiusBonus: {
    kind: "passthrough",
    extract: (p) =>
      typeof p.galacticWonderVisionRadiusBonus === "number"
        ? { galacticWonderVisionRadiusBonus: p.galacticWonderVisionRadiusBonus }
        : undefined
  }
} as const satisfies Record<keyof PlayerStateSnapshot, PassthroughEntry>;

export const reconnectPassthroughFields = (
  liveSnapshotPlayer: PlayerStateSnapshot | undefined
): Partial<PlayerStateSnapshot> => {
  if (!liveSnapshotPlayer) return {};
  let combined: Partial<PlayerStateSnapshot> = {};
  for (const entry of Object.values(RECONNECT_PASSTHROUGH_FIELDS)) {
    if (entry.kind !== "passthrough") continue;
    const patch = entry.extract(liveSnapshotPlayer);
    if (patch) combined = { ...combined, ...patch };
  }
  return combined;
};
```

One field classification needs a closer look before landing this table:

- `galacticWonderManpowerRegenBonusPerMinute` / `galacticWonderVisionRadiusBonus`
  — **confirmed missing.** `grep` for both names across
  `apps/realtime-gateway/src/init-payload/` returns nothing; a player who
  reconnects after receiving the season-winner galactic-wonder bonus
  (`runtime.ts:1808`, granted once at spawn) currently has both fields
  silently dropped from their reconnect/init payload, the same bug shape as
  `eventLog` in Phase 1+2 (the field is real, durable server state —
  `runtime-manpower.ts`, `tech-domain-bridge.ts` both read it back off the
  player — just never copied into the client-facing payload on reconnect).
  This table closes that gap as part of Phase 3, with its own regression
  test, called out explicitly in the PR the same way `eventLog` was in
  Phase 1+2.
- `manpowerBreakdown` is listed as `handledInline` above because line 923-926
  already has bespoke default-object fallback logic — confirm that's true
  legacy-bootstrap semantics and not actually a plain passthrough that
  happens to have a synthesized default (in which case it could move to
  `passthrough` with a default baked into `extract`, simplifying the inline
  code). Resolve during implementation, not in this plan.

### 2. Route every current passthrough site through the table

`init-payload.ts:978`'s single crammed line collapses from:

```ts
...(liveSnapshotPlayer?.developmentProcessLimit ? { developmentProcessLimit: ... } : {}),
...(typeof liveSnapshotPlayer?.activeDevelopmentProcessCount === "number" ? {...} : {}),
...(liveSnapshotPlayer?.pendingSettlements ? {...} : {}),
...(liveSnapshotPlayer?.autoSettlementQueue ? {...} : {}), ...(liveSnapshotPlayer?.devQueue ? {...} : {}), ...(liveSnapshotPlayer?.waypointQueue ? {...} : {}), ...playerReconnectFields(liveSnapshotPlayer),
```

(spread across lines 973-978 today) to one call:

```ts
...reconnectPassthroughFields(liveSnapshotPlayer as PlayerStateSnapshot | undefined),
```

`economyBreakdown`/`upkeepLastTick` (lines 942-948, 953-959) currently also
fall back to `bootstrapProfile?.field` when the live snapshot doesn't have
it — that fallback stays (these two are borderline list-2/list-3 fields:
pure passthrough from the live snapshot, but *do* have a legacy-bootstrap
fallback below it). Only the `liveSnapshotPlayer?.field` half of each moves
into the table; the `bootstrapProfile` fallback stays inline, e.g.:

```ts
...(reconnectPassthroughFields(liveSnapshotPlayer).economyBreakdown ?? bootstrapProfile?.economyBreakdown
  ? { economyBreakdown: reconnectPassthroughFields(liveSnapshotPlayer).economyBreakdown ?? bootstrapProfile?.economyBreakdown }
  : {}),
```

(exact shape to be refined during implementation — calling
`reconnectPassthroughFields` twice here is wasteful; more likely the
init-payload code computes it once into a local `const passthrough =
reconnectPassthroughFields(liveSnapshotPlayer)` up front and reads off that
for both the pure-passthrough spread and the two bootstrap-fallback fields).

### 3. Retire `init-payload-reconnect-fields.ts`

Once `eventLog`/`logisticsThroughputPerMinute`/`imperialWardCharges`/
`wonderLastFreeRushBuyAt` all live in `RECONNECT_PASSTHROUGH_FIELDS`,
`init-payload-reconnect-fields.ts` and its `PlayerReconnectFields` type
(currently mixed into `GatewayInitPayload["player"]` via `&
PlayerReconnectFields` at line 124) are dead. Delete the file; drop the
intersection type; the passthrough fields' types now come from
`ReturnType<typeof reconnectPassthroughFields>` (or equivalent) instead.

### 4. `GatewayInitPayload["player"]`'s type

Out of scope for this phase to fully derive `GatewayInitPayload["player"]`
from `PlayerStateSnapshot` (list-1 payload-only fields make it a distinct
shape, not a subtype). In scope: replace the ad hoc `devQueue`/
`waypointQueue` fields and the `& PlayerReconnectFields` intersection
(init-payload.ts:124) with a single `& Partial<Pick<PlayerStateSnapshot,
PassthroughFieldKeys>>`-shaped type derived from the same table (or, more
simply, `& ReturnType<typeof reconnectPassthroughFields>`), so the type and
the value construction can't drift from each other the way `devQueue`/
`waypointQueue` did (added to the value at line 978 without ever being on
the reconnect-fields type until folded into the ad hoc line-124 addition).

## Step-by-step

1. Add `packages/sim-protocol/src/reconnect-passthrough-fields/
   reconnect-passthrough-fields.ts` per above, exporting
   `RECONNECT_PASSTHROUGH_FIELDS` and `reconnectPassthroughFields`.
   Re-export from `packages/sim-protocol/src/index.ts`.
2. Resolve the one remaining open question (`manpowerBreakdown`
   inline-vs-passthrough classification) by reading `init-payload.ts:923-926`
   during implementation. The `galacticWonder*` gap is already confirmed
   (see above) — implement it as part of step 1's table directly.
3. Write `reconnect-passthrough-fields.test.ts`: one assertion per
   passthrough field (carries through when present, omitted when absent),
   plus a regression test for `devQueue`/`waypointQueue` (the original
   PR #1640 bug) and `eventLog` (the Phase 1+2 bug) specifically, matching
   the pattern already used in `subscription-snapshot-merge.test.ts`.
4. In `init-payload.ts`: compute `const passthrough =
   reconnectPassthroughFields(liveSnapshotPlayer)` once near
   `availableGold`/`availableStrategic` (line 902-906), replace the
   crammed line 978 with `...passthrough`, fold `economyBreakdown`/
   `upkeepLastTick`'s live-snapshot half to read from `passthrough` instead
   of `liveSnapshotPlayer?.field` directly, update `GatewayInitPayload
   ["player"]`'s type (line 92-124) to drop the ad hoc `devQueue`/
   `waypointQueue` fields and `& PlayerReconnectFields`, replacing with a
   type derived from `reconnectPassthroughFields`'s return type.
5. Delete `init-payload-reconnect-fields.ts` and its test file (if any);
   remove the now-unused import at init-payload.ts:3.
6. Run `pnpm --filter @border-empires/sim-protocol build`, then typecheck
   and test `apps/realtime-gateway` (init-payload.ts and its existing
   tests, e.g. `init-payload.tile-color-regression.test.ts`), plus the new
   sim-protocol test file and `pnpm check:file-lines` (init-payload.ts is
   1069 lines, already over the 500-line cap — this change should net
   *reduce* its line count since three passthrough mechanisms collapse to
   one call site, but confirm no other over-cap file grows).
7. Add a changelog entry for the confirmed `galacticWonderManpowerRegenBonusPerMinute`/
   `galacticWonderVisionRadiusBonus` reconnect fix (client-visible: a
   season-winner bonus that silently vanished on reconnect). The rest of
   this PR is a pure refactor with no other behavior change.

## Explicitly out of scope for this PR

- Deriving `GatewayInitPayload["player"]`'s list-1 (payload-only) and
  list-2 (legacy-fallback) fields from `PlayerStateSnapshot` mechanically —
  their fallback semantics are genuinely bespoke per field.
- Phase 4 (collapsing sim-side player-projection call sites onto shared
  logic) — separate, optional, not started by this plan.
- Any change to `playerReconnectFields`'s *values* beyond moving them into
  the new table — this is a mechanical relocation plus closing whatever
  gaps step 2 confirms, not a broader audit of reconnect defaulting
  behavior.

## Risk / rollback

Same shape as Phase 1+2: a pure-refactor PR with (at most) one or two
narrow bug fixes discovered along the way, each covered by its own
regression test. Revertable as a single squash commit if
`init-payload.tsx`'s existing regression tests (tile-color, etc.) or a
follow-up bug report surface a behavior change.
