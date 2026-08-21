# Natural Wonders — Design Proposal (Updated for Manpower Rewrite)

> **Status:** Design complete, effects adjusted for post-rewrite economy.
>
> **How to read it:** §1 motivates. §2 specifies each wonder with updated
> mechanics. §3 defines shared placement rules. §4 lists open questions.

---

## 1. Why natural wonders

Monuments are personal tools — buttons you press, built on your own tiles, gated
behind Shards. Natural wonders are **geographic prizes**. They exist on the map
before any player arrives. They change HOW THE MAP WORKS, not just what
abilities you have. Holding one is a strategic commitment: the bonus is passive
and permanent while you hold the tile, but the tile is attackable like any other.
Enemies know where it is. Neighbours become rivals.

Design goals:

- **Spatial identity.** Each wonder belongs somewhere specific on the map. You
  can plan an expansion toward one.
- **No buttons.** Passive effects only. No active abilities, no cooldowns.
  The "ability" is owning the tile.
- **Map-level impact.** The best wonders change the shape of the game — making a
  coastal empire fundamentally different from an inland one.
- **Scalable.** 9 wonders on a standard map, 1 of each type, placed during
  worldgen.

---

## 2. The nine wonders

### 2.1 — The Foundry Heart

**Effect:** Owner gains +1 slot of each resource type (FOOD, IRON, CRYSTAL,
SUPPLY). The slot bonuses increase the empire's capacity to build slot-consuming
structures.

**Spawn:** CRYSTAL_WASTES region only. LAND tile, up to 5000 attempts.

**Why:** Resources are slot-gated post-rewrite. +1 of every slot type loosens
the economy from a single contested tile — the empire that holds it can build
more structures simultaneously without expanding the slot footprint.

**3D:** Pulsing crystal geode with glowing aether core, embedded in cracked
ground. Fissures radiate outward with faint light bleed.

### 2.2 — The Deepwater Engine

**Effect:** Dock gold income doubled. Attacks originating from a dock tile gain
+15% attack stat.

**Spawn:** COASTAL_SAND biome, within 2 Manhattan tiles of SEA.

**Why:** Dock income still exists post-rewrite (gold/min, rescaled 288x). The
doubling works on the final computed output (after tech modifiers, harbor
exchange bonuses, etc.). The dock-attack bonus makes coastal positions
offensively relevant.

**3D:** Half-submerged industrial facility with rotating gear-driven pumps,
copper piping, water spouts, and rising bubbles.

### 2.3 — The Conscription Engine

**Effect:** +2000 flat manpower cap modifier (additive, applied after all
town/garrison-hall/rail-depot contributions). On first claim each season, the
controlling player receives an instant +2000 manpower to their pool.

**Spawn:** BROKEN_HIGHLANDS region. LAND tile.

**Why:** Manpower is the primary build currency. A flat +2000 cap is a
significant early-game force that scales with how quickly you take the wonder.
The instant +2000 pool injection gives an immediate tempo spike on first
claim, making the wonder a high-priority early expansion target.

**3D:** Industrial compound with barracks wings, central smokestacks, command
tower. Smoke particles rising.

### 2.4 — The Warpress

**Effect:** Mustering flags fill at 2× the normal rate (multiplicative with
existing outpost/rail depot speed bonuses). One additional flag beyond the
normal cap (max flags becomes 6 instead of 5).

**Spawn:** FERTILE_PLAINS region. LAND tile.

**Why:** Mustering is the combat throughput gate. Faster flags + extra slot
means the controller can sustain attacks from more fronts simultaneously.

**3D:** Massive stamping forge with animated hammer mechanism striking an anvil.
Sparks on impact, heat glow, steam vents.

### 2.5 — The Bastion Frame

**Effect:** All forts owned by the controller have their defense multiplier
increased by +0.5× (additive: Fort 2.5× → 3.0×, Iron Bastion 4.0× → 4.5×,
Thunder Bastion 8.0× → 8.5×).

**Spawn:** Within 3 Manhattan tiles of MOUNTAIN terrain. LAND tile.

**Why:** Forts are the backbone of territorial defense post-rewrite. A flat
+0.5× additive multiplier makes every existing fort harder to crack, favoring
players who fortify their borders before expanding further.

**3D:** Copper pipe and gearwork lattice embedded in the landscape. Aether
energy particles flowing through the pipes.

### 2.6 — The Calculating Engine

**Effect:** All technology research gold costs reduced by 10% (rounding down).
Shard costs (tiers 5+) unaffected.

**Spawn:** Any region, GRASS biome with LIGHT shade (open grassland).

**Why:** No tech-cost-reduction mechanic exists post-rewrite — this is the first.
Techs are gold-gated. 10% off the gold cost is a pure acceleration that scales
with how much research you do. The open-grassland requirement places it in the
most visible, contested terrain.

**3D:** Brass-and-glass computing machine with rotating calculation rings,
scrolling data on glass panels, and computation spark particles.

### 2.7 — The Quickforge

**Effect:** Once per 24h (real-time, UTC midnight reset), the controller's
next rush-buy on an in-progress build costs 40 gold less (floored at 0). Uses
the standard rush-buy mechanic with a flat gold discount applied. Resets on
fixed UTC midnight, not a rolling timer.

