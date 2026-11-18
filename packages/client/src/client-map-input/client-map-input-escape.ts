// Escape disarms every armed map pick and closes the tile menu.
import { cancelMarchOriginPicking } from "../client-march-origin-picking/client-march-origin-picking.js";
import { cancelScoutDronePicking } from "../client-scout-drone/client-scout-drone-picking.js";
import type { ClientState } from "../client-state/client-state.js";

export type EscapeDeps = {
  cancelOngoingCapture: () => void;
  hideTileActionMenu: () => void;
  clearCrystalTargeting: () => void;
  /** Also re-renders the HUD, which is what takes down the armed-targeting card. */
  cancelBuildingPlacement: () => void;
};

export const cancelArmedModesOnEscape = (state: Pick<ClientState, "marchOriginPicking" | "scoutDronePicking">, deps: EscapeDeps): void => {
  // Before cancelBuildingPlacement's HUD render, or the Send scout drone card stays up after Escape.
  cancelScoutDronePicking(state);
  deps.cancelOngoingCapture();
  deps.hideTileActionMenu();
  deps.clearCrystalTargeting();
  deps.cancelBuildingPlacement();
  if (state.marchOriginPicking.active) cancelMarchOriginPicking(state as ClientState);
};
