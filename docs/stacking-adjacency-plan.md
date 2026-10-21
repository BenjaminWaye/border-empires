# Stacking-building adjacency (industrial districts) — plan

Status: proposed (2026-10-20). Owner decision: **replace** today's per-ring
copy counting with explicit adjacency for the stacking building families.
Nothing here is implemented yet. Numbers marked "starting value" are for the
Phase 0 balance pass, not final.

## Goal

Stacking buildings already reward concentration, but invisibly: a copy counts
if it sits anywhere in its town's support ring. This plan makes the reward
spatial and readable:

- **Each stacking building earns more for every same-family building it
  touches.** More neighbours, more output.
- **They must be built touching each other**, growing outward from their
  town as a connected district.
- Terrain shapes districts (mountains and water are unbuildable, so they cap
  how large and compact a district can get), and war gets a new target:
  cutting a district disconnects everything past the cut.

## What runs today (grounded)

Stacking families are the uncapped repeatables in a town's support ring
(`STACKING_SUPPORT_STRUCTURE_TILE_REDIRECT_TYPES` and
`STACKING_TOWN_SUPPORT_STRUCTURE_TYPES` in
`apps/simulation/src/runtime-structure-town-support-target.ts`):

| Family | Types | Current stacking rule | Code |
|---|---|---|---|
| Manufactory | `MANUFACTORY` | +10% town coin per copy in the ring (+35% with Clearing House), plus a flat +1 coin/day and +10 on completion | `manufactoryGoldProductionMultiplier` (`packages/game-domain/src/server-game-constants/server-game-constants.ts`) |
| Arsenal | `TITANIUM_WEAPONS_FACTORY`, `UMBRITE_WEAPONS_FACTORY` | Per town: each copy counts `1 + 0.15 × (copies − 1)` (both types together), capped at 2.25 | `concentratedFactoryEquivalent` (`apps/simulation/src/runtime-weapons-factory-mults.ts`), `arsenalMultiplierForFactoryCount` (`packages/shared/src/town-terrain-profile.ts`) |
| Depot | `ANCILLARY_DEPOT` | +150 manpower cap per copy, plus town capacity `count × (150 + base × rate)` | `runtime-manpower-structure-bonus.ts`, `ancillaryFactoryCapacityBonus` |
| Condenser | `AETHER_CONDENSER`, `HIGH_YIELD_AETHER_CONDENSER` | EXCHANGE mode: flat coin per copy folded into town; REFINE: +1 slot | `supportedConverterGoldPerMinuteForTown` (`apps/simulation/src/economy-network/`) |

Placement today: a stacking building must be on a tile in a town's support
ring (8 tiles; 24 for Great City/Metropolis, `supportRingRadiusForTier`).
Clicking the town tile redirects to `firstAvailableTownSupportTile`. A ring
tile shared by two towns belongs to the lowest-x, then lowest-y town
(`supportTileBelongsToTown`, `economy-network-support-ring.ts`). Where in the
ring a copy sits has no effect.

Copies are counted by `countSupportedStructures` in several parallel paths
that must all change together:

- authoritative income: `apps/simulation/src/player-update-economy/player-update-economy.ts`
- town card / wire summary: `apps/simulation/src/live-town-summary.ts`
- boot/legacy snapshot economy: `legacy-snapshot-economy/legacy-snapshot-economy.ts`, `legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.ts`, `snapshot-economy-helpers.ts`
- combat: `runtime-weapons-factory-mults.ts`
- manpower: `runtime-manpower-structure-bonus.ts`
- town modifier totals: `townModifierTotalsFromCounts` (`packages/game-domain/src/structure-modifier-catalog/structure-modifier-catalog-town-aggregate.ts`)
- gateway tile detail: `apps/realtime-gateway/src/tile-detail-snapshot/tile-detail-support-ring.ts`
- client tile menu: `packages/client/src/client-tile-menu-view/client-tile-menu-view.ts`, `client-tile-overview-modifiers/`

