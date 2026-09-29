import type { WorldEngineStrikeHistoryRecord } from "../client-world-engine-strike-history/client-world-engine-strike-history.js";

/**
 * World Engine strike FX/announcement state. Extracted out of client-state.ts
 * (already over the file-line cap) so new fields don't grow that file.
 */
export const createInitialWorldEngineStrikeState = () => ({
  worldEngineStrikeFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  // Drives the global camera-shake trigger (client-map-3d-camera-shake-fx.ts) —
  // pushed once per newly-seen WORLD_ENGINE_STRIKE_ANNOUNCEMENT broadcast, for
  // every connected client (not just the caster/target), never replayed from
  // 12h history so it only ever fires live, once, at the moment of the strike.
  worldEngineStrikeShakeQueue: [] as Array<{ strikeId: string; queuedAt: number }>,
  // strikeId dedup set shared by the live broadcast handler and the 12h
  // history backfill, so a strike already seen live isn't replayed as a
  // toast/popup/shake when history is fetched on reconnect.
  worldEngineStrikeSeenIds: new Set<string>(),
  // Most-recent-first, capped list backing the Activity Feed's world-events
  // history section — populated both live and from the 12h history fetch.
  worldEngineStrikeAnnouncements: [] as WorldEngineStrikeHistoryRecord[]
});
