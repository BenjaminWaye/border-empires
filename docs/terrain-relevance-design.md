# Making Terrain Matter — Design Exploration

> **Status:** Exploration, not a committed design. Answers "the map doesn't
> affect strategic decisions — how do we change that?"
>
> **Companions:** `docs/opening-and-retention-roadmap.md` (where this lands
> in the build order), `docs/opening-experience-exploration-brief.md` §2A
> (identity), `docs/expansion-motivation-exploration-brief.md` (the
> mid-game). All figures read from live source 2026-09-19.

---

## 1. Sharpening the diagnosis

The complaint is "terrain doesn't matter." The code says something worse:
**terrain already matters, invisibly and punitively.** It shapes what you
can do, never rewards knowing it, and silently penalises not knowing it.

### 1.1 The chain from terrain to progression is severed

This is the structural difference from Civilization, and everything else
follows from it.

**Civ:** terrain → tile yields → beakers/turn → research rate. Hills near
your capital literally make you research faster, so "settle the hills" and
"research Mining" are the same decision. The ground sets your *rate*.

**Border Empires:** `townGoldPerMinuteForPlayer`
(`player-update-economy.ts:164-217`) is the entire income formula. Its terms
are: base rate, support ratio, population tier, connected-town bonus,
Mintworks count, first-three-towns multiplier, income mods, converter gold.
**Not one term reads tile resource or terrain.** Tech cost is
`techGoldCostForResearchedCount(techIds.size)` — identical for all 41 techs
at any moment, regardless of what you own.

So terrain has **no effect whatsoever on how fast you advance.** There is no
"this ground makes me a research power."

### 1.2 Terrain gates permission, not rate

What terrain *does* control:

- **Slots.** `BASE_SLOTS_BY_TILE_RESOURCE`: a TITANIUM tile → 1 TITANIUM
  slot, GEMS → 1 CRYSTAL, UMBRITE → 1 UMBRITE, FARM → 1 FOOD, FISH → 2.
  Structures demand slots or go dormant (`STRUCTURE_SLOT_DEMAND`: a Fort
  needs 1 TITANIUM). This is a **binary permission gate** — you can build the
  thing or you cannot.
- **One harsh binary on income:** an unfed town returns `0` gold outright
  (`player-update-economy.ts:187`). No FOOD slots, no economy.
- **A quirk worth reviewing:** `supportRatio` is settled-owned land ÷
  *available* land in the support ring (`:130-141`). A town hemmed in by sea
  or mountains has a smaller denominator, so cramped terrain is **cheaper to
  run at full output** than open ground. That is backwards from intuition and
  is probably not deliberate.

### 1.3 Half the tech tree is already terrain-conditional — and hides it

- `masonry` reveals Titanium · `leatherworking` reveals Umbrite ·
  `crystal-lattices` reveals Crystal
- `irrigation` → Waterworks, which only boosts FARM tiles
- `mining` → only useful on TITANIUM/CRYSTAL
- `agriculture` → Farmstead (FARM) plus a FISH slot bonus

On the wrong map these are dead weight. And costs escalate **10 → 40 → 70 →
100 → 130**, against ~10 gold/day/town income. A wasted second pick costs
roughly four town-days.

**So the game already punishes uninformed play. It just never rewards
informed play.** That is the worst of both worlds, and it is the real
version of the complaint.

### 1.4 Terrain has zero effect on combat

`FrontierCombatPreviewTile` carries a `terrain` field
(`frontier-combat.ts:7`) that **is never read** in the attack or defence
multiplier chain. Defence is: settled ×1.3, town ×1.2, forts, weapons
structures, tech/domain mods, exposure, breach shock
(`frontier-combat.ts:156-201`). No high ground. No forest cover. No river
crossing.

For a game whose central mechanic is a contested territorial border, the map
is tactically inert.

---

## 2. Four layers, ordered by depth

### Layer 1 — Make the existing conditionality legible *(cheap, no balance risk)*

Start here, in text, exactly as proposed. It converts §1.3's hidden penalty
into a decision without changing a single number.

**1.1 Regional resource readout.** Cluster types are already
self-describing — `FERTILE_PLAINS`→FARM, `TITANIUM_HILLS`→TITANIUM,
`CRYSTAL_BASIN`→GEMS, `HORSE_STEPPES`→UMBRITE, `COASTAL_SHOALS`→FISH
(`server-worldgen-terrain.ts:143-149`). Report nearby clusters by name and
bearing:

> *Titanium Hills — 8 tiles NE. Crystal Basin — 14 tiles S. No Umbrite
> within 20 tiles.*

Revealing cluster *names and bearings* rather than individual tiles keeps
the per-category tech reveal gates (`hasRevealedResourceForPlayer`) intact —
you learn your region is titanium-rich without being handed the tiles.

**1.2 Tag every tech with its terrain precondition and whether you meet it.**

> *Rigging Works — reveals Umbrite. **No Umbrite detected near your
> territory.***

This is the highest value-per-line change in this document. Right now a
player can spend 40 gold — four town-days — on a reveal for a resource that
does not exist in their region, and the game will not warn them.

