// Client mirror of the player's per-category auto-settle opt-in (server owns
// it: SET_AUTO_SETTLE_PREFS, shared auto-settle-prefs.ts). The server never
// spends manpower on a category the player hasn't opted into, and the client's
// own queue-fill from the server's candidate list must respect the same gate
// or it would settle on the player's behalf anyway.
import { isAutoSettleAllowedForTile, isAutoSettlePrefsValue, normalizeAutoSettlePrefs, type AutoSettlePrefs } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

/** "unloaded" until INIT/PLAYER_UPDATE delivers the value (or forever on an older server that never sends it). */
export type ClientAutoSettleState = { status: "unloaded" } | { status: "loaded"; prefs: AutoSettlePrefs };

export const UNLOADED_AUTO_SETTLE_STATE: ClientAutoSettleState = { status: "unloaded" };

export const loadedAutoSettleState = (prefs: AutoSettlePrefs): ClientAutoSettleState => ({ status: "loaded", prefs });

/** Missing/malformed leaves the current value untouched (a PLAYER_UPDATE without the field must not reset it). */
export const applyAutoSettlePrefsFromServer = (state: { autoSettle: ClientAutoSettleState }, value: unknown): void => {
  if (isAutoSettlePrefsValue(value)) state.autoSettle = loadedAutoSettleState(normalizeAutoSettlePrefs(value));
};

/** Not loaded yet means nothing is allowed: never settle on the player's behalf without knowing their choice. */
export const isClientAutoSettleAllowedForTile = (state: { autoSettle: ClientAutoSettleState }, tile: Tile): boolean =>
  state.autoSettle.status === "loaded" && isAutoSettleAllowedForTile(state.autoSettle.prefs, tile);
