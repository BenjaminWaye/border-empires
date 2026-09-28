# Structure slot unification (Phase 4, redesigned)

Status: active plan. Supersedes Phase 4 of
`docs/archive/design-history-2026/build-pipeline-unification-plan.md`
(Phases 1-3 of that plan are live; its Phase 4 was never merged).

## Why the archived Phase 4 design is dropped

It collapsed `fort` / `observatory` / `siegeOutpost` / `economicStructure`
into a single `tile.structure` slot, and its migrator kept "whichever legacy
field is populated". Since then the game deliberately stacks structures:
Fort + Relay Beacon and Fort + Harbor Exchange (CUSTOMS_HOUSE) share a tile
(`runtime-structure-command-handlers.ts`, `economicConflict`). A single slot
cannot represent that, and its migration would silently delete one structure
on every stacked tile. Its stale worktree (`.claude/worktrees/build-pipeline-phase4`,
~2.5k commits behind) is not reusable.

## What the tile actually models today

Two layers, stored across four fields:

| Layer | Holds | Stored in today |
|---|---|---|
| Primary structure (one per tile) | every economic structure, Relay Beacon, Harbor Exchange, Observatory, Siege Outpost family | `economicStructure`, `observatory`, `siegeOutpost` |
| Fortification (one per tile) | Fort tiers (FORT, TITANIUM_BASTION, THUNDER_BASTION) and Palisade (WOODEN_FORT) | `fort`, except Palisade, which sits in `economicStructure` |

The Palisade is the one fortification stored in the primary layer. That is the
root cause of the bug where a Palisade built on a Relay Beacon or Harbor Exchange
tile deletes it (PR #1697 made that a deliberate replacement rather than fixing
the storage). The owner has ruled this a bug: a Palisade must stack exactly like
a Fort does.

## End state

```ts
interface Tile {
  structure?: TileStructureState;      // primary layer
  fortification?: TileStructureState;  // Fort tiers + Palisade
}
type TileStructureState = {
  type: string;          // STRUCTURE_REGISTRY key
  kind: StructureKind;   // FORT | OBSERVATORY | OUTPOST | ECONOMIC
  ownerId: PlayerId;
  status: "under_construction" | "active" | "inactive" | "removing";
  // ...union of today's per-field optional properties
};
```

Registry `tileField` becomes `layer: "structure" | "fortification"`, and the
stacking rule becomes data on the spec rather than hand-written
`economicConflict` / `noConflictingStructure` branches.

## Sequencing: four PRs, each shippable on its own

Each PR needs its own merge approval and its own staging, then prod, deploy approval.

### PR 1: Move Palisade into the fortification slot (fixes the reported bug)

The `fort` field *is* the fortification layer already; only Palisade is misfiled.

- Registry: WOODEN_FORT `tileField: "fort"`, stored as `fort.variant = "WOODEN_FORT"`.
  `FortVariant` and the client `fort.variant` union already include it.
- Build handler: drop the RB/CH "replace" carve-out and the FOOD-slot netting
  special case for Palisade-over-Beacon; Palisade conflict rules become Fort's.
  Palisade→Fort becomes a normal fort-tier upgrade.
- Build completion: delete `clearingWoodenFort` (the upgrade now overwrites `fort` in place).
- Read sites (about 30 files, sim, game-domain, and client): `economicStructure?.type === "WOODEN_FORT"`
  becomes `fort?.variant === "WOODEN_FORT"`. This includes upkeep, resource slots, combat multipliers,
  capture, removal, AI candidate filtering, territory automation, overlays, and menus.
- Legacy normalization, applied at hydration **and** on replayed `TILE_DELTA_BATCH`
  events (recovery replays old `economicStructureJson` payloads): a Palisade in
  `economicStructure` moves to `fort`. It is idempotent and every move is counted.
  If `fort` is already occupied (a Palisade→Fort upgrade in progress), the upgrade wins and
  the Palisade is dropped, which is what completion would have done. That case gets its own counter.
- The client display bugs are fixed here too. `fortificationOverlayKindForTile` and `structureKeyForTile`
  render and label the fortification and the primary structure independently.
- No wire-shape change: `fortJson` already carries `variant`.

Behavior changes (intentional, each confirmed by the owner):
1. A Palisade no longer deletes a Relay Beacon or Harbor Exchange. It stacks.
2. A Palisade now follows Fort's stacking rules in both directions, for example an
   economic structure may be built on a Palisade tile exactly when it may be built on a Fort tile.
3. Palisade combat values are real: 1.35x defense, 150 muster, 100-150 attacker loss
   (FORT_TIER_LADDER). Previously only UI labels showed them.
4. **Every** fort upgrade (Palisade→Fort and Fort tier upgrades) keeps the current tier
   standing and defending until the new one completes (`fort.upgradingFrom`,
   `defendingFortVariant`). Cancelling, or losing the tile mid-upgrade, restores the
   standing fort. Previously a cancelled tier upgrade deleted the fort outright.
5. A Palisade counts as a Fort in owned-structure tallies and gets the airport-bombard
   miss bonus. Fort patrol auto-attack is dead code, so nothing changes there.
6. A Palisade on a Relay Beacon tile now needs its own FOOD slot. The netting special case is gone.

### PR 2: Accessor layer (no behavior change)

Add `tileStructure(tile)` / `tileFortification(tile)` / `tileStructureOfKind(...)`
helpers in `packages/shared`, then migrate every read of the four fields to them,
area by area: shared + game-domain, then sim, then gateway, then client. There are about 228 non-test
files, so this may split into several PRs. After this, the storage shape is
private to the accessors, writers, and serializers.

### PR 3: Storage flip to `structure` + `fortification` (the risky one)

- `DomainTileState`, snapshot sections, tile deltas, sim-protocol (`structureJson`,
  `fortificationJson`), gateway normalization, and the client wire parser.
- Hydration and event replay read both shapes forever (old events stay in `world_events`).
- Once a snapshot is re-saved in the new shape, rollback needs a downgrader. Ship the
  downgrader in this PR.
- Gateway and client wire: the gateway keeps emitting the legacy client fields for one
  release window, so the Vercel client and Fly deploys are not lockstep.
- Staging soak of at least 48h plus the load harness before prod. Do not ship directly.

### PR 4: Stacking rules as registry data

Replace the `economicConflict` / `fortConflict` / `noConflictingStructure` branches with
spec data (`allowsFortification`, `layer`). This is behavior-neutral apart from anything the owner decides below.

## Open design questions (owner decides; the refactor preserves current behavior until then)

Server-side stacking is asymmetric today, and the client may hide some of these cases:
- An economic structure (for example Mintworks) or an Observatory **can** be built on a Fort tile,
  but a Fort **cannot** be built on a Mintworks or Observatory tile.
- Only Relay Beacon and Harbor Exchange accept a Fort built on top of them.

## Guardrails

- A counter on every migration branch and collision drop (see `docs/agents/state-and-persistence-discipline.md`).
- A regression test per behavior change. Parity tests for every stacking combination.
- A changelog entry for PR 1, PR 3, and any PR that changes rules.
- `pnpm lint && pnpm test && pnpm check:file-lines && pnpm build` clean before each PR.
