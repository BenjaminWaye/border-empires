import type { ActiveBattleOverlay } from "../client-battle-overlay/client-battle-overlay.js";

// Server-resolved battle overlays keyed by target tile key. Populated from
// the combat-broadcast payload riding TILE_DELTA_BATCH deltas (see
// client-battle-overlay.ts) and consumed by client-map-3d-popup-marine/popup-marine-overlay-fx.ts.
// Independent of `capture` (which only ever tracks this client's own
// in-flight action for the HUD) so any number of battles — including ones
// this player isn't a party to — can animate concurrently.
export const createInitialBattleOverlayState = () => ({
  activeBattles: new Map<string, ActiveBattleOverlay>(),
  // Keyed by target tile key: when this client first rendered a pre-
  // resolution skirmish there (performance.now()-scale), NOT the siege's
  // actual server-side start time — see client-map-3d-capture-overlays.ts
  // (writer) and client-battle-overlay.ts (reader). Only used for the
  // informational `fromSkirmish` flag now — the resolved battle no longer
  // inherits this timestamp for positioning; see registerActiveBattleFromTileDelta's
  // own comment for why (it always starts already standing at the firing
  // line instead).
  skirmishSeenAt: new Map<string, number>()
});
