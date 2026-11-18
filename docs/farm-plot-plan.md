# Farm Plot: food without exploring

Status: proposal (not accepted; nothing built)

## 1. Problem

In playtest Run 3 (2026-11-18), two personas stopped within minutes:

| Persona | Stopped after | Coin | Manpower |
|---|---|---|---|
| Gerald | 9 min | 0 | 2,620 against a cap of 1,230 |
| Dev | 12 min | 0 | 2,298 against a cap of 1,170 |

Both wrote "nothing left to do". The diaries are in
`docs/playtest/runs/pt-oldphone/diary.md` and `pt-citybuilder/diary.md` on the
playtest branch.

Buildings already cost only manpower. `structure-costs.ts` says manpower is
"the sole build cost". Resource amounts are no longer spent:
`stripRetiredStockpileCost` drops them, and a free resource *slot* is the real
gate (`structure-slots.ts`). Three things still block a player who won't
explore:

1. **Every economy building needs a Manifest commission.** Commissions cost
   coin: 10, 40, 70, 100… (`tech-economy.ts`). A town earns about 10 coin a day
   (`server-game-constants.ts:44-49`).
2. **Most economy buildings occupy a FOOD slot.** This covers the Manufactory,
   Census Hall, Clearing House, Mine and Incubation Engine.
3. **FOOD slots come only from owned, garrisoned FARM tiles (1 each) and FISH
   tiles (2 each).** (`resource-slot-view.ts`) A spawn is placed with food
   within reach (`starter-site-quality.ts`), but the player still has to expand
   onto it and garrison it.

A player who would rather improve than expand has nothing to spend manpower on.

**Goal:** let manpower create food at home, so the existing tech tree works
from there. No structure moves out of the Manifest. As in Civ, buildings
still need their tech; the only new no-tech build is a basic food source,
alongside the Palisade and Relay Beacon that already need none.

### 1.1 Fit with the core loop (`docs/core-loop.md` §1)

- **Supports these:**
  - **"Optimising is the fun"** (§1.1): spending a visit on improving
    territory.
  - **Pillar 4, "Tall is viable against wide":** this gives tall players a
    start.
  - **Pillar 2, "Manpower is the real currency":** manpower becomes useful
    before the first coin purchases.
- **Changes the opening:** §1's one-sentence fantasy and the Opening row
  ("grab a town and 4 food slots, and push reach outward") assume food comes
  from expanding. Farm Plots make expanding for food optional, not required.
  Fertile tiles stay the cheaper source, so expanding still pays.
- **FOOD stays a requirement.** §1.1 says that if FOOD changes, it moves to
  growth instead of being a requirement, not both. This proposal doesn't
  change what FOOD does, only where a player can get it.

## 2. Proposal

### 2.1 Farm Plot (new structure)

| Rule | Proposal |
|---|---|
| Tech gate | None; available from the start, like the Palisade |
| Placement | An owned, garrisoned support-ring tile of an owned town (`town_support`-style surface), not on a resource tile |
| Effect | Supplies FOOD slots, like a FARM tile |
| Slot upkeep | None. A food source that consumed FOOD would be circular, the same reason the Hydrogarden has none (`structure-slots.ts:52`) |
| Coin upkeep | None |
| Cost | Manpower only; "expensive" (see §3, decision 2) |
| Cap | Limited naturally by support plots: 8 for a Town, 24 for a Great City or Metropolis (`supportRingRadiusForTier`). Each plot used is one fewer for a Manufactory, Incubation Engine or Trade Nexus |

### 2.2 Improving a Farm Plot

A tile holds one `economicStructure`, so a Hydrogarden can't sit *on top of*
a Farm Plot. Improvement works as an **in-place upgrade**, the way a Palisade
upgrades to a Fort (`fortTierForChoice`, `structure-tier-choice.ts`):

- Farm Plot → **Hydrogarden tier** once Hyperfeed Seedstock is commissioned.
  The tile then counts like a FARM tile with a Hydrogarden on it.
- Hydroworks in range then add their +2 as usual, if the upgraded plot counts
  as a Hydrogarden for `HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS`.

This keeps "improved like a normal food tile" without changing the rule that a
tile holds one structure.

### 2.3 The path this opens (no exploring)

1. Capture or own a town (see §3, decision 1).
2. Build a Farm Plot on a support tile with manpower. This gives FOOD slots.
3. Commission Trade (10 coin, the first commission). Build a Manufactory on
   another support tile with manpower; it occupies the Farm Plot's FOOD slot.
4. Later, commission Hyperfeed (40 coin) and upgrade the plot. This gives more
   FOOD for a Census Hall, Mine and so on.

