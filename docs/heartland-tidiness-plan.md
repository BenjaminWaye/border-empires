# Heartland & Empire Integrity — Wide-vs-Tall — Implementation Plan

> **Status:** Committed design (June 2026), distilled from the design conversation
> that started from `defense-consolidation` exploration. This **supersedes** the
> old "Defense & Consolidation" framing: the global defensibility gauge is being
> repurposed, not deleted, and the per-tile local-support combat model is
> **shelved** (see §7).

## 1. North star

The game must support **two viable strategies**:

- **Wide** — sprawl. More land → more towns → bigger manpower pool and more gross
  output. (The game already leans this way.)
- **Tall** — a small, fully-painted, perfectly-consolidated heartland that wins on
  **economic density and durability**, not size.

Neither should dominate. The whole feature exists to make **tall** a real,
fun, balanced peer to **wide**.

## 2. The three pillars

### 2.1 Auto-fill (makes a tidy heartland *achievable*)
Painting your interior by hand is the core friction today, and frontier decay
actively punishes it: a claimed-but-unsettled tile reverts to neutral after
`FRONTIER_DECAY_MS` (10 min) unless it's anchored (resource/town/dock/fort/support
— `runtime-frontier-decay.ts:241` `frontierDecayPausedForTile`). Plain interior
grassland matches none of those, so it decays.

**Fix:** a tile (or region) **fully enclosed by your own territory + natural walls
(sea/mountain)** auto-**settles** for free. Settling is the key — SETTLED tiles are
decay-immune, so the interior becomes permanent in one step. Decay keeps governing
the *contested* edge (not enclosed); auto-fill governs the *safe* interior. They
never overlap because "enclosed" and "exposed" are opposites. This is the friendly
mirror of the existing **encirclement** decay (`frontierDecayKind: "ENCIRCLEMENT"`):
enemy surrounds your tile → it decays; *you* surround a tile → it settles.

Strong version (target): an **enclosure / flood-fill test** so you only secure the
**perimeter** (for an island, its coastline — sea counts as a wall) and the whole
interior auto-claims + auto-settles. You paint the outline; the island fills itself
and stays. Self-limiting: you can only auto-fill land you already fully surround, so
it removes busywork, never a decision (the contested front stays manual + costed).

### 2.2 Empire Integrity meter (measures tall — the defensibility calc reborn)
The existing `defensibilityScore` (`math.ts:45`) already measures exactly this: it
reaches **1.0 when your settled territory is a solid block up to its natural borders**
(`E → 0`, because sea/mountain edges are not "exposed" — `exposure.ts` `isExposedSide`,
`player-defensibility-metrics.ts` `exposedEdgesFor`). It was useless only because
(a) nobody could reach high values (painting was a hassle — fixed by §2.1) and
(b) it did nothing (display-only).

**We keep the calculation, change its job.** It becomes a **global, per-player
Empire Integrity meter** ∈ [0,1], computed from the already-cached
`buildPlayerDefensibilityMetrics` (settled `Ts`/`Es`). One headline number per
empire.

**Global, not local** — deliberately. There's already a *local* per-town growth
reward (`LONG_PEACE_GROWTH_MULT`, `live-snapshot-view.ts:764`, triggered by ~24h of
no nearby war). Empire Integrity is the *empire-scale* complement: local peace = "this town
is calm," global integrity = "my whole realm is solid." Different axes, no
double-count.

### 2.3 Economic-density bonus (pays tall)
Empire Integrity multiplies the **tall** levers:

- **Town gold production**
- **Strategic resource production**
- **Town growth** — *gently* (it already stacks `LONG_PEACE_GROWTH_MULT` ×
  `firstThreeTownsPopulationGrowthMult`; integrity is a 4th multiplier on the same
  number, so keep it light or growth runs away).

**Calibration = redistribution, not power creep.** The multiplier spans **below and
above 1.0**, centered so that *typical* integrity (~0.5, where most players sit today)
≈ neutral. Low integrity (wide, ragged) < 1.0; high integrity (tall, solid) > 1.0. This
is the implicit "lower the base" the design calls for, achieved with a single
flag-gated multiplier instead of editing base constants (fully reversible, lower
blast radius).

