# AI War / Peace / Growth Balance Plan

Status: **plan, not yet implemented.** Phases are independently shippable; Phase 1
is the one that matters most.

## Why this exists

Production, 2026-09-01: barbarians were taking ~61 tiles/day off `ai-3` and ~40 off
`ai-2` while both AIs sat on `WAIT` doing nothing. Live diagnostics
(`/admin/debug/ai/decisions`, see `docs/AI_DEBUGGING.md`) showed every decision class
vetoed, `canAttack: false`, and single-digit manpower on empires holding 469-795 tiles.

The AI was not *choosing* not to fight. It structurally could not.

## Root cause

`runtime.ts`'s automation affordability gate:

```ts
canAttack: ... (player?.manpower ?? 0) >= ATTACK_MANPOWER_MIN,   // 60
canExpand: ... (player?.manpower ?? 0) >= EXPAND_MANPOWER_COST,  // 10
```

`EXPAND` unlocks at 10 manpower; `ATTACK` needs 60. Every 10 manpower that regenerates
is immediately spent on another frontier tile, so the pool **can never climb to 60**.
Slow regen compounds it — `TOWN_MANPOWER_BY_TIER` (config.ts) gives a SETTLEMENT
0.208/min and a TOWN 0.417/min, so refilling 100 manpower takes roughly 2-8 hours for a
small-to-mid empire.

Two independent aggravating bugs sit on top:

1. **Every threat gate is blind to barbarians.** `frontierEnemyTargetCount` counts enemy
   *players* only. It drives `scoreBuildDefense`'s veto (decisions.ts), and
   `pressureThreatensCore` / `underThreat` / `threatCritical`
   (automation-strategic-snapshot.ts). A barbarian horde eating a border produces
   `underThreat: false`, so `requiredAttackManpower` never drops to its
   "desperate gamble" floor and the AI never forts up.
2. **Stale hot-frontier index starves the scan.** `baseFrontierOrigins`
   (automation-command-planner.ts) commits to `hotFrontierTiles` whenever that list is
   non-empty. Observed live on `ai-3`: `hotFrontierTileCountInput: 1` with that tile
   re-checking as `currentlyHot: false, reason: "none"`, yielding
   `neighborCandidateTotal: 0` across a 694-tile frontier — the AI saw *nothing at all*.
   This is the same failure the file's own comment describes being fixed one tier down
   (strategic tier starving the scan); it has recurred one tier up. Tracked separately
   from this plan.

## Research basis

