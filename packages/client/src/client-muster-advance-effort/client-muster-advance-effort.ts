import { MUSTER_ATTACK_COST, commitOddsMultiplier } from "@border-empires/shared";
import { MUSTER_COMMIT_PRESET_MULTIPLIERS, musterCommitPresetAmount, type MusterCommitPreset } from "../client-muster-commit-tab/client-muster-commit-tab.js";
import { showEffortConfirmSheet } from "../client-effort-confirm-sheet/client-effort-confirm-sheet.js";

// Set Advance opens the same Normal / Extra / Double effort sheet March To
// and Launch Attack use (docs/replenishment-update-plan.md D6) before the
// flag switches to ADVANCE. An ADVANCE flag picks its own targets, each with
// its own floor, so the sheet is presets-only and the choice is sent as a
// commitment against the generic MUSTER_ATTACK_COST floor -- the simulation
// keeps that ratio for every target it attacks (advanceFlagCommitForTarget).

export type MusterAdvanceEffortDeps = {
  sendGameMessage: (payload: unknown) => boolean;
  /** Runs after SET_MUSTER is sent (e.g. the first-muster discovery tip). */
  onSent?: () => void;
};

/** The info line under the presets: what the chosen effort does to each auto-attack. */
export const describeAdvanceEffort = (preset: MusterCommitPreset | undefined): string => {
  const key = preset ?? "normal";
  const amount = musterCommitPresetAmount(key, MUSTER_ATTACK_COST);
  if (key === "normal") return `Each auto-attack commits just its target's floor (${amount} manpower on an unfortified tile).`;
  const odds = commitOddsMultiplier(amount, MUSTER_ATTACK_COST);
  return `Each auto-attack commits ${MUSTER_COMMIT_PRESET_MULTIPLIERS[key]}× its target's floor (${amount} manpower on an unfortified tile) · ×${odds} odds against defended tiles. The flag saves up for the full amount before attacking.`;
};

/**
 * Opens the effort sheet for switching the flag at (x, y) to ADVANCE. Falls
 * back to sending SET_MUSTER ADVANCE at the floor when no sheet can be shown
 * (no DOM), so the action never silently does nothing.
 */
export const promptMusterAdvanceEffort = (x: number, y: number, deps: MusterAdvanceEffortDeps): void => {
  const send = (commitManpower: number): void => {
    deps.sendGameMessage({ type: "SET_MUSTER", x, y, mode: "ADVANCE", commitManpower });
    deps.onSent?.();
  };
  const handle = showEffortConfirmSheet({
    title: `Advance from (${x}, ${y})`,
    subtitle: "Choose how much manpower each auto-attack commits — more effort improves the odds.",
    floor: MUSTER_ATTACK_COST,
    cap: MUSTER_ATTACK_COST * MUSTER_COMMIT_PRESET_MULTIPLIERS.double,
    mode: "presets",
    confirmLabel: "Advance",
    describe: (_commit, preset) => describeAdvanceEffort(preset),
    onConfirm: (_commit, preset) => send(musterCommitPresetAmount(preset ?? "normal", MUSTER_ATTACK_COST))
  });
  if (!handle) send(MUSTER_ATTACK_COST);
};
