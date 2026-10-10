// End-of-bootstrap hooks that need the fully-assembled state + action flow but
// own no long-lived wiring of their own: the console debug helper for the
// season-end overlay, and the tile-menu auto-settle checkbox. Lives here (not
// inline in client-bootstrap.ts) to keep that oversized file from growing.
import type { ClientState } from "../client-state/client-state.js";
import { installAutoSettleSettingsBinding } from "../client-auto-settle-prompt/client-auto-settle-settings-ui.js";
import { installAutoSettleTileOptionBinding } from "../client-auto-settle-prompt/client-auto-settle-tile-option.js";
import { installDebugSeasonEndOverlay } from "../client-debug-season-end-overlay/client-debug-season-end-overlay.js";

type PostBootstrapDeps = {
  state: ClientState;
  renderHud: () => void;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
};

export const installPostBootstrapHooks = ({ state, renderHud, sendGameMessage }: PostBootstrapDeps): void => {
  installDebugSeasonEndOverlay(state, renderHud);
  installAutoSettleSettingsBinding((payload) => sendGameMessage(payload, "Finish sign-in before changing auto-annex."));
  installAutoSettleTileOptionBinding(state, (payload) => sendGameMessage(payload, "Finish sign-in before changing auto-annex."));
};
