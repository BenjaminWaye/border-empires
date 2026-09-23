// Assembles what one turn hands the LLM: player status plus a human-scale
// view of the map (see viewport.ts) instead of the full known-tile array,
// which can run to thousands of entries for a large empire.
import type { EventLogEntry } from "./game-socket.js";
import {
  buildBeaconSites,
  buildMinimap,
  buildViewport,
  buildViewportFrontier,
  type BeaconSite,
  type CameraPosition,
  type FrontierTarget,
  type MinimapCell,
  type PlayerStatus,
  type TileIndex,
  type ViewportTile
} from "./viewport.js";

const MAX_RECENT_EVENTS = 8;

export type RecentEvent = { type: string; text: string; occurredAt: number; x?: number; y?: number };

export type TurnContext = {
  playerId: string;
  playerName: string;
  gold: number;
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  ownedTileCount: number;
  camera: CameraPosition;
  viewport: ViewportTile[];
  minimap: MinimapCell[];
  frontier: FrontierTarget[];
  beaconSites: BeaconSite[];
  recentEvents: RecentEvent[];
};

const toRecentEvent = (entry: EventLogEntry): RecentEvent => ({
  type: entry.type,
  text: entry.text,
  occurredAt: entry.occurredAt,
  ...(entry.x !== undefined ? { x: entry.x } : {}),
  ...(entry.y !== undefined ? { y: entry.y } : {})
});

export const summarizeTurn = (
  index: TileIndex,
  status: PlayerStatus,
  camera: CameraPosition,
  eventLog: EventLogEntry[]
): TurnContext => {
  let ownedTileCount = 0;
  for (const tile of index.values()) if (tile.ownerId === status.playerId) ownedTileCount += 1;

  const recentEvents = [...eventLog]
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, MAX_RECENT_EVENTS)
    .map(toRecentEvent);

  return {
    playerId: status.playerId,
    playerName: status.playerName,
    gold: status.gold,
    manpower: status.manpower,
    manpowerCap: status.manpowerCap,
    manpowerRegenPerMinute: status.manpowerRegenPerMinute,
    ownedTileCount,
    camera,
    viewport: buildViewport(index, camera),
    minimap: buildMinimap(index, camera),
    frontier: buildViewportFrontier(index, camera, status.playerId),
    beaconSites: buildBeaconSites(index, camera, status.playerId),
    recentEvents
  };
};
