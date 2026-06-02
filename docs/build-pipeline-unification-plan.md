# Unify the four build pipelines into one `BUILD_STRUCTURE` command

**Worktree:** `.claude/worktrees/unified-build-command` (branch `worktree-unified-build-command`, based on `origin/main`)

---

## How an agent should use this plan

This plan is the architectural blueprint for a multi-phase refactor. It is **not** a single-PR spec — it covers four sequential PRs.

**If you are the executing agent reading this cold, do this:**

1. Read the entire plan top-to-bottom before touching code. Skipping ahead causes scope creep.
2. Confirm the user has approved the phase you're about to start. **One phase = one PR = one explicit approval.** Do not start Phase 2 just because Phase 1 merged.
3. Re-verify the line-number references in the "Problem statement" and "Phase 2 → New handler shape" sections against the current `main`. The runtime is large and lines drift between PRs; the structure of the code matters, not the exact line.
4. Work in the worktree at `.claude/worktrees/unified-build-command` (or a fresh one if it's gone). Never edit the primary checkout.
5. After each phase: open the PR, stop, report. The user merges and deploys; you do not.

**If you only have capacity for one phase, do Phase 1 first.** It is the foundation everything else stands on, ships behind no flag, has no on-disk side effects, and is independently valuable (the registry is reusable for future structure additions even if Phases 2-4 never happen).

The user-rule constraints at the bottom of this document are mandatory. They are not advisory.

---

**Problem statement.** Today the sim has four parallel build commands and four parallel handlers, each ~150–750 lines:

| Wire message | Handler | Tile field | Lines |
|---|---|---|---|
| `BUILD_FORT` | `handleBuildFortCommand` ([runtime.ts:6801](apps/simulation/src/runtime.ts#L6801)) | `tile.fort` | 175 |
| `BUILD_OBSERVATORY` | `handleBuildObservatoryCommand` ([runtime.ts:6976](apps/simulation/src/runtime.ts#L6976)) | `tile.observatory` | 148 |
| `BUILD_SIEGE_OUTPOST` | `handleBuildSiegeOutpostCommand` ([runtime.ts:7124](apps/simulation/src/runtime.ts#L7124)) | `tile.siegeOutpost` | 248 |
| `BUILD_ECONOMIC_STRUCTURE` | `handleBuildEconomicStructureCommand` ([runtime.ts:7372](apps/simulation/src/runtime.ts#L7372)) | `tile.economicStructure` | ~750 |

Each handler does the same *shape* of work (parse payload, validate owner, check tech, check tile state, charge cost, schedule completion, emit deltas) but diverged on which fields it reads/writes and which side-effects it triggers. The dispatcher at [runtime.ts:8673-8742](apps/simulation/src/runtime.ts#L8673-L8742) selects one of four by command type. This is the root cause of:

- LIGHT_OUTPOST being awkwardly classified as an `EconomicStructureType` (an attacker living in the economic pipeline)
- Sweep state needing a duplicate tick path because LIGHT_OUTPOST and SIEGE_OUTPOST live on different tile fields
- Every "is this tile already built on?" check having to consult four fields
- Capture / removal / status-change logic being duplicated four times
- New structure families being added by copying one of the existing handlers (the original organic-accretion mechanism)

---

## The unavoidable up-front decision: tile shape

There are two strategies for "one build command," and they have *very* different blast radii. Pick before reading further.

### Strategy A — One wire command, four tile fields (entry-point unification only)

Collapse the four wire messages and four handlers into one `BUILD_STRUCTURE` command + handler. The handler reads a per-structure-type spec from a registry and dispatches to per-family **completion hooks** that still write to the appropriate tile field. `tile.fort`, `tile.observatory`, `tile.siegeOutpost`, `tile.economicStructure` all stay.

**Upside:** the entire client-facing build UX is one code path. ~30 hours of work. No snapshot migration — the on-disk shape is unchanged. Low rollback risk. Most of the duplication the user actually feels (4 build menus, 4 cost-lookup paths, 4 tech-gate checks) is gone.

**Downside:** the symptom you originally complained about (LIGHT_OUTPOST type-lie on `economicStructure`) is *not* fixed by this. The tile shape is still four separate optional fields. Future "is this tile built on?" code still has to check four places. The capture/removal flow is still partially duplicated.

### Strategy B — Strategy A + tile-shape unification (`tile.structure`)

After A: collapse `tile.fort`, `tile.observatory`, `tile.siegeOutpost`, `tile.economicStructure` into a single `tile.structure: { kind, type, variant?, status, completesAt?, sweepBudget?, ... }` discriminated union.

**Upside:** the symptom IS fixed. LIGHT_OUTPOST is just `{ kind: "OUTPOST", variant: "LIGHT_OUTPOST" }`. One place to read structure state. The sweep type-lie is deleted for good. 3D overlays simplify. History (`lastStructureType`, `structureHistory`) collapses to one type.

**Downside:** snapshot migration is **required** — every in-flight game gets upgraded on first sim boot. Once a prod snapshot has been re-saved on the new shape, rollback requires a downgrader. The blast radius hits 3D overlays, the realtime gateway tile projection, the persistence layer, history, capture, removal, and ~40+ files in the client. ~80 hours of work. Real risk of breaking in-flight games on first deploy. A staged rollout (staging → soak → prod) is mandatory.

### Recommendation

Strategy B as **two sequential PRs**: A first (entry-point unification, no migration), then B (tile-shape unification). Each PR is independently shippable, each delivers value, and the work in A is *not* throwaway when B lands — the spec registry, dispatcher, and per-family completion hooks all survive.

If you only want one PR: do A. Skip B until the type lie actually bites you again.

The rest of this plan assumes **A → B sequenced.** If you pick A-only, stop after Phase 2 and reassess.

---

## Phase 1 — Structure registry (data extraction only, no behavior change)

Goal: extract the per-structure-type rules into a typed registry, without touching any handler logic yet. This is the foundation everything else stands on.

### Phase 1 execution checklist (concrete steps, in order)

1. **Orient.** Read these files top-to-bottom before writing anything:
   - `apps/simulation/src/runtime.ts` — the four `handleBuild*Command` functions
   - `packages/shared/src/types.ts` — `EconomicStructureType`, `SiegeOutpostVariant`, `EconomicStructure`, the `DomainTileState.fort/observatory/siegeOutpost/economicStructure` shape
   - `packages/shared/src/config.ts` — structure cost constants (`SIEGE_OUTPOST_BUILD_COST`, etc.)
   - `packages/shared/src/structure-costs.ts` — the existing cost lookup tables
   - `packages/shared/src/structure-placement-metadata.ts` and `structure-placement-metadata.json` — existing placement rules
   - `packages/shared/test/structure-costs.test.ts` — pattern to mirror in registry tests
2. **Enumerate the universe.** Build a checklist of every distinct structure type the game can build today. Source: `EconomicStructureType` union ([types.ts:25-57](packages/shared/src/types.ts#L25-L57)) + `SiegeOutpostVariant` ([types.ts:13](packages/shared/src/types.ts#L13)) + `FortVariant` (grep) + OBSERVATORY. Expect ~35 entries. Save the list — it's your "is the registry complete?" check.
3. **Define the spec type.** Create `packages/shared/src/structure-registry.ts`. Start with the `StructureSpec` interface from this plan. Add `PlacementCheck`, `PlacementContext`, `CompletionContext`, `RemovalContext` types in the same file. **Do not export the registry constant yet.**
4. **Extract placement predicates.** Read all four handlers and list every distinct placement check (`tile.ownerId === playerId`, `tile.ownershipState === "SETTLED"`, `!hasAnyStructure(tile)`, `adjacent-to-owned-town`, `dock-pair`, `terrain-restricted`, etc.). Implement each as a named exported `PlacementCheck`. Expect 12-15 distinct predicates. Cover them with unit tests in `structure-registry.test.ts`.
5. **Populate the registry, one family at a time, in this order:**
   1. Forts (3 variants) — simplest. Land them in the registry, write parity tests against `handleBuildFortCommand`, confirm green.
   2. Observatory — single entry.
   3. Outposts (4 variants including LIGHT_OUTPOST) — note LIGHT_OUTPOST's `tileField: "economicStructure"` as acknowledged debt to be unwound in Phase 4.
   4. Economic (~30 variants) — bulk of the work, mostly mechanical extraction from the already-table-driven `handleBuildEconomicStructureCommand`. Split the registry across `structure-registry-economic-*.ts` files if it crosses 500 lines (see file-size constraint at the bottom).
6. **Wire the parity tests.** For each spec in the registry, the test must:
   - Compare `spec.cost` to the existing `structure-costs.ts` lookup for that type → equal.
   - Compare `spec.buildMs` to the existing constant → equal.
   - Compare `spec.techIds` to the techs the existing handler checks → equal.
   - Compare `spec.placement` predicate outcomes to the existing handler's accept/reject decision on a fuzz of tile fixtures → equal.
   These tests are what prove Phase 1 didn't accidentally change semantics.
7. **Self-review the diff.** Re-read end-to-end. Auto-fix the obvious. Flag judgment calls (e.g. "I treated MINE's `requiresAdjacentResource` as a single predicate but `IRONWORKS` reuses it with a different resource list — extracted as a higher-order factory; verify intent") as a `file:line` bullet list in the PR body.

### Phase 1 acceptance criteria

- [ ] `packages/shared/src/structure-registry.ts` (and per-family split files if needed) exports a `STRUCTURE_REGISTRY: Record<string, StructureSpec>` covering every structure type from step 2.
- [ ] `structure-registry.test.ts` is green and asserts parity with the existing handlers for every type.
- [ ] `pnpm -r typecheck && pnpm -r test && pnpm -r build` all clean.
- [ ] **Zero changes** to `runtime.ts`, the four existing handlers, the dispatcher, or any client code. If your diff touches any of those files, you've left Phase 1.
- [ ] No changelog entry — Phase 1 is shared-only data movement with no user-facing effect.
- [ ] PR opened. Stop. Wait for explicit merge approval.

### Phase 1 PR shape

- **Title:** `refactor(shared): structure registry foundation (Phase 1 of build-pipeline unification)`
- **Body:** link to `docs/build-pipeline-unification-plan.md`, list the structure types covered, link to the parity tests, note that no behavior is changed and no handler is touched. Include the "judgment calls" bullet list from step 7.

### Files

`packages/shared/src/structure-registry.ts` (NEW, will fit in ~400 lines):

```ts
export type StructureKind = "FORT" | "OBSERVATORY" | "OUTPOST" | "ECONOMIC";

export interface StructureSpec {
  /** Wire-level identifier. Must be unique across the registry. */
  type: string;
  /** Family this structure belongs to. Drives which tile field it writes
   *  (in Phase 2) and which completion hook fires. */
  kind: StructureKind;
  /** Variant within the family (e.g. SIEGE_OUTPOST/SIEGE_TOWER/DREAD_TOWER
   *  for OUTPOST). Undefined for kinds with no variants. */
  variant?: string;
  /** Per-build resource cost. */
  cost: { gold: number; manpower: number; strategic?: Partial<Record<Resource, number>> };
  /** Build duration in milliseconds (pre-tech-mults). */
  buildMs: number;
  /** Tech prerequisites (all must be present). */
  techIds: ReadonlyArray<string>;
  /** Other structures that must exist on the tile (e.g. ADVANCED_IRONWORKS
   *  requires IRONWORKS). */
  prerequisiteStructureTypes?: ReadonlyArray<string>;
  /** Whether this structure consumes a development slot on its tile. */
  consumesDevelopmentSlot: boolean;
  /** Placement validators. Each returns null if placement is OK or a reason
   *  string otherwise. Composable so families share generic checks. */
  placement: ReadonlyArray<PlacementCheck>;
  /** Upkeep per interval. Empty array for no upkeep. */
  upkeep: ReadonlyArray<TileUpkeepEntry>;
  /** Hook fired at construction-complete time. Family-specific — initializes
   *  sweep budget for outposts, cooldown for observatories, etc. */
  onCompletion: (ctx: CompletionContext) => void;
  /** Hook fired when the structure is removed (by the player or capture).
   *  Default = remove the field, no special cleanup. */
  onRemoval?: (ctx: RemovalContext) => void;
  /** Tile field this structure populates. Phase 2 collapses to a single
   *  field; Phase 1 keeps this as the routing key. */
  tileField: "fort" | "observatory" | "siegeOutpost" | "economicStructure";
}

export const STRUCTURE_REGISTRY: Record<string, StructureSpec> = { ... };
```

### What goes in the registry, source-by-source

For each of the ~35 structure types currently in the codebase, extract its rules from the existing handler into a `StructureSpec` entry. The work is mostly mechanical:

- **Fort family** (FORT/IRON_BASTION/THUNDER_BASTION): cost/duration from `structure-costs.ts`, tech from [runtime.ts:6116](apps/simulation/src/runtime.ts#L6116) (`masonry` for base fort, plus per-variant tech), `tileField: "fort"`. Placement: own settled tile, no other structure. `onCompletion`: just set status to active.
- **Observatory** (OBSERVATORY): cost/duration from `structure-costs.ts`, tech check at the existing site, `tileField: "observatory"`. `onCompletion`: initialize `cooldownUntil`.
- **Outpost family** (SIEGE_OUTPOST/SIEGE_TOWER/DREAD_TOWER/LIGHT_OUTPOST): cost/duration per variant, tech per variant, `tileField: "siegeOutpost"` for the three siege variants, `tileField: "economicStructure"` for LIGHT_OUTPOST (acknowledged debt — Phase 4 collapses this). `onCompletion`: initialize `sweepBudget: 300`, `sweepActive: false`.
- **Economic family** (~30 types in [types.ts:25-57](packages/shared/src/types.ts#L25-L57)): mostly mechanical extraction from `handleBuildEconomicStructureCommand` since that handler is *already* table-driven internally. The work here is moving the table out of the handler into the registry, with the per-type `placement`, `upkeep`, `prerequisiteStructureTypes`, etc. preserved verbatim.

### Placement checks — extract these as composable predicates

```ts
type PlacementCheck = (ctx: PlacementContext) => string | null;
const ownerOwnsTile: PlacementCheck = ...;
const tileIsSettled: PlacementCheck = ...;
const noOtherStructure: PlacementCheck = ...;
const adjacentToOwnedTown: PlacementCheck = ...;
const requiresDockPair: PlacementCheck = ...;
const requiresTerrainType: (terrain: TerrainType) => PlacementCheck = ...;
const requiresPrerequisiteStructure: (type: string) => PlacementCheck = ...;
const consumesDevelopmentSlot: PlacementCheck = ...;
// etc.
```

Today each handler inlines its placement logic. Each existing check pattern (`tile.ownerId === playerId`, `tile.ownershipState === "SETTLED"`, `tile.economicStructure || tile.fort || tile.observatory || tile.siegeOutpost`, etc.) becomes a named predicate. Audit the four handlers; expect ~12-15 distinct predicates total.

### What this phase does NOT do

- No new wire message. The four existing `BUILD_*` messages still work and still go through the four existing handlers.
- The existing handlers are not deleted.
- No tile-shape change.
- No on-disk format change.

### Tests for Phase 1

`packages/shared/src/structure-registry.test.ts` (NEW): assert that for every structure type currently buildable in the game, the registry has an entry whose `cost`, `buildMs`, `techIds`, and `placement` checks match what the corresponding existing handler enforces. This is the safety net: if Phase 2's new handler diverges from the old handler, this test catches it.

Concretely: for each structure type, write a parity test that calls *both* the registry-driven cost lookup AND the existing `structure-costs.ts` lookup and asserts they agree. Same for tech gates: derive the tech list from the registry, derive it from the existing handler, assert equality.

This phase ships behind no flag — it's pure data movement, no behavior change.

---

## Phase 2 — One handler, one wire message

Goal: introduce `BUILD_STRUCTURE` and `handleBuildStructureCommand` driven entirely by the registry. Internally dispatch to family-specific completion hooks. Delete the four old handlers.

### New wire message

`packages/shared/src/messages.ts`:

```ts
z.object({
  type: z.literal("BUILD_STRUCTURE"),
  x: z.number().int(),
  y: z.number().int(),
  structureType: z.string(),     // matches StructureSpec.type
  ...FrontierCommandMetadataSchema
}),
```

Keep `BUILD_FORT`, `BUILD_OBSERVATORY`, `BUILD_SIEGE_OUTPOST`, `BUILD_ECONOMIC_STRUCTURE` as wire-protocol **aliases** for one release window. Each old message gets a normalizer that rewrites it into a `BUILD_STRUCTURE` envelope before dispatch — so old clients keep working during the rolling deploy. Drop the aliases in a follow-up PR after prod confirms the new client is universal.

### New handler shape

`apps/simulation/src/runtime.ts`, replacing the four old handlers:

```ts
private handleBuildStructureCommand(command: CommandEnvelope): void {
  const actor = this.players.get(command.playerId);
  const payload = parseBuildStructurePayload(command.payloadJson);
  if (!actor || !payload) { reject("BAD_COMMAND"); return; }

  const spec = STRUCTURE_REGISTRY[payload.structureType];
  if (!spec) { reject("UNKNOWN_STRUCTURE"); return; }

  this.applyManpowerRegen(actor);

  const target = this.tiles.get(simulationTileKey(payload.x, payload.y));
  if (!target) { reject("UNKNOWN_TILE"); return; }

  // Generic gates.
  if (!hasAllTech(actor, spec.techIds)) { reject("TECH_MISSING"); return; }
  if (!canAffordCost(actor, spec.cost)) { reject("INSUFFICIENT_RESOURCES"); return; }

  // Composable placement checks.
  for (const check of spec.placement) {
    const reason = check({ tile: target, actor, spec, runtime: this });
    if (reason) { reject("BUILD_INVALID", reason); return; }
  }

  // Charge resources, schedule completion.
  this.chargeResources(actor, spec.cost);
  const buildMs = this.applyBuildSpeedMults(spec, actor);
  const completesAt = this.now() + buildMs;

  // Write under-construction state to the appropriate tile field (Phase 2:
  // still 4 fields; Phase 4: tile.structure).
  this.writeStructureUnderConstruction(target, spec, actor, completesAt);

  this.scheduleAfter(buildMs, () => {
    const fresh = this.tiles.get(target.tileKey);
    if (!fresh) return; // tile capture / removal during build
    this.markStructureActive(fresh, spec, actor);
    spec.onCompletion({ tile: fresh, spec, actor, runtime: this });
  });
}
```

### Per-family completion hooks (still 4 fields)

```ts
// In structure-registry.ts:
const fortOnCompletion: StructureSpec["onCompletion"] = ({ tile, actor, runtime }) => {
  // Existing fort-complete side-effects from handleBuildFortCommand:6228-6262.
  // Just the side-effects — the tile field write is generic.
};
const observatoryOnCompletion: StructureSpec["onCompletion"] = ({ ... }) => {
  // Initialize cooldownUntil. Pulled from handleBuildObservatoryCommand.
};
const outpostOnCompletion: StructureSpec["onCompletion"] = ({ ... }) => {
  // Initialize sweepBudget=300, sweepActive=false. Variant-agnostic — all
  // four outpost variants share this hook.
};
const economicOnCompletion: StructureSpec["onCompletion"] = ({ tile, spec }) => {
  // Per-type completion: power state, upkeep registration. Mirror the
  // existing economic completion block.
};
```

### Dispatcher

`runtime.ts:8719-8742` collapses to:

```ts
if (command.type === "BUILD_STRUCTURE") {
  this.handleBuildStructureCommand(command);
  continue;
}
// Legacy aliases — keep for one release window.
if (command.type === "BUILD_FORT" || command.type === "BUILD_OBSERVATORY" ||
    command.type === "BUILD_SIEGE_OUTPOST" || command.type === "BUILD_ECONOMIC_STRUCTURE") {
  this.handleBuildStructureCommand(normalizeLegacyBuildCommand(command));
  continue;
}
```

### Client

`packages/client/src/client-action-flow.ts` and the build menu: every place that sends `BUILD_FORT` / `BUILD_OBSERVATORY` / `BUILD_SIEGE_OUTPOST` / `BUILD_ECONOMIC_STRUCTURE` switches to `BUILD_STRUCTURE { structureType }`. The 30+ build menu entries collapse to one factory function that reads the registry and produces a `TileAction` per spec.

The 3D overlay code that visualizes structures is **unchanged in Phase 2** — it still reads from the four tile fields.

### Removal & status

`REMOVE_STRUCTURE` command (likely already generic in the codebase — verify) and `SET_STRUCTURE_ACTIVE` / inactive flows: rewire to look up the spec from the registry and call `spec.onRemoval`. Auditing this surface is part of Phase 2 work.

### Tests for Phase 2

- Behavioral parity tests: for each structure type, build it via the new `BUILD_STRUCTURE` command in a fresh sim, assert the resulting tile state is byte-identical to the result of the legacy `BUILD_FORT`/`BUILD_OBSERVATORY`/etc. command. This is the test that catches divergence.
- Wire-alias tests: send a `BUILD_FORT` command, assert it normalizes correctly and produces the same outcome as `BUILD_STRUCTURE { structureType: "FORT" }`.
- Rejection-path tests for every named placement check predicate.
- Replay test: an existing snapshot + command log replays identically with the new handler.

### Deploy

One PR. Staging soak for ≥24h with a load test (per user memory "Load-test tick-frequency commands"). Then prod. No snapshot migration needed.

### What this phase delivers vs the user's symptom

- One build command on the wire ✓
- One handler in the sim ✓
- Build menu in the client driven by one registry ✓
- LIGHT_OUTPOST sweep type-lie **still present** (it's still on `economicStructure`)
- 3D overlay still has 4 code paths
- Capture/removal still partially family-specific

If you stop here, the symptom you originally yelled about is one config flip away — a follow-up small PR can move LIGHT_OUTPOST's `tileField` in the registry from `"economicStructure"` to a new `"siegeOutpost"` write path and update the tick. That's bridge work to Phase 3+.

---

## Phase 3 — Snapshot migration prep

Before touching the tile shape: ship a no-op migration loader that recognizes both the old shape (4 fields) and the new shape (1 field) on snapshot read. This phase ships with the migrator dormant — it just learns to *read* a hypothetical future shape; it doesn't *write* one yet.

The reason for this phase as a separate PR: it can be merged and deployed weeks before Phase 4. If we later have to roll Phase 4 back, the Phase 3 reader still works and can downgrade a partially-migrated snapshot.

`apps/simulation/src/snapshot-*.ts` (grep for the deserializer):

```ts
function readTile(raw: unknown): DomainTileState {
  // Existing 4-field reader stays as the primary.
  const tile = readLegacyTile(raw);
  // NEW: if raw also has a unified `structure` field, use it as the source
  // of truth (Phase 4 starts writing this). Ignore it in Phase 3 (no-op).
  if (typeof raw === "object" && raw && "structure" in raw) {
    // dormant in Phase 3; activate in Phase 4
  }
  return tile;
}
```

Tests: snapshot fixtures with both shapes round-trip cleanly.

---

## Phase 4 — Tile-shape unification (the big one)

Goal: collapse the four tile fields into one `tile.structure?: TileStructureState` discriminated union and run the snapshot migration.

### Type changes

`packages/shared/src/types.ts`:

```ts
export type StructureKind = "FORT" | "OBSERVATORY" | "OUTPOST" | "ECONOMIC";

export type TileStructureState = {
  type: string;            // matches StructureSpec.type
  kind: StructureKind;
  variant?: string;
  ownerId: PlayerId;
  status: "under_construction" | "active" | "inactive" | "removing";
  completesAt?: number;
  disabledUntil?: number;
  inactiveReason?: "manual" | "upkeep";
  previousStatus?: "active" | "inactive";
  powered?: boolean;
  cooldownUntil?: number;       // OBSERVATORY only
  sweepBudget?: number;         // OUTPOST only
  sweepActive?: boolean;        // OUTPOST only
  sweepBudgetUpdatedAt?: number;// OUTPOST only
};

export interface DomainTileState {
  // ... existing fields ...
  // OLD (delete):
  // fort?: { ... };
  // observatory?: { ... };
  // siegeOutpost?: { ... };
  // economicStructure?: { ... };
  // NEW:
  structure?: TileStructureState;
}
```

### Snapshot migrator (activate the Phase 3 reader)

For every persisted snapshot, on load, upgrade tiles in place:

```ts
function upgradeTileStructure(raw: any): void {
  if (raw.structure) return; // already migrated
  const legacy =
    raw.fort ?? raw.observatory ?? raw.siegeOutpost ?? raw.economicStructure;
  if (!legacy) return;
  raw.structure = projectLegacyToUnified(raw);
  delete raw.fort;
  delete raw.observatory;
  delete raw.siegeOutpost;
  delete raw.economicStructure;
}
```

`projectLegacyToUnified` is the one place all four legacy field shapes meet. LIGHT_OUTPOST on `economicStructure` becomes `{ kind: "OUTPOST", variant: "LIGHT_OUTPOST", sweepBudget, sweepActive, ... }`. The type lie is dead.

**This is the no-rollback point.** Once a snapshot has been re-saved on the new shape, downgrading requires a separate writer. Document this in the changelog. Confirm staging soak ≥48h before prod.

### Sim runtime

Every read of `tile.fort` / `tile.observatory` / `tile.siegeOutpost` / `tile.economicStructure` in `runtime.ts` becomes a read of `tile.structure` with a `kind`/`type` check. The duplicate sweep tick path at [runtime.ts:991-1014](apps/simulation/src/runtime.ts#L991-L1014) collapses with the siege-outpost path because both now read from the same `tile.structure`. Expect ~200 hits across `runtime.ts` (8000+ lines) — most are mechanical rewrites.

### Client

`packages/client/src/client-types.ts`: same field collapse. The client `Tile` type follows the shared type.

3D overlay rendering currently has separate code paths for fort / observatory / siege outpost / economic structure. Each becomes a switch on `tile.structure?.kind`. Estimate ~15 files touched: `client-map-3d.ts`, `client-map-3d-ownership-overlay.ts`, `client-tile-action-logic.ts`, `client-tile-menu-view.ts`, `client-tile-action-support.ts`, plus per-family overlay modules in `storybook/src/3d/`.

`packages/shared/src/outpost-aura.ts`: the projection types `OutpostAuraTileFacts` already use a minimal shape — easy retarget to `tile.structure`.

`TileHistory.lastStructureType` and `structureHistory` ([types.ts:80-81](packages/shared/src/types.ts#L80-L81)) collapse to a single `StructureKind | string` union.

### Realtime gateway

`apps/realtime-gateway/src/tile-detail-snapshot.ts` and any tile-projection code: rewire to read `tile.structure`. The JSON wire shape changes — gateway and client must deploy as a pair.

### Tests for Phase 4

- Migration tests covering every kind × every status × every variant.
- Round-trip: snapshot → migrate → serialize → deserialize is idempotent.
- Replay test from a pre-migration snapshot: command log replays identically.
- Capture / removal / status-transition tests for each family — these are the highest-blast-radius behavior paths.

### Deploy

One PR. **Staged rollout mandatory.** Ship to staging, soak ≥48h, manually verify in-flight games migrate cleanly, run the load harness, then prod. Per user memory "Skip staged rollouts when env broken": if staging is down at the time, hold the PR until staging is healthy — this is not a "ship direct" candidate.

Post-deploy, watch for ≥24h before declaring success. The blast radius here genuinely justifies it.

---

## What's NOT in this plan

- **Add new structure families.** This refactor preserves the existing game-design surface exactly. Adding new structures should happen *after* the registry lands and uses the registry's API.
- **Rework capture mechanics.** Capture logic is touched (it reads tile fields) but its semantics don't change.
- **Rework the upkeep loop.** It already iterates `tile.economicStructure` only; in Phase 4 it iterates `tile.structure` with a `kind` filter. Same outcome.
- **Rework tech gates.** Tech IDs move from inlined `actor.techIds.has(...)` checks to the registry's `techIds` array — that's the only change. The set of required techs per structure is unchanged.
- **Touch anything in `packages/server` or `/legacy`** (per user memory "Never build for legacy packages/server").

---

## Hard constraints from user memory

- **500-line file maximum.** `runtime.ts` already exceeds this and is a known beast. The new `handleBuildStructureCommand` is small (~80 lines) — additions are net-negative on size because four big handlers are deleted. `structure-registry.ts` must split by family if it crosses 500 lines: `structure-registry-fort.ts`, `-observatory.ts`, `-outpost.ts`, `-economic.ts`, with an index that composes them.
- **Surface architectural trade-offs upfront.** Done above (Strategy A vs B).
- **Self-review after writing code.** Before each PR opens, re-read the full diff. Auto-fix the obvious. Flag judgment calls in the PR body as a `file:line` bullet list.
- **Ask before each merge and each deploy.** Each phase is one PR. Each PR requires explicit user approval to merge. Each deploy (staging, then prod) requires explicit user approval. One approval covers one cycle.
- **Never archive before deploy.** Merged-but-undeployed code must ship before the session wraps. If you can't deploy due to env issues, say so explicitly.
- **No unverified claims.** Every "the existing handler does X" claim in this plan came from grep + read of `runtime.ts`. Before each phase, re-grep to confirm line numbers haven't drifted.
- **Client changelog pre-push hook.** Phase 2 and Phase 4 touch `packages/client/src/`. Each PR must bump `client-changelog.ts` with a user-facing entry. Phase 1 is shared-only; no client changelog needed.
- **Load-test tick-frequency commands.** Phase 2 touches the build dispatcher. Phase 4 touches snapshot serialization (every tick). Run the load harness against staging before prod for both phases.

---

## Estimated effort

| Phase | Scope | Estimate | Risk |
|---|---|---|---|
| 1 | Registry + parity tests, no behavior change | ~20-25 h | Low |
| 2 | Single handler + wire alias + client switchover | ~30-35 h | Medium |
| 3 | Dormant snapshot reader for unified shape | ~4-6 h | Very low |
| 4 | Tile-shape collapse + migration + client/gateway rewire | ~50-60 h | High |
| **Total** | **A + B sequenced** | **~110-130 h** | **High at the end, but each step is independently shippable** |

Strategy A alone (stop after Phase 2): **~50-60 h, medium risk.**

---

## Final notes for the executing agent

- Open one PR per phase. Do not combine phases in a single PR.
- Each PR must pass `pnpm -r test` and `pnpm -r build` clean.
- Each PR must include a "Manual test plan" section in its body that lists what the user (or a future agent) should verify in-game before merging.
- After each merge, stop and report. Do not deploy without explicit user approval.
- If at any phase the parity test suite fails, **stop and surface it** — that's the signal that the refactor diverged from the legacy handler.

---

## Kickoff prompt — paste this to the executing agent

> You are executing **Phase 1** of a multi-phase refactor in the border-empires repo. The plan lives at `docs/build-pipeline-unification-plan.md` on `main`. **Read the entire plan top-to-bottom before touching any code.** Create a fresh worktree off `origin/main` (e.g. `.claude/worktrees/build-pipeline-phase1`) and work there — do not edit the primary checkout.
>
> Your scope: **Phase 1 only — Structure registry (data extraction).** No behavior change, no handler changes, no client changes. Follow the "Phase 1 execution checklist" exactly.
>
> Hard rules (from the user's memory, non-negotiable):
> - Work in a fresh worktree off `origin/main`. Never edit the primary checkout.
> - 500-line file maximum. Split by family if needed.
> - Self-review the full diff before reporting done. Flag judgment calls as a `file:line` bullet list.
> - Do not merge. Do not deploy. Do not push to main. Open the PR and stop.
> - Do not run `--force` or `--no-verify`. If the pre-push hook fails, fix the underlying issue.
> - Do not touch anything under `/legacy` or `packages/server`.
> - Stop after the PR is open and report. List files changed, test results, and judgment calls. The user merges; you do not.
>
> Acceptance criteria are in the "Phase 1 acceptance criteria" section of the plan. Your PR must hit all of them. If you find that landing Phase 1 *requires* touching `runtime.ts` or a handler, **stop and surface it** — that means the plan is wrong, not that you should expand scope.
>
> Begin by reading `docs/build-pipeline-unification-plan.md` in full, then step 1 of the Phase 1 checklist.
