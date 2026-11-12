// End-of-bootstrap hooks that need the fully-assembled state + action flow but
// own no long-lived wiring of their own: the console debug helper for the
// season-end overlay, the tile-menu auto-settle checkbox, the v2 desktop HUD (default on), and the one-time
// landmass naming prompt. Lives here (not
// inline in client-bootstrap.ts) to keep that oversized file from growing.
import { installAutoImproveOptionBinding } from "../client-hud-v2/client-resource-improvement-action.js";
import { isMapLoadingOverlayActive } from "../client-map-loading-view/client-map-loading-view.js";
import type { ClientState } from "../client-state/client-state.js";
import { installAutoSettleSettingsBinding } from "../client-auto-settle-prompt/client-auto-settle-settings-ui.js";
import { installAutoSettleTileOptionBinding } from "../client-auto-settle-prompt/client-auto-settle-tile-option.js";
import { installDiscoveryTipCenterBinding, type DiscoveryTipCenterDeps } from "../client-discovery-tips/client-discovery-tip-center.js";
import { installDebugSeasonEndOverlay } from "../client-debug-season-end-overlay/client-debug-season-end-overlay.js";
import { createLandmassNamePrompt } from "../client-map-name-labels/client-landmass-name-prompt.js";
import { installHudV2 } from "../client-hud-v2/client-hud-v2.js";
import type { HudV2ActionFlow } from "../client-hud-v2/client-hud-v2-context.js";
import { installDiplomacyOfferDock } from "../client-diplomacy-offer-dock/client-diplomacy-offer-dock.js";
import { installMarchInteraction } from "../client-march-interaction/client-march-interaction.js";
import { installSalvageTributeSheet } from "../client-salvage-tribute/client-salvage-tribute-sheet.js";

type PostBootstrapDeps = {
  state: ClientState;
  renderHud: () => void;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  setActivePanel: (panel: ClientState["activePanel"]) => void;
  actionFlow: HudV2ActionFlow;
  ownerColor: (ownerId: string) => string;
} & Pick<DiscoveryTipCenterDeps, "wrapX" | "wrapY" | "requestViewRefresh">;

export const installPostBootstrapHooks = ({ state, renderHud, sendGameMessage, setActivePanel, actionFlow, wrapX, wrapY, requestViewRefresh, ownerColor }: PostBootstrapDeps): void => {
  installDiscoveryTipCenterBinding({ state, wrapX, wrapY, requestViewRefresh, renderHud });
  installDebugSeasonEndOverlay(state, renderHud);
  installHudV2({ state, renderHud, requestViewRefresh, wrapX, wrapY, setActivePanel, sendGameMessage, actionFlow, ownerColor }); // the HUD, desktop and phone layouts
  installDiplomacyOfferDock({ state, sendGameMessage, isMapLoading: () => isMapLoadingOverlayActive(state) }); // incoming truce/alliance offers, answered in place
  // March To banner + pointer arrow, and dragging a march's destination (read by client-map-input.ts).
  installMarchInteraction({ state, renderHud, sendGameMessage: (payload) => sendGameMessage(payload, "Finish sign-in before changing a march.") });
  installSalvageTributeSheet(state, sendGameMessage); // lets the map's salvage toasts open the ship-salvage popup
  installAutoSettleSettingsBinding((payload) => sendGameMessage(payload, "Finish sign-in before changing auto-garrison."));
  installAutoSettleTileOptionBinding(state, (payload) => sendGameMessage(payload, "Finish sign-in before changing auto-garrison."));
  installAutoImproveOptionBinding(state, (payload) => sendGameMessage(payload, "Finish sign-in before changing auto-improve."));
  // One-time "name this landmass" prompt once the player garrisons a whole landmass (throttled inside).
  const landmassNamePrompt = createLandmassNamePrompt({ state, sendGameMessage });
  setInterval(() => landmassNamePrompt.tick(performance.now()), 1_000);
};
