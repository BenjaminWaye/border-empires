import type { ClientState } from "./client-state/client-state.js";

// True only for a tile the player's own in-flight EXPAND capture is about to
// hand them ownership of — never for an ATTACK capture (target is already
// enemy-owned territory, not a pending acquisition) or a muster-fed attack.
export const isPendingExpansionTarget = (state: Pick<ClientState, "capture">, x: number, y: number): boolean =>
  Boolean(state.capture && state.capture.actionType === "EXPAND" && state.capture.target.x === x && state.capture.target.y === y);
