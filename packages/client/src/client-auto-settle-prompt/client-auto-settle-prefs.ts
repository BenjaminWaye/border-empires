// Client mirror of the player's per-category auto-settle opt-in (server owns
// it: SET_AUTO_SETTLE_PREFS, shared auto-settle-prefs.ts). The server never
// spends manpower on a category the player hasn't opted into, and the client's
// own queue-fill from the server's candidate list must respect the same gate
// or it would settle on the player's behalf anyway.
import { isAutoSettleAllowedForTile, isAutoSettlePrefsValue, normalizeAutoSettlePrefs } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

/** Missing/malformed leaves the current value untouched (a PLAYER_UPDATE without the field must not reset it). */
export const applyAutoSettlePrefsFromServer = (state: Pick<ClientState, "autoSettle">, value: unknown): void => {
  if (isAutoSettlePrefsValue(value)) state.autoSettle = normalizeAutoSettlePrefs(value);
};

/** Undefined prefs (older server, pre-INIT) mean legacy behavior: allowed. */
export const isClientAutoSettleAllowedForTile = (state: Pick<ClientState, "autoSettle">, tile: Tile): boolean =>
  isAutoSettleAllowedForTile(state.autoSettle, tile);