Result: wide keeps its **scale** advantage (more towns/tiles); tall trades scale for
a fat **per-unit** multiplier. Tall identity = *few, fast-growing, high-tier,
resource-dense cities*.

## 3. Why wide and tall stay at parity (the math, not a leash)
Empire Integrity is **easy to max when small, hard to max when sprawling**: a compact island
painted to its sea borders hits ~100%; a wide empire on ragged multi-enemy fronts
always has exposed perimeter, so its integrity sits lower. So the bonus is a *big
multiplier on a small base* (tall) vs a *small multiplier on a big base* (wide) —
they land in the same ballpark by construction. One tuning knob (how hard integrity
scales output) sets where parity lands.

**Tradeoffs each accepts:** Tall = efficient, safe, hard to crack, but lower
absolute ceiling and can't win by conquest. Wide = scale + conquest, but diluted,
exposed, and can never be as tidy (forgoes the multiplier).

**One thing to watch (not a blocker):** a *perfect* turtle becoming unkillable and
stalling a game. The merged muster/siege rules already answer this — coordinated
multi-front pressure bleeds forts faster than they heal.

## 4. Flag gating
Everything ships behind a new env flag `EMPIRE_INTEGRITY_ENABLED`
(`process.env.EMPIRE_INTEGRITY_ENABLED === "true"`, default **false**), mirroring
`MUSTER_SYSTEM_ENABLED`. Flag off ⇒ byte-for-byte legacy behaviour. Lets us A/B and
tune parity in a live game without a deploy.

## 5. Phases

| Phase | Scope | Touches | Risk |
|---|---|---|---|
| **A. Empire Integrity → economy bonus** | Empire Integrity meter from cached metrics; flag-gated multiplier on town gold + resources + (gentle) growth | shared, sim | low–med |
| **B. Auto-fill via enclosure** | Flood-fill enclosure test; auto-claim + auto-settle enclosed interior (free, decay-immune); reconcile decay/encirclement; perf hook at `replaceTileState` | sim | med–high |
| **C. Empire Integrity meter UI** | Surface the global Empire Integrity % + the bonus it grants (repurpose the defensibility readout) | client (⚠ changelog hook) | low |
| **D. AI parity + tuning** | AI values consolidation; tune magnitudes for wide/tall parity | sim | med |

Phase A is the headline value and fully sim-side — build + verify first. Phase B
makes the meter *reachable* and is the bigger engineering lift. C/D follow.

## 6. Phase A detail (first build)
- **Flag + constants** in `packages/shared/src/config.ts`: `EMPIRE_INTEGRITY_ENABLED`,
  plus the multiplier curve constants (gold/resource range, gentler growth range).
- **`empireIntegrity(Ts, Es)`** ∈ [0,1] from `buildPlayerDefensibilityMetrics`'s settled
  `Ts`/`Es` via the existing `defensibilityScore`. Reuse the cached
  `defensibilityMetricsCacheByPlayer` so it's O(1) on the hot path.
- **Multiplier helpers** (pure, in shared): `integrityEconomyMult(t)` and
  `integrityGrowthMult(t)`, both centered so t≈0.5 ⇒ ~1.0, spanning below/above.
- **Apply** in the sim economy: town gold (`player-update-economy` /
  `townGoldPerMinuteForPlayer`), strategic resource production
  (`strategicProductionPerMinute`), and population growth
  (`runtime-population-growth`) — each `× integrity*Mult` **only when the flag is on**.
- **Tests:** solid island ⇒ high integrity ⇒ >1 mult; ragged ⇒ <1; flag-off parity;
  curve centered at ~1.0 for mid integrity.
- No client changes (no changelog hook).

## 7. What's shelved
The per-tile **local-support combat** model (branch `agent/local-support-defense`,
commits make settled-tile defence scale with friendly-settled neighbours + the
"wedge softens a pocket" feel) is **parked, not merged**. It's flag-off and costs
nothing to leave on its branch. The headline is now the **paint → integrity → economic
density** loop; combat stays on its legacy multipliers. We can revisit the wedge feel
later.
