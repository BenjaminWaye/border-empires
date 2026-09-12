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
  // (writer) and client-battle-overlay.ts (reader, so a resolved battle can
  // continue the skirmish's own in-progress approach instead of restarting
  // or snapping straight to the clash oscillation).
  skirmishSeenAt: new Map<string, number>(),
  // Keyed by target tile key: the same `holdApproachUntilElapsed` a
  // defender's skirmish (client-map-3d-capture-overlays.ts) is currently
  // using to hold its approach plateau open past the default APPROACH_MS —
  // mirrored here so client-battle-overlay.ts's registerActiveBattleFromTileDelta
  // can compute the resolved battle's clashAt with the SAME approach length
  // the skirmish was actually showing, instead of always assuming the
  // default. Without this, a resolved battle for a held-open skirmish could
  // jump straight into the firefight/rout pose the instant it resolves,
  // instead of continuing whatever pose (still marching/holding) the
  // skirmish view was showing a frame earlier.
  skirmishHoldApproachMs: new Map<string, number>(),
  // Keyed by target tile key: the last nowMs a skirmish was actually pushed
  // for this tile. Backstops skirmishSeenAt/skirmishHoldApproachMs against
  // the attacker's own COMBAT_RESULT-vs-TILE_DELTA_BATCH race (see
  // SKIRMISH_SEEN_GRACE_MS in client-map-3d-capture-overlays.ts) — a
  // time-based grace window independent of whether capture/
  // incomingAttacksByTile still reference the tile.
  skirmishLastPushedAt: new Map<string, number>()
});
