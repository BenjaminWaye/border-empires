import {
  buildFrontierCombatPreview,
  commitOddsMultiplier,
  type FrontierCombatModifiers,
  type FrontierCombatPreviewTile
} from "./frontier-combat.js";

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
  const winChance = Math.max(0, Math.min(1, preview.winChance * oddsMult));
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
