// Split out of client-queue-logic.ts (already over the repo's 500-line
// file-growth cap) so this file can grow independently.
//
// Cancels a settle (and any dependent build) queued behind a tile's active
// action -- see autoSettleTargets/autoBuildTargets and
// processAutoSettleTargets in client-action-flow.ts.
import type { ClientState } from "../client-state/client-state.js";

export const cancelQueuedAutoSettle = (
  state: ClientState,
  tileKey: string,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
  }
): boolean => {
  if (!state.autoSettleTargets.has(tileKey)) return false;
  state.autoSettleTargets.delete(tileKey);
  state.autoBuildTargets.delete(tileKey);
  deps.pushFeed(`Queued settle at ${tileKey} cancelled.`, "combat", "info");
  deps.renderHud();
  return true;
};
