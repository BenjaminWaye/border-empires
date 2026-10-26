// End-of-bootstrap hooks that need the fully-assembled state + action flow but
// own no long-lived wiring of their own: the console debug helper for the
// season-end overlay, the tile-menu auto-settle checkbox, the flag-gated v2 HUD, and the one-time
// landmass naming prompt. Lives here (not
// inline in client-bootstrap.ts) to keep that oversized file from growing.
import type { ClientState } from "../client-state/client-state.js";
import { installAutoSettleSettingsBinding } from "../client-auto-settle-prompt/client-auto-settle-settings-ui.js";
import { installAutoSettleTileOptionBinding } from "../client-auto-settle-prompt/client-auto-settle-tile-option.js";
import { installDiscoveryTipCenterBinding, type DiscoveryTipCenterDeps } from "../client-discovery-tips/client-discovery-tip-center.js";
import { installDebugSeasonEndOverlay } from "../client-debug-season-end-overlay/client-debug-season-end-overlay.js";
import { createLandmassNamePrompt } from "../client-map-name-labels/client-landmass-name-prompt.js";
import { installHudV2 } from "../client-hud-v2/client-hud-v2.js";
import type { HudV2ActionFlow } from "../client-hud-v2/client-hud-v2-context.js";
import { isMobile } from "../client-panel-nav/client-panel-nav.js";

type PostBootstrapDeps = {
  state: ClientState;
  renderHud: () => void;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  actionFlow: HudV2ActionFlow;
  ownerColor: (ownerId: string) => string;
} & Pick<DiscoveryTipCenterDeps, "wrapX" | "wrapY" | "requestViewRefresh">;

export const installPostBootstrapHooks = ({ state, renderHud, sendGameMessage, actionFlow, wrapX, wrapY, requestViewRefresh, ownerColor }: PostBootstrapDeps): void => {
  installDiscoveryTipCenterBinding({ state, wrapX, wrapY, requestViewRefresh, renderHud });
  installDebugSeasonEndOverlay(state, renderHud);
  installHudV2({ state, renderHud, requestViewRefresh, wrapX, wrapY, isMobile, sendGameMessage, actionFlow, ownerColor }); // ?hud=v2 redesigned desktop HUD
  installAutoSettleSettingsBinding((payload) => sendGameMessage(payload, "Finish sign-in before changing auto-garrison."));
  installAutoSettleTileOptionBinding(state, (payload) => sendGameMessage(payload, "Finish sign-in before changing auto-garrison."));
  // One-time "name this landmass" prompt once the player garrisons a whole landmass (throttled inside).
  const landmassNamePrompt = createLandmassNamePrompt({ state, sendGameMessage });
  setInterval(() => landmassNamePrompt.tick(performance.now()), 1_000);
};