- Our scoring architecture is already [Dave Mark's Infinite Axis Utility
  System](https://www.gameai.com/iaus.php) — considerations normalized to [0,1],
  multiplied, with compensation. No rewrite is warranted; the fixes below are scoring
  and gating changes.
- Oscillation between postures is the dominant failure mode in this class of system.
  The standard remedy is **hysteresis**: asymmetric enter/exit thresholds so a state
  latches rather than flickering at a boundary.
- Civilization's war-weariness AI is the closest published analogue. Its documented
  failure modes (AI refusing peace while passive; weariness not accruing on home turf)
  argue for keying disengagement on the **exchange ratio**, not elapsed time alone.

## Settled design decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Reserve is `min(100, manpowerCap * 0.4)`, not a flat 100 | Live spread is extreme: `ai-5` holds 1470 manpower, `ai-4` holds 0.2. A flat 100 floor would permanently freeze a small empire that can neither expand nor ever reach the reserve. |
| 2 | Barbarians get **DISENGAGE**, players get real truces | Truces are a gateway social feature between real players; `social-state.ts` hard-rejects any target whose id starts with `barbarian`. There is no counterparty to negotiate with, so the barbarian equivalent must be AI-side only. |
| 3 | War mode suppresses economy via the reserve itself, not a second veto | Economic structures cost 80-400 manpower (`MINTWORKS` 150, `FARMSTEAD` 80). A 40%-of-cap reserve already makes them unaffordable during war — one mechanism achieves the intended near-hard veto. |

## Phase 1 — Manpower war reserve

The high-value fix. Ship and observe this alone before layering the rest.

Add to `packages/shared/src/config.ts`:

```ts
export const AI_WAR_RESERVE_MANPOWER_MAX = 100;
export const AI_WAR_RESERVE_CAP_FRACTION = 0.4;
```

Reserve is `min(AI_WAR_RESERVE_MANPOWER_MAX, manpowerCap * AI_WAR_RESERVE_CAP_FRACTION)`,
applied to AI actors only (`isAi`), gating **spending** and never attacking:

- `canExpand` requires `manpower >= EXPAND_MANPOWER_COST + reserve`
- `SETTLE` and structure builds gated the same way
- `canAttack` stays at `ATTACK_MANPOWER_MIN` — the reserve exists *to be spent* attacking
- Auto-claim tick raises `claimManpowerFloor` from `AI_AUTO_CLAIM_MANPOWER_RESERVE` (20)
  to the war reserve. This is the same proven pattern at a larger number, and the
  existing reserve constant's doc comment already explains why the floor is necessary.

Because economy structures cost 80-400 manpower, this single change also delivers the
Phase 3 economy suppression during war.

### Validation gate

This changes AI spending behavior on a live ~2000-tile world. Per
`docs/agents/deploys.md`, run the prod-shape gate against a cloned prod database, not
just fresh staging — accumulated-state behavior is precisely what this touches, and a
tick-frequency change validated only on fresh staging has caused a prod outage before.

## Phase 2 — Threat detection that sees barbarians

Introduce `landConnectedBarbarianCount`, distinct from ocean-separated barbarians.

Implementation uses existing machinery, no flood-fill required: the frontier scan
already merges land neighbors and dock crossings, and `targetRequiresDockCrossing()`
already distinguishes them. A land-connected barbarian is a barbarian target where
`!targetRequiresDockCrossing(selection)`.

Feed a combined `threatCount` (enemy players + land-connected barbarians) into:

- `scoreBuildDefense`'s `frontierEnemyCount > 0` veto, and the matching execution gate
  in `utility-dispatch.ts` — so barbarian pressure can trigger fort building
- `pressureThreatensCore` / `underThreat` / `threatCritical`
- `scoreBuildBeacon`'s `frontierEnemyCount === 0` veto

Per `docs/agents/ai-guardrails.md`, emit a counter for the new gate so a rule that never
fires is detectable.

## Phase 3 — WAR focus posture

Extend `AutomationFrontPosture` (`BREAK | CONTAIN | TRUCE`) with a latched war mode.
While a land-connected threat exists:

- `EXPAND` permitted **only** toward the threat, or beacons extending reach toward it
- `ATTACK` and `BUILD_DEFENSE` boosted
- Economy suppressed — already achieved by Phase 1's reserve

**Hysteresis is mandatory here.** Enter WAR at >= 1 land-connected threat tile; exit only
at 0 threat tiles sustained for N consecutive ticks. Without asymmetric thresholds the
posture flickers every time a barbarian tile changes hands, which on current production
numbers is dozens of times per day.

## Phase 4 — DISENGAGE and truces

Track `warStartedAt` per player. Latch DISENGAGE when a war exceeds 24h **and** the
exchange ratio is losing. Time alone is the wrong trigger — per the Civ research, real
peace logic keys off whether trades are going badly. `ai-3` at -26 net across 61 flips
is the signal to disengage; 61 flips while winning is not.

DISENGAGE behavior: stop attacking, hold territory, rebuild to full reserve, time-boxed,
then re-evaluate and re-engage.

For **player** wars, additionally fire the existing `requestTruce` path — that machinery
works and needs no new plumbing. For barbarians, DISENGAGE is the entire mechanism.

## Testing

Every phase needs regression tests per `AGENTS.md`. These are pure-function scoring and
gating changes, so they unit-test cleanly beside their modules. Phase 1 additionally
needs the prod-shape gate described above.

Verify behavior change live through `/admin/debug/ai/decisions` (`gates`,
`frontierState`, `noCommandReason`) and `sim_ai_command_total` by type, not by reading
the code and assuming.
