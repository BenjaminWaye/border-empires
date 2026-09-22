// Assembles what one turn hands the LLM: player status plus a human-scale
// view of the map (see viewport.ts) instead of the full known-tile array,
// which can run to thousands of entries for a large empire.
import {
  buildMinimap,
  buildViewport,
  buildViewportFrontier,
  type CameraPosition,
  type FrontierTarget,
  type MinimapCell,
  type PlayerStatus,
  type TileIndex,
  type ViewportTile
} from "./viewport.js";

export type TurnContext = {
  playerId: string;
  playerName: string;
  gold: number;
  manpower: number;
  ownedTileCount: number;
  camera: CameraPosition;
  viewport: ViewportTile[];
  minimap: MinimapCell[];
  frontier: FrontierTarget[];
};

export const summarizeTurn = (index: TileIndex, status: PlayerStatus, camera: CameraPosition): TurnContext => {
  let ownedTileCount = 0;
  for (const tile of index.values()) if (tile.ownerId === status.playerId) ownedTileCount += 1;

  return {
    playerId: status.playerId,
    playerName: status.playerName,
    gold: status.gold,
    manpower: status.manpower,
    ownedTileCount,
    camera,
    viewport: buildViewport(index, camera),
    minimap: buildMinimap(index, camera),
    frontier: buildViewportFrontier(index, camera, status.playerId)
  };
};
