import { attackFloorForPlayer } from "../client-attack-commit/client-attack-floor.js";
// docs/replenishment-update-plan.md D6: the commitment-choice UI lives on a
// muster flag's own tile menu, not a one-off "Launch Attack" dialog -- a
// MARCH flag already carries a persistent target (MusterState.targetX/Y,
// set via SET_MUSTER, the mechanism the future drag-arrow gesture upgrades
// rather than replaces), so this tab reads/writes that existing state
// instead of inventing new target-picking UI.
import { ADVANCE_MAX_EFFORT_MULTIPLIER, MUSTER_ATTACK_COST, applyOddsScale, commitOddsMultiplier, flagCommitForTarget, requiredMusterForFort } from "@border-empires/shared";
import { commitPreviewWinChanceForTarget } from "../client-queue-logic/client-attack-preview-logic.js";
import { estimateTileWinChance } from "../client-win-chance-paint-trigger.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

export type MusterCommitPreset = "normal" | "extra" | "double";

// "we had better wording" -- normal / extra / double, per
// docs/replenishment-update-plan.md's own "effort level (normal / extra /
// double)" phrasing for this same slider.
export const MUSTER_COMMIT_PRESET_MULTIPLIERS: Record<MusterCommitPreset, number> = {
  normal: 1,
  extra: 1.5,
  double: 2
};

const MUSTER_COMMIT_PRESET_LABELS: Record<MusterCommitPreset, string> = {
  normal: "Normal",
  extra: "Extra",
  double: "Double"
};

export const musterCommitPresetAmount = (preset: MusterCommitPreset, floor: number): number =>
  Math.ceil(floor * MUSTER_COMMIT_PRESET_MULTIPLIERS[preset]);

/** An ADVANCE flag has no single target: its commitment is a ratio over the floor, applied to whichever tile each auto-attack picks. */
export const advanceCommitOddsText = (commitManpower: number, floor: number): string =>
  `×${Math.round(commitOddsMultiplier(commitManpower, floor) * 100) / 100} odds on each auto-attack (scaled to each target's floor)`;

export type MusterCommitView = {
  mode: "HOLD" | "ADVANCE" | "MARCH";
  hasTarget: boolean;
  targetX?: number | undefined;
  targetY?: number | undefined;
  // Slider bounds: min is the target's (or, with no target set yet, the
  // generic MUSTER_ATTACK_COST) required floor; max is the player's whole
  // manpower cap -- "up to your entire pool if you have it", not capped by
  // whatever's currently mustered on this one flag (that affordability
  // check happens server-side, INSUFFICIENT_MUSTER, same as a manual attack).
  // An ADVANCE flag's value is an effort ratio over the floor, so its max is
  // Double (ADVANCE_MAX_EFFORT_MULTIPLIER), the most the server applies.
  floor: number;
  cap: number;
  commitManpower: number;
  // From the cached ATTACK_PREVIEW for this flag's origin->target pair when
  // there is one (see commitPreviewWinChanceForTarget), else the client-side
  // estimate the march arrow's labels use (estimateTileWinChance) -- this
  // view builder is pure and doesn't itself trigger a preview fetch. Absent
  // when the target isn't enemy-held.
  winChancePercent?: number | undefined;
  // Win% at exactly 1x the floor (commitOddsMultiplier(floor, floor) === 1,
  // so the server's raw base_odds, or the estimate's) -- lets the slider's own oninput
  // handler recompute the displayed % at any dragged value client-side
  // (base * commitOddsMultiplier(value, floor)) without a full tile-menu
  // re-render or another round trip per tick.
  baseWinChancePercent?: number | undefined;
  presets: Array<{ key: MusterCommitPreset; label: string; amount: number }>;
};

export const buildMusterCommitView = (
  tile: Tile,
  state: ClientState,
  deps: {
    me: string;
    keyFor: (x: number, y: number) => string;
  }
): MusterCommitView | undefined => {
  const muster = tile.muster;
  if (!muster || muster.ownerId !== deps.me) return undefined;
  const hasTarget = muster.targetX != null && muster.targetY != null;
  const targetTile = hasTarget ? state.tiles.get(deps.keyFor(muster.targetX!, muster.targetY!)) : undefined;
  const floor =
    targetTile?.ownershipState === "SETTLED"
      ? attackFloorForPlayer(state, targetTile)
      : MUSTER_ATTACK_COST;
  const cap = muster.mode === "ADVANCE" ? floor * ADVANCE_MAX_EFFORT_MULTIPLIER : Math.max(floor, state.manpowerCap);
  const commitManpower = Math.min(cap, Math.max(floor, muster.commitManpower ?? floor));
  // Force the origin to THIS flag's own tile rather than delegating to
  // deps.pickOriginForTarget's general nearest-owned-origin heuristic, which
  // exists for manual-attack hover/click and can resolve to a different
  // owned tile than the one this commit tab is actually about -- that would
  // look up the wrong ATTACK_PREVIEW cache key (a different fromKey) and
  // silently show no odds (or someone else's) instead of this flag's.
  const previewDeps = { keyFor: deps.keyFor, pickOriginForTarget: () => tile };
  // Score what the flag will actually send: a held tile gets the commitment
  // scaled to its own floor (flagCommitForTarget), same as the server.
  const sentCommit = (amount: number): number => flagCommitForTarget(targetTile, amount, Date.now()) ?? amount;
  const previewWinChance = targetTile ? commitPreviewWinChanceForTarget(state, targetTile, sentCommit(commitManpower), previewDeps) : undefined;
  const previewBaseWinChance = targetTile ? commitPreviewWinChanceForTarget(state, targetTile, sentCommit(floor), previewDeps) : undefined;
  // No ATTACK_PREVIEW cached for this pair (the common case for a march
  // target that doesn't border us yet): fall back to the client-side
  // estimate the march arrow's labels use, so the slider still shows odds.
  // Estimated once at the floor and scaled, as the slider's oninput does.
  const usePreview = previewWinChance != null && previewBaseWinChance != null;
  const baseWinChance = usePreview
    ? previewBaseWinChance
    : targetTile?.ownerId && targetTile.ownerId !== deps.me
      ? estimateTileWinChance(state, targetTile, { committedManpower: floor, baseMusterCost: floor })
      : undefined;
  const winChance = usePreview
    ? previewWinChance
    : baseWinChance != null
      ? applyOddsScale(baseWinChance, commitOddsMultiplier(commitManpower, floor))
      : undefined;
  return {
    mode: muster.mode,
    hasTarget,
    ...(muster.targetX != null ? { targetX: muster.targetX } : {}),
    ...(muster.targetY != null ? { targetY: muster.targetY } : {}),
    floor,
    cap,
    commitManpower,
    ...(winChance != null ? { winChancePercent: Math.round(winChance * 100) } : {}),
    ...(baseWinChance != null ? { baseWinChancePercent: Math.round(baseWinChance * 100) } : {}),
    presets: (Object.keys(MUSTER_COMMIT_PRESET_MULTIPLIERS) as MusterCommitPreset[]).map((key) => ({
      key,
      label: MUSTER_COMMIT_PRESET_LABELS[key],
      amount: Math.min(cap, musterCommitPresetAmount(key, floor))
    }))
  };
};

// Re-exported so the tab's live-preview text (updated on slider drag,
// without a full tile-menu re-render -- see client-tile-action-menu-ui.ts)
// can recompute win% at an arbitrary commit value using the same formula
// buildMusterCommitView used for its initial value, without re-deriving it.
export { commitOddsMultiplier, requiredMusterForFort };
