import { tilePlayerLosses, hasCompleteSeasonTileHistory } from "../deadliest-tiles/season-tile-player-losses.js";
import type { SeasonStats } from "@border-empires/sim-protocol";
import type { RuntimeExportState } from "../runtime-state-export.js";
import { isRoadTown, longestRoadFrom, type RoadTile } from "../longest-road/longest-road-core.js";

type NamedPlayers = ReadonlyArray<{ id: string; name?: string }>;

export const findMostDeadlyTile = (manpowerLossByTileKey: Map<string, number>, players: NamedPlayers = []): SeasonStats["mostDeadlyTile"] => {
  let best: { key: string; manpowerLost: number } | undefined;
  for (const [key, manpowerLost] of manpowerLossByTileKey) {
    if (!best || manpowerLost > best.manpowerLost) {
      best = { key, manpowerLost };
    }
  }
  if (!best) return undefined;
  const coords = best.key.split(",").map(Number);
  const losses = tilePlayerLosses(manpowerLossByTileKey, best.key);
  const attributedTotal = losses.reduce((sum, loss) => sum + loss.manpowerLost, 0);
  // Never crown a player from a partial history (old saves or a capacity hit).
  const complete = hasCompleteSeasonTileHistory(manpowerLossByTileKey, best.key) && Math.abs(attributedTotal - best.manpowerLost) < 0.000001;
  const leading = complete ? losses.sort((a, b) => b.manpowerLost - a.manpowerLost || a.playerId.localeCompare(b.playerId))[0] : undefined;
  return { x: coords[0]!, y: coords[1]!, manpowerLost: Math.round(best.manpowerLost),
    ...(leading ? { mostLossesPlayer: {
      playerId: leading.playerId,
      playerName: players.find((player) => player.id === leading.playerId)?.name ?? leading.playerId,
      manpowerLost: Math.round(leading.manpowerLost)
    } } : {}) };

};

export const computeLongestRoad = (tiles: RuntimeExportState["tiles"], players: NamedPlayers = []): SeasonStats["longestRoad"] => {
  const tileMap = new Map<string, RoadTile>();
  // Empires in the order their first road town appears, as the record always ran.
  const empires = new Map<string, { ownerId: string; landKeys: string[]; townKeys: string[] }>();
  const landByOwner = new Map<string, string[]>();
  for (const tile of tiles) {
    const key = `${tile.x},${tile.y}`;
    const roadTile: RoadTile = { x: tile.x, y: tile.y, terrain: tile.terrain, ownerId: tile.ownerId, ownershipState: tile.ownershipState, townTier: tile.townPopulationTier, townName: tile.townName };
    tileMap.set(key, roadTile);
    if (!tile.ownerId) continue;
    const land = landByOwner.get(tile.ownerId) ?? landByOwner.set(tile.ownerId, []).get(tile.ownerId)!;
    land.push(key);
    if (!isRoadTown(roadTile)) continue;
    const empire = empires.get(tile.ownerId) ?? empires.set(tile.ownerId, { ownerId: tile.ownerId, landKeys: land, townKeys: [] }).get(tile.ownerId)!;
    empire.townKeys.push(key);
  }
  return longestRoadFrom((key) => tileMap.get(key), empires.values(), players);
};
