# Defense & Consolidation — Exploration Brief

> **Status:** Early exploration, NOT a committed design. This is a handoff brief
> for an agent (or designer) to continue investigating. It pairs with
> `docs/mustering-feature-story.md` (the border-mustering combat proposal); read
> that first for context on the muster/garrison model this builds on.
>
> **Goal of this brief:** capture the problem with today's "defensibility,"
> ground it in the actual code, and lay out a candidate direction (local support
> + frictionless consolidation) plus the open questions to chase down.

---

## 1. The problem (player-reported)

- Players sit at a **constant ~50% "defensibility"** no matter what they do, which
  *reads* as "I am permanently easy to attack" and makes defense feel hopeless.
- The desired feel: **driving a wedge into another player's settled tiles should
  make the rest of that area easier to clean up.** Defense should be about local
  shape and connectivity, not a single global gauge.
- Suspicion (correct — see §3): **settling purely for defensibility is boring**,
  and any fix should make *consolidation* easier and more rewarding, not add more
  busywork.

## 2. How combat & defensibility actually work today (grounded)

**The combat roll uses only the TARGET TILE's own state — not any global
defensibility metric.** `packages/shared/src/frontier-combat.ts:32-45`
(`defenseMultiplierForTile`):

- `FRONTIER` ownership → **0× defense** (free to capture)
- `SETTLED` → ×1.35
- has town → ×1.2 (stacks: a settled town ≈ ×1.62)
- has dock → ×1.1
- `terrain === "MOUNTAIN"` → ×1.15 — **effectively dead code.** Attacks are
  rejected on any non-LAND target (`packages/game-domain/src/index.ts:233-234`,
  code `BARRIER`), so a mountain can never *be* a combat target. Recommend
  deleting this branch.
- has active fort → × `fortDefenseMult` (passed in by caller)

Win chance is `atkEff / (atkEff + defEff)` with `atkEff = 10 × atkMult`,
`defEff = 10 × defMult` (`frontier-combat.ts:54-62`, `math.ts:77`).

**The "defensibility %" the player sees is a DISPLAY-ONLY metric, decoupled from
combat.** Its only consumers are client-side:
- Formula: `defensibilityScore(T, E)` / `defensivenessMultiplier(T, E)` in
  `packages/shared/src/math.ts:35-58`.
  - `idealExposureForTiles(T) = 2·⌈2√T⌉` (minimum perimeter for T tiles)
  - `exposureRatio = clamp(ideal / E, 0, 1)`
  - `defensibilityScore = clamp(ratio / (0.2 + 0.8·ratio), 0, 1)`
- Consumed only in `packages/client/src/client-tech-panel-flow.ts:46`
  (`× 100` → a percentage) and `client-app-runtime.ts`. **No server/combat
  consumer** (verified by grep across `apps/` and `packages/`).
- `T` (settled tile count) and `E` (exposed-edge weight) come from
  `packages/shared/src/exposure.ts` (`recomputeExposureForPlayer`,
  `exposureWeightFromSides` in `math.ts:27-33`: 0/1 sides→0, 2→1, 3→2.5, 4→4).
- Per-player metrics assembled in
  `apps/simulation/src/player-defensibility-metrics.ts:42`
  (`buildPlayerDefensibilityMetrics`).

**Why it's always ~50%:** the score compares your real perimeter to the perimeter
of a *perfect blob*. Any realistically-shaped empire has a perimeter several times
the ideal, and the `ratio/(0.2+0.8·ratio)` curve parks the whole practical
mid-range near the middle. It is essentially telling every normal player "you are
averagely shaped" — non-actionable and demoralizing.

