import type { AfcRecoveryState } from "@border-empires/shared";
import type { TileActionDef } from "../client-types.js";

/** Keep fabrication actions visible with the same explanation as the recovery popup. */
export function gateAfcConstructionActions(actions: TileActionDef[], recovery: AfcRecoveryState | undefined): TileActionDef[] {
  if (recovery?.requiredSince === undefined) return actions;
  return actions.map(action => action.id.startsWith("build_") && action.id !== "build_afc"
    ? { ...action, disabled: true, disabledReason: "Call down a new AFC to continue construction" }
    : action);
}
