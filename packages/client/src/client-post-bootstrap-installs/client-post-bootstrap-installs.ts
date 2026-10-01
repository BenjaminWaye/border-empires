// End-of-bootstrap hooks that need the fully-assembled state + action flow but
// own no long-lived wiring of their own: the console debug helper for the
// season-end overlay, and the join-time auto-settle prompt. Lives here (not
// inline in client-bootstrap.ts) to keep that oversized file from growing.
import type { ClientState } from "../client-state/client-state.js";
import { installAutoSettleSettingsBinding } from "../client-auto-settle-prompt/client-auto-settle-settings-ui.js";
import { installAutoSettlePrompt } from "../client-auto-settle-prompt/client-auto-settle-prompt.js";
import { persistDevelopmentQueueForPlayer } from "../client-development-queue/client-development-queue.js";
import { installDebugSeasonEndOverlay } from "../client-debug-season-end-overlay/client-debug-season-end-overlay.js";

type PostBootstrapDeps = {
  state: ClientState;
  renderHud: () => void;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  pushFeed: Parameters<typeof installAutoSettlePrompt>[0]["pushFeed"];
};

export const installPostBootstrapHooks = ({ state, renderHud, sendGameMessage, pushFeed }: PostBootstrapDeps): void => {
  installDebugSeasonEndOverlay(state, renderHud);
  installAutoSettleSettingsBinding((payload) => sendGameMessage(payload, "Finish sign-in before changing auto-settle."));
  installAutoSettlePrompt({ state, sendGameMessage, pushFeed, persistDevelopmentQueue: persistDevelopmentQueueForPlayer });
};