## The rules

### R1. Touching

Two buildings **touch** when they are 8-neighbours (Chebyshev distance 1,
world-wrap aware), the same neighbourhood frontier supply already uses. A
building's **neighbour count `n`** is the number of touching buildings of the
**same family** that are owned by the same player, active and not dormant.
Geometry caps `n` at 8. Titanium and Umbrite Weapons Factories are one family
(they already count each other today).

### R2. Output per building

Every copy's contribution becomes:

```
copyValue(n) = base × (1 + k × n)
```

Callers that take a copy count today take an **effective count**
`Σ (1 + k × n_i) × baseScale` instead. Every existing formula that is linear
in the count (Manufactory multiplier, depot cap, depot capacity, condenser
coin) keeps its shape, and only the count it receives changes. Arsenal's
separate concentration curve is retired, because adjacency *is* the
concentration rule.

**Calibration rule: ring parity.** A completely filled 8-tile ring has 4 edge
tiles touching 4 others and 4 corner tiles touching 2, so Σn = 24 and the
average is 3. `base` is set so that a full ring produces what it produces
today. Scattered copies earn less, and districts grown beyond the ring can
earn more.

| Family | Starting `k` | Starting `base` | Isolated copy vs today | Copy with 8 neighbours |
|---|---|---|---|---|
| Manufactory | 0.25 | today ÷ 1.75 (5.7%; 20% with Clearing House) | 57% | 171% |
| Arsenal | 0.35 | 1.0 equivalent | same as a lone factory today (1.0) | 3.8 equivalents (today's cap is 2.25) |
| Depot | 0.25 | today ÷ 1.75 | 57% | 171% |

Flat one-off/per-copy amounts (Manufactory's +10 instant and +1 coin/day) stay
per raw copy. Network-level counts (Neural Works and Reserve Lattice counting
depots in a connected network, `economy-network.ts`) stay raw copy counts.
Both are listed as open questions.

### R3. Placement: grow out from the town

A stacking building may be placed on an owned, settled, open LAND tile that
either:

1. **seeds** a district: is inside an anchor town's support ring (radius 1, or
   2 for Great City/Metropolis, so the tier perk is preserved), or
2. **grows** one: touches a same-family building (active, under construction
   or dormant) that is itself connected to an anchor town,

and is within `DISTRICT_MAX_REACH` (starting value 3, Chebyshev) of that
anchor town. The reach bound limits both sprawl and the cost of the
connectivity search (at most 7×7 tiles per town per family).

Mountains, sea and other players' land can't hold buildings, so they break
districts and terrain decides how big and compact one can get. Rivers have no
effect (owner decision 3 in `rivers-remake-plan.md`). Diagonal touching across
two blocked orthogonal tiles counts (plain 8-neighbourhood); see open
questions.

Clicking the town tile keeps working: the server's redirect picks the
**highest-gain** valid tile instead of the first open ring tile, with a
deterministic tie-break (lowest y, then x). This also gives the AI sensible
placement with no change on its side.

### R4. Districts and their anchor town

A **district** is a connected component (R1 touching) of one family's
buildings for one player. Its **anchor town** is the owned, non-SETTLEMENT
town whose support ring contains a district member, with today's tie-break
when several qualify (lowest x, then lowest y). All of a district's output
goes to its anchor town, which replaces per-tile ring attribution for these
families.

- **Connectivity vs output:** members that are under construction or dormant
  still *connect* the district (placement and attribution), but don't count
  toward anyone's `n` and produce nothing. A dormant building in the middle
  therefore doesn't make everything past it fall dark.
- **Cut off:** members not connected to any anchor town produce nothing
  ("Disconnected"). This happens when a member is captured or removed, or when
  the anchor town is lost or drops to SETTLEMENT.
- **Captured members change sides.** Active economic structures transfer to
  the captor (`capture-structures.ts`). Under these rules, a captured member
  is disconnected for the captor *unless* it touches one of the captor's own
  districts of that family, or sits in one of the captor's town rings, in
  which case it joins theirs. Taking the edge of an enemy district that
  borders your own industry steals part of their output, not just their
  tile.

### R5. Ruleset gate

Live seasons were built under per-ring counting. The new rules apply only to
seasons stamped with `structureAdjacencyRuleset: "adjacency-v1"` on
`SimulationSeasonState`. It is stamped at season creation
(`apps/simulation/src/season-lifecycle.ts`, alongside `worldgenVersion`) and
sent to clients in the init payload's `config.season`
(`apps/realtime-gateway/src/init-payload/init-payload.ts`, read in
`client-network-init-message.ts`). Without the marker, every path keeps
today's behaviour. The legacy path is deleted once no live season lacks the
marker (Phase 7).

## Architecture

### Shared pure module: `packages/shared/src/structure-adjacency/`

This is the single source for the rules. The sim, gateway and client all call
it, so previews match server results by construction (the same lesson as
`supportRingCandidates`: one scan, not N hand-rolled copies).

- `STACKING_FAMILIES` / `stackingFamilyOf(type)`: family membership and per-family `k`, `base` scale.
- `touchingSameFamilyCount(tiles, x, y, family, ownerId)`: R1, wrap-aware via shared `wrapX`/`wrapY`.
- `districtForTown(tiles, townKey, family, ownerId)`: bounded BFS from the town's ring (R3/R4) returning members, per-member `n`, connected/disconnected flags and effective count.
- `districtPlacementCheck(tiles, x, y, type, ownerId)`: returns `{ ok, reason?, anchorTownKey?, gain }`. `gain` is the effective-count delta *including* the bump to each touched neighbour, which feeds both the redirect and the client preview.
- `effectiveStackCount(...)`: the value the economy paths substitute for `countSupportedStructures` under the ruleset.

Keep every file under 500 lines; split counting, BFS and placement into
sibling files from the start.

### Simulation

- **Cache:** a per-player, per-family district index (members → district id,
  district → anchor town, effective count). Invalidate it only when a tile
  carrying a stacking-family structure changes owner, structure, status or
  dormancy, or when a town tile changes tier or owner. Hook it into
  `runtime-economy-cache-invalidation.ts`, never on every tile write: the
  blanket invalidation fixed in #2020 is the failure mode to avoid. Bound the
  index per `docs/agents/state-and-persistence-discipline.md` and add a
  gauge. The index is derived, so it is never persisted in snapshots; it is
  rebuilt on boot.
- **Placement:** replace the stacking redirect and ring requirement in
  `resolveTownSupportTarget` (and the town-support surface check) with
  `districtPlacementCheck` when the ruleset is active. Rejections stay
  `BUILD_INVALID` (as `rejectCommand` uses today) with player-facing
  messages: "must touch <town> or another <family> connected to it" and
  "too far from <town>".
- **Economy:** swap `countSupportedStructures` for `effectiveStackCount` at
  every call site listed under "What runs today" (server, gateway, client),
  behind the ruleset check. Replace `concentratedFactoryEquivalent`'s
  `arsenalMultiplierForFactoryCount` with the district effective count.
- **Counters** (every guard needs one): `sim_district_placement_rejected_total{reason}`,
  `sim_district_disconnected_buildings` gauge, `sim_district_index_rebuild_total`,
  and rebuild duration.

### Client (both renderers)

Every map visual below ships in the 2D canvas **and** true-3D renderer in
the same branch. Grep `isTrue3DRendererActive()` before calling a phase done.

- **Placement UX: where is the best spot?** Players get the answer in three
  layers. All numbers come from `districtPlacementCheck`, the same shared
  code the server uses, so a preview can't promise output the server won't
  pay.
  1. **Before building (ambient).** District links and badges (below) show
     each district's shape and current value. When a town is selected, faint
     ghost markers sit on the top 1–3 growth tiles for each stacking building
     the player can afford: "Best next Manufactory · +15%".
  2. **While placing (gain preview).** Choosing a stacking building opens
     the existing placement flow (`client-building-placement/`, overlays in
     `client-map-3d-placement-overlay/` and `client-placement-preview-2d/`).
     - *Heat tint:* valid tiles are tinted dim to bright gold by total gain,
       so the answer reads at a glance even zoomed out.
     - *Gain labels:* "+15%" on the top ~5 tiles only, to avoid label pile-up
       on phones; the tint carries the rest.
     - *Best tile:* marked with a star or pulse.
     - *Near misses:* tiles that are out of reach or not connected show
       faintly and, when tapped, give the reason ("too far from Varn",
       "must touch a connected Manufactory"), so players learn the rule.
  3. **Tapping a tile (full effect).** A ghost building appears with dashed
     link lines to every same-family building it would touch, and those
     neighbours' badges tick up to their new value ("+8% → +11%"), which
     makes it visible that a new building helps its neighbours too. The
     confirm sheet sums it: "Touches 3 Manufactories: +11% here, +6% to
     neighbours = +17% town income".

  The town-tile shortcut stays: building from the town tile auto-places on
  the best tile (R3), and the feed says where ("Manufactory placed east of
  Varn · +17%, best spot"). Tile actions must also offer the build on
  growth tiles outside the ring: extend `structureTileSurfaces` /
  `TileSurfaceInput` (`packages/shared/src/structure-placement.ts`) with a
  district-growth surface. The heat tint, labels, ghost building, link
  lines and best-next markers all ship in both renderers.
- **District links.** Conduits between touching same-family buildings: thin
  instanced beams at structure height in 3D, strokes between tile centres in
  2D, coloured per family. Any pulse must be a per-frame material uniform,
  never baked into `rebuildVisibleTerrain()`, which also fires on camera pan
  (the bug fixed in #1561).
- **Neighbour badge.** A small "+30%" / link-count badge per building, shown
  when zoomed in or when its town or district is selected, to avoid map
  clutter.
- **Disconnected state.** Disconnected members draw greyed out with a
  sparking broken conduit stub. The tile menu says "Disconnected — reconnect
  to <town>".
- **Town card and tile overview.** Replace "3 Manufactories: +30%" groups
  (`townModifierTotalsFromCounts`, `client-tile-overview-modifiers/`,
  `client-tile-menu-view.ts`) with district lines: "Industrial district · 5
  buildings · 12 links · +52%". The per-building breakdown shows `n` and its
  value.
- **Removal warning.** The confirm sheet for removing a member says "This
  disconnects N buildings (−X%)" when it would split the district.

### War readability

- **Attack preview.** Targeting an enemy district member shows "Breaks a
  6-building district (−X% to them)", computed client-side with
  `districtForTown` on known tiles. Visible enemy districts render with the
  same conduits, so the target is legible before the click.
- **Feed / battle report.** "Your industrial district at <town> was cut — 3
  buildings disconnected" for the defender, and "District cut" for the
  attacker.

### AI

- The redirect (R3) already places AI builds on the best tile, because the AI
  issues stacking builds against the town tile.
- **Gate fix (required).** `structure-command-planner.ts` only proposes
  stacking builds when `openTownSupportNeighborTiles` is non-empty. Under the
  ruleset that check must become "has any valid district tile", in both
  directions. A stale gate either hides valid growth tiles or reproduces the
  documented 99.9% rejection storm.
- Score candidates by marginal district gain from the cached index (no heavy
  selectors in snapshot builders, `docs/agents/ai-guardrails.md`).

## Phases

Each phase is one PR off `develop`, with tests beside the code.

0. **Balance pass and owner decisions.** Script the economy of realistic
   layouts (full ring, ring plus 2-wide strip, scattered, max-reach
   district) per family under the starting `k`/`base`. Compare against
   today, including Clearing House and arsenal extremes, and settle the open
   questions below. Output: the final constants table in this doc.
1. **Shared module and ruleset plumbing.** `structure-adjacency/` with unit
   tests (wrap, diagonal, ring parity Σn = 24, BFS reach bound, tie-breaks);
   season marker stamped and sent to clients. No behaviour change.
2. **Server rules.** Placement, redirect, effective counts in every economy
   path, district cache with targeted invalidation, counters. Tests: parity
   (a full ring equals legacy output exactly), isolated or out-of-reach
   rejections, capture splits a district and disconnects the far side, a
   captured member touching the captor's district joins it,
   dormant members keep connectivity, anchor loss disconnects, legacy season
   unchanged. **Lore:** the world bible update below lands in this branch.
3. **Client.** Placement UX (heat tint, gain labels, best tile, near-miss
   reasons, ghost building with neighbour bumps, confirm-sheet sum,
   best-next markers on town select), conduits, badges,
   disconnected state, town card and overview text, removal warning, in both
   renderers. Storybook stories for conduits and badges.
4. **War readability.** Attack-preview line, feed and battle report entries,
   enemy district conduits.
5. **AI.** Gate fix, marginal-gain scoring, and a regression test that the
   planner issues no stacking builds the server rejects.
6. **Enable.** Stamp `adjacency-v1` for the next season start; update
   `docs/game-mechanics.md` §5, `docs/product/resource-and-manpower-economy.md`,
   and `docs/adding-a-structure-playbook.md` §5 (placement modes), then add
   the client changelog entry.
7. **Cleanup.** After the last pre-ruleset season ends, delete the legacy
   per-ring counting for these families, `arsenalMultiplierForFactoryCount`,
   the stacking redirect sets, and the ruleset branches.

**Later, separately scoped:** resource-building adjacency (Mines, Hydrogardens,
Umbrite Rigs touching their own kind; worldgen already places resources in
clusters such as `TITANIUM_HILLS` and `FERTILE_PLAINS`), and Condenser REFINE
mode (slot supply is an integer, so it doesn't take a fractional bonus).
Condenser EXCHANGE coin is in scope from Phase 2 unless Phase 0 drops it.

## Lore check

`docs/lore/galactic-lore.md` §11 already says "Several Manufactories represent
a larger industrial base around a town." Adjacency changes what a group of
buildings means, so the world bible needs an update (in Phase 2). Proposed
text, not yet canon:

> **Industrial districts.** Works of one kind built side by side share power
> trunks, feedstock lines, tooling and freight sidings, so a contiguous
> district outproduces the same machines scattered across a town's hinterland.
> A district draws its labour and supply from the town it grew from; cut off
> from that town, its machines idle until the line is restored.

## Open questions for the owner

1. **Isolated penalty.** Should an isolated Manufactory or Depot really drop
   to about 57% of today, or should isolated copies stay at today's value,
   with neighbours only adding on top (simpler, but inflationary)?
2. **Arsenal ceiling.** Drop today's 2.25 per-copy cap (a copy with 8
   neighbours reaches 3.8), or keep a cap?
3. **Reach.** Is `DISTRICT_MAX_REACH = 3` right? Build-cost scaling with
   count and FOOD slots already limit sprawl.
4. **Shared anchor.** A district touching two towns' rings goes wholly to one
   town (lowest x/y). Alternatives: the highest tier, or the player chooses.
5. **Blocked diagonals.** Should two buildings touching only diagonally,
   with mountains or water on both orthogonal sides, count as touching?
6. **Flat and network counts.** Keep Manufactory's flat coin and Neural
   Works/Reserve Lattice network counts on raw copies (proposed), or switch
   them to effective counts?
7. **Condenser.** In scope from Phase 2, or deferred with REFINE?
