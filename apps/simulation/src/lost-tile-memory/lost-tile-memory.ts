// Who took the land a player lost, for their map's fog memory. On login the client knows explored tiles only
// as "explored", so land lost far from the player's remaining territory showed as unowned fog even though the
// Chronicle said who took it (Playtest Run 4: "the tile shows no owner"). The subscribe reply carries this list
// next to exploredTiles (subscribe-player-reply.ts) and the client paints those tiles as fogged land of that owner.
//
// Only what the player witnessed: the House that took each tile *from them* (the latest such loss), never
// a later change of hands they couldn't see, and nothing for a tile they have since won back. Read from the
// bounded 24h territory-flip log; capped, newest losses first.
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";

export const LOST_TILE_MEMORY_MAX = 500;

export type LostTile = { x: number; y: number; ownerId: string };

export const lostTilesOf = (playerId: string, flips: readonly TerritoryFlip[], max = LOST_TILE_MEMORY_MAX): LostTile[] => {
  // Latest flip per tile that involves this player: a loss (from them) or a regain (to them).
  const latest = new Map<string, TerritoryFlip>();
  for (const flip of flips) {
    if (flip.fromOwner !== playerId && flip.toOwner !== playerId) continue;
    const previous = latest.get(flip.tileId);
    if (!previous || flip.at >= previous.at) latest.set(flip.tileId, flip);
  }
  const lost: TerritoryFlip[] = [];
  for (const flip of latest.values()) {
    if (flip.fromOwner === playerId && flip.toOwner !== undefined && flip.toOwner !== playerId) lost.push(flip);
  }
  lost.sort((a, b) => b.at - a.at);
  return lost.slice(0, max).map((flip) => ({ x: flip.x, y: flip.y, ownerId: flip.toOwner as string }));
};
