// Split out of client-action-flow.ts (already over the repo's 500-line
// file-growth cap) so this file can grow independently.
//
// Pressing "Settle Land" on a neutral tile that is already mid-EXPAND
// (an active capture, or still waiting its turn in the action queue) can't
// dispatch a second EXPAND -- the server would reject it as a duplicate /
// locked target. Instead this queues an auto-settle: processAutoSettleTargets
// (the runtime loop's tick handler in client-action-flow.ts) fires the
// SETTLE automatically the moment the tile lands FRONTIER-owned.
import type { ClientState } from "../client-state/client-state.js";

export const queueSettleForExpandingTile = (
  state: ClientState,
  x: number,
  y: number,
  tileKey: string,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    showVisibleActionWarning: (title: string, message: string) => void;
    renderHud: () => void;
  }
): void => {
  if (state.autoSettleTargets.has(tileKey)) {
    deps.showVisibleActionWarning("Settle already queued", "Settling this tile is already queued -- it will fire automatically once the expansion completes.");
    return;
  }
  state.autoSettleTargets.add(tileKey);
  deps.pushFeed(`Queued settle at (${x}, ${y}) -- will fire once the expansion completes.`, "info", "info");
  deps.renderHud();
};
