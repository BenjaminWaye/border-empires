import { createInitialTownTierUpgradeFxState } from "../client-town-tier-upgrade-fx/client-town-tier-upgrade-fx.js";
import { createInitialWaystationOpenFxState } from "../client-waystation-holo-crates/holo-crate-open-fx.js";
import { createInitialAfcDeliveryState } from "./client-state-afc-delivery-defaults.js";
import { createInitialMusterCaptureLabelState } from "../client-muster-capture/client-muster-capture.js";

/**
 * One-shot 3D map effect queues (each drained by its layer's sync in
 * client-map-3d-fx-cast-overlays.ts) plus the AFC delivery and town
 * tier-upgrade growth state. Extracted out of client-state.ts (far over the
 * file-line cap) so new effect state doesn't grow that file.
 */
export const createInitialMapFxQueueState = () => ({
  imperialExchangeLevyFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  aegisLockFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  astralDockLaunchFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  // "unsettle" transition (SETTLED -> FRONTIER, same owner); see client-map-3d-unsettle-fx.ts
  unsettleFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  ...createInitialAfcDeliveryState(),
  // Town tier-upgrade growth; see client-town-tier-upgrade-fx/.
  ...createInitialTownTierUpgradeFxState(),
  // A collected waystation's 10 s opening, drawn by both renderers; see client-waystation-holo-crates/.
  ...createInitialWaystationOpenFxState(),
  // "+N / −N manpower" over a captured muster flag, drawn by both renderers; see client-muster-capture/.
  ...createInitialMusterCaptureLabelState()
});