**Conclusion:** removing the global defensibility metric costs **nothing
mechanically** (it isn't in the combat roll). It only removes a (bad) strategic
readout, which we should replace with something local and actionable.

## 3. Candidate direction

### 3.1 — Replace tile defense with a single LOCAL model
> **Tile defense = base + (support per adjacent friendly *settled* tile) + garrison**

- Replaces the multiplier grab-bag (§2) AND the global gauge with one legible
  quantity.
- **Wedges now matter automatically:** capture a tile inside an enemy's settled
  area and every neighbour that leaned on it loses support and drops in defense.
  Push the wedge deeper → a whole pocket softens at once → cleanup snowballs.
  Exactly the requested feel.
- Towns/forts contribute via **garrison** (see the mustering doc's §3.5 garrison
  model), not via bespoke multipliers.
- Ties into mustering: a **cut-off pocket also loses its logistics pipeline** and
  can't receive reinforcement muster, compounding the local weakness.

### 3.2 — Make consolidation frictionless (NOT a settle-the-perimeter chore)
The earlier "encircle an area then settle the encirclement" idea was rejected as
too much work and undiscoverable. Replace it with the *opposite*:

- **A tile fully surrounded by your own territory is automatically consolidated**
  — it becomes core/heartland with **zero clicks**, rendered as a solid interior
  rather than individual tiles to babysit.
- Manual settling then only ever matters at the **contested edge**. We *remove*
  tedium rather than adding a hidden combo. "The middle of my country is safe" is
  intuitive and needs no tutorialization.
- Optional payoff loop: a consolidated interior **strengthens your logistics
  pipeline** (faster mustering at the front), so tidying territory actively fuels
  offense instead of being defensive housekeeping.

### 3.3 — Replace the gauge with local cues
Instead of a single "defensibility %", surface **per-tile** state: highlight tiles
that are **cut off / unsupported / under-garrisoned**, so a player can see exactly
where they're weak and act on it. More situational awareness, not less.

## 4. What to lose / keep
- **Lose:** global `defensibilityScore` / `defensivenessMultiplier` display; the
  dead `MOUNTAIN` defense branch.
- **Keep / repurpose:** `exposure.ts` neighbour/wrap helpers and the notion of
  exposed edges (still useful for the *local* support calc and the
  auto-consolidation "fully enclosed?" test). The **ENCIRCLEMENT** machinery
  (`frontierDecayKind === "ENCIRCLEMENT"`, encircled tiles barred as attack
  origins / decaying — see `apps/simulation/src/runtime-frontier-decay.ts` and
  `territory-automation.ts`) is conceptually adjacent and should be reconciled
  with the new local-support model rather than duplicated.

## 5. Open questions for the next explorer
1. **Support curve:** how much defense does each friendly settled neighbour add?
   Linear (0–4 neighbours)? Diminishing? Should it use 4-neighbour (matches
   `exposure.ts`) or 8-neighbour (matches `frontier-topology.ts`)? The codebase is
   split today — pick one and make combat + support + consolidation all use it.
2. **Auto-consolidation trigger:** what exactly counts as "fully enclosed"? All 4
   cardinal neighbours owned+settled? A flood-fill interior test? How fast does an
   enclosed tile consolidate, and does losing an edge tile instantly de-consolidate
   the pocket (the "wedge breaks support" moment)?
3. **Garrison vs. support interaction:** is garrison just additive on top of
   neighbour-support, or does support gate how fast garrison fills?
4. **Balance vs. the 0× frontier rule:** with auto-consolidation, do we still want
   raw FRONTIER tiles at 0× defense, or a small floor? Free-frontier capture is
   the current snowball engine.
5. **AI parity:** the AI settlement planner already reasons about
   `defensivelyCompact` / `exposedSides`
   (`apps/simulation/src/ai-settlement-priority.ts:171`,
   `automation-command-planner-helpers.ts`). Any new local-support model must feed
   the AI the same signal or AI defense will regress.
6. **Migration / display:** what replaces the defensibility readout in the client
   tech panel (`client-tech-panel-flow.ts`)? A compactness hint, a "weak tiles"
   count, nothing?
7. **Perf:** per-tile support recompute on every ownership change must stay cheap.
   The single tile-mutation chokepoint is
   `SimulationRuntime.replaceTileState()` (`apps/simulation/src/runtime.ts`,
   ~line 1539) — hook local-support invalidation there, and respect the AI CPU
   guardrails in `AGENTS.md` and `docs/game-mechanics.md` §13.

## 6. Reference map (open these first)
- `packages/shared/src/frontier-combat.ts` — the actual combat roll & tile defense multipliers.
- `packages/shared/src/math.ts` — `defensibilityScore`, `exposureWeightFromSides`, `combatWinChance`.
- `packages/shared/src/exposure.ts` — neighbour/wrap helpers, exposure recompute.
- `apps/simulation/src/player-defensibility-metrics.ts` — per-player T/E/score assembly.
- `packages/client/src/client-tech-panel-flow.ts` — the only place the % is shown.
- `apps/simulation/src/runtime-frontier-decay.ts`, `territory-automation.ts` — encirclement + auto-claim/settle helpers (`orderedAutoSettlementTileKeys`, `isAutoSettlementEligibleTarget`).
- `apps/simulation/src/ai-settlement-priority.ts` — AI's existing compactness/exposure reasoning.
- `docs/game-mechanics.md` — canonical mechanics reference (see §1 map, §13 perf).
- `docs/mustering-feature-story.md` — the muster/garrison model this defense rework must stay consistent with.