**1.3 Do the same for domains.** Four of the five tier-1 domains are
map-contingent (see the roadmap's §1.1b). Same treatment.

### Layer 2 — Give terrain a *rate* effect *(the structural fix)*

**Lead proposal: owned resource tiles discount tech cost in the matching
branch.**

The hook already exists. Every tech carries a `branch` field, populated
across the whole tree: **economy 12, war 10, manpower 8, aether 11**. And
the resource types map onto those branches almost perfectly:

| Resource | Branch | Because |
|---|---|---|
| TITANIUM | war | forts, bastions, titanium weapons |
| UMBRITE | war | siege ladder, muster discipline |
| GEMS → CRYSTAL | aether | abilities, observatory, aether towers |
| FARM / FISH | economy, manpower | towns, population, support |

Implementation is a single multiplication at one call site:
`goldCostForTechResearch` (`tech-wonder-gold-discount.ts:9-17`) already
takes the player and computes `techGoldCostForResearchedCount(techIds.size)`
— and already applies a wonder discount, so the shape is proven. Add a
branch discount derived from the player's owned resource tiles.

**Why this shape rather than the obvious alternative:**

- It **preserves the narrow gold economy.** The manpower rewrite's §6.1
  deliberately rescoped gold by a 288× divisor, and
  `gold-sinks-and-converters-2026-03.md` has an explicit design rule against
  letting "rich + safe + tall" beat "controls the map". Making resource tiles
  *produce gold* would be more Civ-like but would undo both. Terrain should
  not make you richer; it should make specific knowledge cheaper.
- It **produces the Civ effect exactly**: your ground pushes you down a
  branch, and going against your ground stays possible but expensive. That
  is the decision the complaint is asking for.
- It **compounds with the existing curve** instead of fighting it. As costs
  climb 10 → 40 → 70 → 100 → 130, a 25–40% branch discount becomes a real
  commitment rather than a rounding error.
- It makes **Layer 1's readout actionable**: *"Titanium Hills ×2 → War
  techs −30%."* The information and the incentive arrive in the same line.

**Rejected alternative: hard terrain gates on tech.** "Cannot research
Titanium Weapons without owning a Titanium tile" is a stronger signal but
punishing — it turns an unlucky spawn into a locked-out branch. A discount
says *"this is your path"*; a gate says *"you may not play"*.

### Layer 3 — Terrain as a tactical layer *(biggest win per line of code)*

Give hills, forest and rivers real combat multipliers. The plumbing is
already there and ignored (§1.4) — this is `foldMult` lines plus balance
work, not new architecture.

Why this may be the single most valuable item in this document:

- It makes **"where" a strategic question**, not just "how much". Today a
  border is a number; with terrain it becomes ridgelines, chokepoints and
  cover.
- It makes the map **readable as a military object** at a glance, which is
  most of what makes a 4X map feel alive.
- It gives **Dwarf Kingdom** and the whole fort ladder a terrain
  interaction — fortifying the pass rather than fortifying a tile.
- It makes your genuinely distinctive mechanic — the contested reach border
  and `grantAnchorToBorder` — **positional** rather than arithmetic.
- It retroactively justifies the hills vision bonus and the forest/hills
  claim-time penalties, which currently read as friction without payoff.

Sequencing note: this only pays off where borders actually touch, so it is
gated on the density work (roadmap Phase 3) in the same way the return
report is.

### Layer 4 — Terrain as identity and goal

**4.1 Surface the terrain-flavoured victory paths.** Two of the five are
already about ground — Resource Monopoly (≥80% of one resource type) and
Maritime Supremacy (≥55% of docks) — with thresholds in
`server-game-constants.ts` and no readout anywhere. *"You hold 31% of the
world's Titanium — 12 tiles from Resource Monopoly"* turns your map into an
ambition. (Also the expansion brief's §5D ask, so one surface serves both.)

**4.2 Give the five regions real standing effects.** `FERTILE_PLAINS`,
`DEEP_FOREST`, `BROKEN_HIGHLANDS`, `ANCIENT_HEARTLAND`, `CRYSTAL_WASTES`
currently only bias worldgen placement. If your home region carried a modest
standing modifier, *"I am a Highlands empire"* would be a true sentence with
mechanical weight — and the natural thing for the minute-0 domain pick to
respond to.

**4.3 Let the map name your ambition.** With 1.1, 2 and 4.1 in place, a new
player's arrival can state a thesis: *"Ironreach: titanium-rich, town-poor,
mountain-walled. War techs are cheap here. You are closer to Resource
Monopoly than to Town Control."* That is the opening's missing identity
(brief §2A), delivered by the ground rather than a menu.

---

## 3. Suggested order

| Step | Why here |
|---|---|
| **L1.1 + L1.2** (readouts, text) | Zero balance risk, fixes an active penalty, and makes everything below legible. Ship first. |
| **L2** (branch discount) | The structural fix. One call site. Turns the readout into an incentive. |
| **L4.1** (victory readout) | Cheap, already-computed thresholds, serves the mid-game too. |
| **L3** (combat terrain) | Highest ceiling, but wants density (roadmap Phase 3) to pay off, and needs real balance work. |
| **L4.2** (region effects) | Largest design surface; do it once L2 proves the "ground implies strategy" loop works. |

## 4. Open questions

1. What discount magnitude makes L2 a real decision without making
   off-branch tech feel locked out? 25–40% is a guess; it needs the actual
   income curve modelled against the 10/40/70/100/130 ladder.
2. Should the L2 discount scale with tile count, or step at thresholds
   (1 tile / 3 tiles / a full cluster)? Thresholds are more legible and
   match the existing cluster `controlThreshold: 3`.
3. Does UMBRITE→war double up with TITANIUM→war, making the war branch
   trivially cheap for anyone holding both? Possibly cap the per-branch
   discount.
4. Is the §1.2 support-ratio quirk (cramped terrain is cheaper to max)
   deliberate? If not, it is a small independent fix.
5. For L3, does terrain-based defence break the existing exposure model
   (`defensibilityScore`), which already discounts stretched borders? The two
   need to be designed together, not stacked blindly — see also the
   roadmap's 4.1 on empire integrity's inert input.