**Spawn:** FERTILE_PLAINS or ANCIENT_HEARTLAND region. LAND tile.

**Why:** Rush-buy is a formal system at 0.5 gold/manpower of remaining time.
A free daily waiver grants one full skip per day — strongest on expensive
builds. Fixed UTC reset avoids rolling-abuse.

**3D:** Rapid-action forge with animated pneumatic pistons, steam jets, and
red-hot forge glow.

### 2.8 — The Watchtower Engine

**Effect:** The wonder tile itself acts as a fully-functional Observatory for
its controller — eligible to cast crystal abilities (Aether Lance, Reveal
Empire, Aether Bridge, Aether Wall, ...) at the standard Observatory cooldown,
but exempt from the CRYSTAL slot upkeep a built Observatory requires. A
player with zero built Observatories can still cast crystal abilities as
long as they hold this wonder. Its cast radius is a fixed base (20) + 10 =
30 — a flat bonus over an untouched Observatory that does NOT stack with
observatory-range tech/domain effects (those only apply to actually-built
Observatories).

**Spawn:** DEEP_FOREST region. LAND tile.

**Why:** Crystal abilities are gated behind an Observatory's CRYSTAL slot and
cooldown — a real cost for players without spare CRYSTAL supply. Holding this
wonder grants that access for free, transforming the deep forest region into
an intelligence stronghold worth fighting over even for players who haven't
invested in Observatories yet.

**3D:** Tall brass telescope tower with a sweeping aether beam (rotating cyan
light cone). Star particles floating around it.

### 2.9 — The Cartographer's Lens

**Effect:** All tiles owned by the controller gain +1 vision range (extends the
visible neighbourhood by one tile in all directions).

**Spawn:** Within 2 Manhattan tiles of MOUNTAIN terrain. LAND tile.

**Why:** Simple, global, always-on vision advantage. Every tile sees one farther
— earlier intel on attacks, better information when expanding. Mountain
proximity places it on high ground, both thematically and tactically.

**3D:** Brass astrolabe with concentric rotating rings, prismatic lens, rainbow
light beams radiating outward, rainbow-coloured particles.

---

## 3. Shared mechanics

### 3.1 Data model

```typescript
tile.naturalWonder?: {
  type: NaturalWonderType;
  ownerId?: string;
  claimedAt?: number;
};

type NaturalWonderType =
  | "FOUNDRY_HEART"
  | "DEEPWATER_ENGINE"
  | "CONSCRIPTION_ENGINE"
  | "WARPRESS"
  | "BASTION_FRAME"
  | "CALCULATING_ENGINE"
  | "QUICKFORGE"
  | "WATCHTOWER_ENGINE"
  | "CARTOGRAPHERS_LENS";
```

### 3.2 Placement rules

Executed during `createSeasonSeedWorld()`, after terrain generation, before
cluster placement. Per wonder type, up to 5000 random centre attempts:

1. Validate spawn predicate (region/biome/proximity — see §2)
2. Manhattan distance ≥ 12 from any existing cluster centre
3. Manhattan distance ≥ 8 from any player spawn
4. Manhattan distance ≥ 8 from any already-placed natural wonder
5. If all attempts fail, the wonder is omitted gracefully

Rarest wonders placed first (tightest predicates get first pick).

### 3.3 Ownership & effects

Uses existing EXPAND/ATTACK ownership — no new capture mechanic. The bonus is
active while the tile is owned. Effects are computed per tick and stack
additively (though 1-per-map prevents stacking). Structure placement blocked
on wonder tiles (mutex, same as docks/towns).

### 3.4 Rendering

**3D:** One overlay module per wonder in `packages/client/src/client-map-3d/`,
following the InstancedMesh lifecycle (clear/addInstance/commit/update/dispose).
Wire into `client-map-3d.ts`. Each has unique geometry, custom shader materials,
and animated elements.

**2D:** SVG overlay images in `packages/client/src/client-map-render/overlays/`.
Register in the tile-features drawing pass.

### 3.5 AI heuristic

Add a `wonderBonus` scoring term to frontier claim evaluation:

- Neutral wonder tile within expansion range: +30 priority
- Enemy wonder tile adjacent to owned territory: +20 priority
- Allied wonder tile: 0

Slots into existing GOAP actions `claim_neutral_border_tile` and
`attack_enemy_border_tile`.

---

## 4. Open questions

1. **Minimap visibility:** Always-visible from turn 1 vs. vision-gated?

2. **Bastion Frame removed:** The empire integrity bonus was removed per design
   revision. Keeps the wonder focused on pure fort defense.

3. **Quickforge reset:** Decided: fixed UTC midnight (avoids rolling abuse).

4. **Conscription Engine instant pool injection:** Should the +2000 instant
   manpower apply only on first claim per season, or each time control changes?

5. **AI grand strategy:** Should the AI's long-term plan target wonder
   expansion as a strategic objective, beyond the tactical frontier heuristic?

6. **Victory condition interaction:** Should holding multiple wonders
   contribute to any victory path, or remain purely map-power boosts?

7. **Season reset:** Wonders persist (permanent features), but ownerId resets
   each season. Correct, or should previous holders retain control?
