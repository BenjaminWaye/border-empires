import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { startAttackPreviewKeepaliveTicker } from "../client-attack-preview-keepalive-ticker/client-attack-preview-keepalive-ticker.js";
import { startMusterWatchKeepaliveTicker } from "../client-muster-watch-keepalive-ticker/client-muster-watch-keepalive-ticker.js";

/**
 * Starts the per-second/few-second HUD keepalive tickers that re-request or
 * re-assert something the currently open tile menu depends on -- pulled out
 * of client-bootstrap.ts (already over the file line-limit) so it stays a
 * single call site instead of growing the bootstrap file further.
 */
export const startBootstrapKeepaliveTickers = (
  state: ClientState,
  actionFlow: {
    isTileOwnedByAlly: (tile: Tile) => boolean;
    attackPreviewIsStaleForTarget: (tile: Tile) => boolean;
    requestAttackPreviewForTarget: (tile: Tile) => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): void => {
  startAttackPreviewKeepaliveTicker(state, {
    isTileOwnedByAlly: actionFlow.isTileOwnedByAlly,
    attackPreviewIsStaleForTarget: actionFlow.attackPreviewIsStaleForTarget,
    requestAttackPreviewForTarget: actionFlow.requestAttackPreviewForTarget
  });
  startMusterWatchKeepaliveTicker(state, { sendGameMessage: actionFlow.sendGameMessage });
};