## 3. Decisions needed (owner)

1. **What if the player has no town?** A new empire starts with only its AFC
   (towns are world-generated, all neutral at season start;
   `docs/game-mechanics.md` §Towns), so it has no support ring. Options:
   - (a) also allow Farm Plots in the ring around an owned AFC;
   - (b) accept capturing the nearby town as the first step. Spawns are placed
     with a town within 8 tiles (`STARTER_ECONOMY_DISTANCE`).
2. **Yield and price.** A Town needs 4 FOOD and a Manufactory 1.
   - A Farm Plot giving **1** (like a FARM tile) does not feed even a bare
     Town. The newest town or Manufactory goes dormant (§Shortfall and dormancy
     in `resource-and-manpower-economy.md`).
   - Pick the plot's FOOD yield, the upgraded yield and the manpower price. For
     comparison: Hydrogarden 80, Manufactory 150, Fort 300 manpower.
   - Existing waivers reduce town demand (`firstTownsFoodSlotWaiverCount`,
     e.g. Founding Concession). Decide whether yield assumes them.
3. **Upgrade price.** When upgrading Farm Plot → Hydrogarden tier, is the
   charge the full Hydrogarden price (80), as fort upgrades charge the chosen
   tier's full price, or the difference?
4. **Name and fiction.** See §5.
5. **AI.** Owner intent (`core-loop.md` §1.1) is that AI support for a new
   system is wanted but not required at launch. The default is to ship for
   humans first and add a structure-planner rule in a follow-up.

## 4. Implementation outline

Follow `docs/adding-a-structure-playbook.md` steps 1–15. Specific to this
structure:

- **Supply hook** (`resource-slot-view.ts`, `resourceSlotSupplyForPlayer`):
  add the Farm Plot's FOOD to `totals.FOOD` when the structure is active. This
  is the same pattern as the SYNTHESIZE-converter branch, which already
  supplies a slot "for a landlocked player" without a resource tile.
- Report it to `onSource` under its own label, so the Economy panel's
  breakdown shows "Farm Plot".
- **Do not change `tile.resource`.** Worldgen resources are treated as
  immutable: spawn placement caches food coords on that assumption
  (`spawn-placement-index.ts:172`), and snapshot tile fields need allow-listing.
  A structure avoids both.
- **Placement metadata:** a support-ring-only surface, excluding resource
  tiles, and no tech requirement (like `structure-registry-fort.ts:33`).
- **Upgrade:** a tier-choice helper mirroring `fortTierForChoice`, gated on the
  Hyperfeed tech, replacing the plot in place.
- **Auto-improve:** decide whether the per-resource `improve` switch (FARM)
  applies to Farm Plots.
- **Both renderers:** a 3D overlay plus a 2D icon (playbook §7–8; renderer
  parity rule in `AGENTS.md`).
- **Client:**
  - a build button on support tiles;
  - a structure-info card with copy that says what it does;
  - an entry in the "nothing to do" path, so players with spare manpower and
    no FOOD are pointed at it.
- **Tests:**
  - supply totals with and without the plot;
  - dormancy when FOOD is still short;
  - placement legality (support ring only, not on resource tiles);
  - the upgrade path;
  - snapshot round-trip of the new structure type.
- **Docs:**
  - `resource-and-manpower-economy.md` (slot table);
  - `game-mechanics.md`;
  - the world bible (§5);
  - a `CLIENT_CHANGELOG_ENTRIES` entry.

## 5. Lore check (proposal, not canon)

Read: `docs/lore/README.md`; world bible §11 "Houses and the planetary
economy" and §12 "Manifests and AFC modules".

Relevant canon:

- "fertile land supports food and population";
- "Food supports people and local development";
- structures are fabricated at the AFC and assembled on site;
- Hyperfeed Seedstock is "imported adaptive crop stock, calibrated for this
  world's soil".

**Proposed fiction:** the town's own people clear and work kitchen plots on
the ground around the town. That is labour (manpower), not imported machinery
or stock, so it needs no Manifest. Yields are poor, being local seed on
unprepared ground, until Hyperfeed's imported stock turns the plot into a
Hydrogarden.

This fits "food supports people" and keeps imported technology as what
Manifests buy. It adds one new canon fact: towns can grow subsistence food
off fertile tiles. That belongs in §11 if accepted.

**Canon question for §14:** does subsistence farming off fertile tiles
contradict "fertile land supports food"? Proposed answer: no. Fertile tiles
remain the efficient source, and plots are a costly fallback.

## 6. Out of scope

- Moving any structure out of the Manifest.
- Changing commission prices or coin income.
- The town "invest manpower" action, which is a separate option.
