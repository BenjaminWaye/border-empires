// docs/replenishment-update-plan.md D6: the commitment-choice UI lives on a
// muster flag's own tile menu, not a one-off "Launch Attack" dialog -- a
// MARCH flag already carries a persistent target (MusterState.targetX/Y,
// set via SET_MUSTER, the mechanism the future drag-arrow gesture upgrades
// rather than replaces), so this tab reads/writes that existing state
// instead of inventing new target-picking UI.
import { MUSTER_ATTACK_COST, commitOddsMultiplier, requiredMusterForFort } from "@border-empires/shared";
import { commitPreviewWinChanceForTarget } from "../client-queue-logic/client-attack-preview-logic.js";
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
  floor: number;
  cap: number;
  commitManpower: number;
  // Only present when an ATTACK_PREVIEW for this flag's origin->target pair
  // is already cached (see commitPreviewWinChanceForTarget) -- this view
  // builder is pure and doesn't itself trigger a preview fetch.
  winChancePercent?: number | undefined;
  // Win% at exactly 1x the floor (commitOddsMultiplier(floor, floor) === 1,
  // so this is the server's raw base_odds) -- lets the slider's own oninput
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
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): MusterCommitView | undefined => {
  const muster = tile.muster;
  if (!muster || muster.ownerId !== deps.me) return undefined;
  const hasTarget = muster.targetX != null && muster.targetY != null;
  const targetTile = hasTarget ? state.tiles.get(deps.keyFor(muster.targetX!, muster.targetY!)) : undefined;
  const floor =
    targetTile?.ownershipState === "SETTLED"
      ? requiredMusterForFort(targetTile.fort?.status === "active" ? targetTile.fort.variant : undefined)
      : MUSTER_ATTACK_COST;
  const cap = Math.max(floor, state.manpowerCap);
  const commitManpower = Math.min(cap, Math.max(floor, muster.commitManpower ?? floor));
  const winChance = targetTile ? commitPreviewWinChanceForTarget(state, targetTile, commitManpower, deps) : undefined;
  const baseWinChance = targetTile ? commitPreviewWinChanceForTarget(state, targetTile, floor, deps) : undefined;
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
