# Wardens and relic Bleed: gameplay proposal

Status: active proposal — not implemented. The game designer (repo owner) owns
the next decision on the open questions in §5. When delivered, the shipped rules
move into [`game-mechanics.md`](game-mechanics.md) and
[`relics.md`](relics.md), and this file is deleted.

Fiction: [world bible §1, §4 and §5](lore/galactic-lore.md#4-the-wardens-and-the-infestations).
The lore is canon; everything below (rules, numbers, presentation) is the
proposal. Keep numbers here, not in the world bible.

Naming: the player-facing "Planetary Defense" faction (internal id
`barbarian-1`) was called "The Bleed" in old changelog entries. It is unrelated
to this proposal. Relic Bleed is a new, separate system owner.

Delivery order: **relic Bleed first** (Part A), Wardens second (Part B). Relic
Bleed is local, caused by a player's choice, and reuses most of the
barbarian-tile machinery.

---

## Part A — Relic Bleed

### A1. Which relics hold Bleed

- At world generation each relic site rolls whether it holds a sleeping Bleed
  mass (starting proposal: 50%). The result is hidden from every player and is
  stored on the site like its reserves.
- A relic can breach at most once per world. After the breach its Bleed is
  gone, so the relic can never breach again. This keeps outbreaks bounded by
  the relic count (at most 7 per planet).

### A2. Breach pressure

Pressure belongs to the relic and rises only while a House is using it:

| Event | Pressure |
|---|---|
| Garrisoning (activating) the installation | +1 one-off |
| Each reserve charge consumed (suit launch, field cell, rush subsidy, vault draw) | +1 per charge, scaled per family so a full reserve's worth adds about the same total |
| Each hour garrisoned and operating | +0.5 |

- The breach fires when pressure crosses a threshold drawn at random when the
  site is seeded (e.g. uniform 6–20). The threshold is never shown.
- Players see a coarse in-world hint instead of a number: an operating relic
  that holds Bleed starts to flicker and shudder once pressure passes half its
  threshold. Relics without Bleed never do, so an attentive player can learn
  which relics are dangerous.
- **Telegraph.** When the breach fires, the relic convulses for 90s before
  the Bleed comes out: ground cracks and light bursts from the ziggurat. This
  is visible to everyone who can see the tile, and the owner gets an alert. The
  owner can use that window to pull aether structures back, raise defenses or
  muster.

Lore: drawing on reserves starves the Bleed out, and the running installation
pulls it out (world bible §4). The pressure sources map one to one onto that.

### A3. The outbreak and its aether pool

- At the breach, the Bleed takes the relic tile itself. The owner loses the
  relic until they take it back.
- Each outbreak has an **aether pool** `P`, starting at 15.
- Each tile's defense is a multiple of a fixed reference attack `R`:
  `defense = (P_component / n_component) × R`, where `n` is the number of
  tiles in its connected component (§A4). `R` is a constant tuned to a typical
  mid-game attack, so attack upgrades still help.
- With the existing win chance `atk² / (atk² + def²)`
  (`packages/shared/src/math/math.ts`), a reference attacker gets:

| Tiles in component (pool 15) | Defense ×R | Attacker win chance |
|---|---|---|
| 1 | 15 | ~0.4% (effectively unbeatable) |
| 2 | 7.5 | ~2% |
| 3 | 5 | ~4% |
| 10 | 1.5 | ~31% |
| 15 | 1 | 50% |
| 20 | 0.75 | 64% |
| 50 | 0.3 | ~92% |

- Effort levels (Extra/Double) and Combat-Suit charges still scale the odds on
  top, as they do today.
- Battle preview and the tile panel show the tile's current defense like any
  other tile, so players can see the outbreak thinning.

### A4. Core and fragments

- The **core** is the connected component that holds the breach relic tile.
  If the relic tile is retaken, the core becomes the largest remaining
  component.
- Any other component is a **fragment**. When a cut splits an outbreak, the
  pool is shared between the pieces in proportion to their tile counts, so a
  cut does not change density straight away.
- Fragments receive no growth from the core and lose 10% of their pool per
  minute. Once a fragment's density (`P/n`) falls below 0.2, one of its edge
  tiles goes dormant every 15s until the fragment is gone.
- The core does not decay. It thins only by spreading.

This rewards cutting an outbreak apart: a fragment that is cut off dies on its
own, but the core has to be worn down.

### A5. Growth

The Bleed grows by consuming aether-work, never by winning fights:

| Taken by the Bleed | Pool gain | Effect on the target |
|---|---|---|
| Aether Tower (`OBSERVATORY`) | +5 | Destroyed |
| Aether Condenser / High-Yield Aether Condenser | +3 / +5 | Destroyed |
| Live Shard site | +8 | Consumed |
| A relic with reserves left | +1 per 10% of reserve | Reserve drained |
| Ordinary tile, town, fort, troops | 0 | Tile taken (towns/forts are captured, not destroyed) |

Gains go to the component that took the target. Consuming (destroying) rather
than holding keeps growth one-off and bounded. Starting cap: pool 40.

### A6. Movement

- Seen Bleed tiles act through the barbarian planner job (one action in
  flight per tile, rest after it settles, a shared attack budget), with its own
  target scorer.
- The scorer reaches for the strongest aether signal within a sense radius
  (proposal: 12 tiles): Aether Towers and condensers, then live Shard sites,
  then relics with reserves. With nothing in range, it spreads into neutral
  land toward the nearest House's land.
- Spreading into neutral land is free but thins the component.

### A7. Breaking it: Crystal drops

- Every tile the Bleed loses, through combat or by going dormant, has a 10%
  chance to leave a CRYSTAL resource on that tile. This applies only to land
  with no existing resource, structure, town or dock.
- An outbreak worn all the way down leaves its relic tile neutral and
  depleted of Bleed, keeping its remaining reserves.

### A8. Presentation (both renderers)

Every overlay below must be built for both the 2D canvas path and the
true-3D path (`isTrue3DRendererActive()`), in the same branch.

- **Core tiles:** dense, bright aether veining in the ground with a slow pulse.
  The relic tile shows the misshapen rock body. Brightness scales with density,
  so thinning is visible at a glance.
- **Fragment tiles:** dimmer, cracked and flickering, with crystal flecks that
  grow as the fragment decays. No pulse. A fragment must never look like the
  core.
- **Breach telegraph:** the relic convulses (light bursts, ground cracks) for
  the 90s warning, plus a minimap ping.
- **Crystal drop:** a short settle animation into the CRYSTAL resource marker.
- Tile panel: "Bleed (core)" / "Bleed (fragment)", defense and density.

### A9. State and limits

Follow [`agents/state-and-persistence-discipline.md`](agents/state-and-persistence-discipline.md):

- One system owner (e.g. `bleed-1`); each Bleed tile is mapped to its outbreak
  id. Outbreak records are bounded by the relic count. The tile map is bounded
  by a hard cap on Bleed tiles per outbreak (proposal: 80) and is pruned when a
  tile leaves Bleed ownership by any route.
- Per relic: `holdsBleed`, `breachPressure`, `breachThreshold`, `breached`.
- Snapshots carry outbreak state (pool, core tile, component pools), not
  event logs. Component membership is recomputed at boot from tile ownership.
- Gauges: Bleed tile count and outbreak count.
- The Bleed ignores coin and manpower gates, like barbarians.

---

## Part B — Wardens (second)

Wardens are drawn by a House's aether disturbance and land from the sky. This
part is less settled; Part A should ship first.

- **Aether disturbance score** per House, summed from: active relics (heavy),
  completed monuments and monument stages under construction, activated
  wonders, Aether Towers, Aether Bridges, Aether Condensers and Crystal
  throughput. Town size and tier do **not** count (world bible §5).
- **Pressure meter, not a daily roll.** Disturbance adds to hidden pressure
  continuously. A landing fires when pressure crosses a threshold that is
  re-randomized after each landing. Enforce a minimum gap between landings and
  a grace period for new Houses.
- **Coarse signal:** show Quiet / Noticed / Hunted in the HUD, never a
  percentage.
- **Telegraph:** a descent streak and light column over the target region
  60–120s before touchdown.
- **A fight, not a damage roll:** Wardens are system-owned tiles or units that
  attack the House's aether structures first. Forts, garrisons and muster flags
  all fight them.
- **Disable, don't delete:** a Warden strike knocks structures offline until
  repaired. It never deletes monument stages.
- **Reward:** beating a landing drops Shards or salvage.
- **Offline players:** cap damage per landing, and either let static defenses
  fight on their own or land only on Houses that are online (§5).
- **Wardens and the Bleed:** a Bleed breach adds heavily to Warden pressure in
  that area and pulls a landing toward it. Wardens attack Bleed tiles and House
  aether-work alike.

---

## 5. Open questions

1. Starting numbers to tune: 50% of relics hold Bleed, threshold 6–20, pool
   15, reference attack `R`, 10% Crystal drop, fragment decay 10%/min.
2. Should a breach fire while the relic's owner is offline, or wait until they
   are online (with the 90s telegraph shown when they return)?
3. Does the Bleed attack rival Houses whose land lies between it and its
   target? (Proposal: yes. It attacks whatever stands between it and aether.)
4. Part B: Warden unit model (tiles on the barbarian model, or real units)
   and repair cost for disabled structures.
5. The Sable Recollections still describe infestations rising near Crystal
   seams (world bible §14); revise them before players see that text.
