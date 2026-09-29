import {
  buildFrontierCombatPreview,
  commitOddsMultiplier,
  shieldDefenseMultiplier,
  type FrontierCombatModifiers,
  type FrontierCombatPreviewTile
} from "./frontier-combat.js";
import { SHIELD_RADIUS_TILES } from "../config.js";
import { chebyshevWithWrap } from "../reach/reach-geometry.js";

// Workstream F0 (docs/replenishment-update-plan.md): renderer-agnostic
// win-chance-for-tile helper for the win-chance map paint feature. Plain
// data in (target tile shape + attacker modifiers + committed manpower),
// plain data out (a clamped [0,1] number and a paint color) — deliberately
// has no Three.js/DOM/canvas dependency so both the 3D overlay (this phase)
// and a future 2D canvas wiring (F4) can call the exact same function.
//
// Reuses buildFrontierCombatPreview (full modifier stack: infra, siege,
// fort, tech) for the base win chance, then applies commitOddsMultiplier
// (docs D6: odds = (commit/base)^2 * base_odds) exactly the way
// runtime-combat-support.ts's server-side resolveAttackCombat does, so this
// paint never drifts from the real resolve-time math.

export type WinChanceAttackerContext = {
  modifiers?: FrontierCombatModifiers;
  // Manpower this attack would commit against the target; defaults to the
  // target's base muster-cost floor (commitOddsMultiplier === 1, i.e. no
  // boost/penalty from over/under-committing) when omitted.
  committedManpower?: number;
  // Base muster-cost for the target (requiredMusterForFort et al) — the
  // `base` half of commitOddsMultiplier's ratio. Defaults to 1 (a
  // uncommitted-amount default of 1 also becomes a no-op ratio of 1) when
  // omitted, since not every caller has resolved this yet (see the client
  // trigger module, which currently defaults both).
  baseMusterCost?: number;
  // Workstream F3 (docs/replenishment-update-plan.md): manpower of a shield
  // flag KNOWN to cover the target (see findKnownShieldAmount below) --
  // already resolved by the caller to "largest matching known flag", same
  // shape findShieldForDefender uses server-side. Absent/0 means no known
  // shield, i.e. today's F0/F1/F2 behavior unchanged.
  knownShieldAmount?: number;
};

// Workstream F3: the client-knowable subset of a defender's muster flag --
// deliberately NOT the server's full MusterState (no inFlight/rate/etc, and
// crucially the client only ever HAS this shape for a tile it currently sees
// live or that a one-shot shield-reveal (CombatBroadcastPayload.shield,
// runtime-lock-resolution-shield-reveal.ts) forced visible -- there is no
// omniscient prediction of a hidden defender's shield here, only whatever the
// server already sent the client through fog-of-war/reveal, same as any
// other visible tile's muster state.
export type KnownShieldFlag = {
  x: number;
  y: number;
  ownerId: string;
  mode: "HOLD" | "ADVANCE" | "MARCH";
  amount: number;
};

/**
 * Mirrors findShieldForDefender's matching rule (runtime-shield-flags.ts)
 * over whatever flags the client currently knows about: a HOLD-mode flag
 * shields every tile within SHIELD_RADIUS_TILES of itself; any flag (any
 * mode) shields its own tile. When several known flags could shield the
 * same target, the largest amount wins (shields don't stack). Returns 0 (no
 * shield) when the target has no owner, or ownerId doesn't match any known
 * flag's owner -- a flag never shields a tile it doesn't own.
 */
export const findKnownShieldAmount = (
  targetX: number,
  targetY: number,
  targetOwnerId: string | undefined,
  knownFlags: Iterable<KnownShieldFlag>
): number => {
  if (!targetOwnerId) return 0;
  let best = 0;
  for (const flag of knownFlags) {
    if (flag.ownerId !== targetOwnerId || flag.amount <= 0) continue;
    const isSelfShield = flag.x === targetX && flag.y === targetY;
    const isAreaShield = flag.mode === "HOLD" && chebyshevWithWrap(flag.x, flag.y, targetX, targetY) <= SHIELD_RADIUS_TILES;
    if (!isSelfShield && !isAreaShield) continue;
    if (flag.amount > best) best = flag.amount;
  }
  return best;
};

export type WinChanceResult = {
  winChance: number; // clamped to [0, 1]
  color: string; // "#rrggbb", red (low) -> yellow -> green (high)
};

/** Pure win-chance-for-tile: wraps buildFrontierCombatPreview + commitOddsMultiplier for a candidate attack target. Renderer-agnostic — no rendering deps. */
export const winChanceForTile = (
  target: FrontierCombatPreviewTile,
  attacker: WinChanceAttackerContext = {}
): WinChanceResult => {
  const preview = buildFrontierCombatPreview(target, attacker.modifiers);
  const base = attacker.baseMusterCost ?? 1;
  const committed = attacker.committedManpower ?? base;
  const oddsMult = commitOddsMultiplier(committed, base);
  // F3: a known shield divides into the attacker's odds, mirroring
  // resolveAttackCombat's own math (frontier-combat.ts's shieldDefenseMultiplier
  // doc comment) -- never multiplied in.
  const shieldMult = shieldDefenseMultiplier(attacker.knownShieldAmount ?? 0, base);
  const winChance = Math.max(0, Math.min(1, (preview.winChance * oddsMult) / shieldMult));
  return { winChance, color: winChanceColor(winChance) };
};

// Red (0%) -> amber (50%) -> green (100%), interpolated in two linear halves
// so the midpoint reads as a clear "coin flip" amber rather than a muddy
// brown (naive red<->green lerp would pass through olive/brown at 0.5).
export const winChanceColor = (winChance: number): string => {
  const t = Math.max(0, Math.min(1, winChance));
  const lerp = (a: number, b: number, f: number): number => Math.round(a + (b - a) * f);
  const stops: [number, [number, number, number]][] = [
    [0, [214, 61, 61]], // red
    [0.5, [230, 184, 60]], // amber
    [1, [61, 214, 110]] // green
  ];
  let lo = stops[0]!, hi = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i]![0] && t <= stops[i + 1]![0]) { lo = stops[i]!; hi = stops[i + 1]!; break; }
  }
  const span = hi[0] - lo[0] || 1;
  const f = (t - lo[0]) / span;
  const [r, g, b] = [
    lerp(lo[1][0], hi[1][0], f),
    lerp(lo[1][1], hi[1][1], f),
    lerp(lo[1][2], hi[1][2], f)
  ];
  const hex = (n: number): string => n.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};
