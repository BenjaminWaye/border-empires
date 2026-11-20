// Per-camp supply (docs/planetary-defense-camps-plan.md, rule 4). A Planetary
// Defense tile must connect to its own camp through tiles of the same camp:
// 8-neighbour steps, plus a dock crossing from a camp dock to its linked docks'
// landing ground, as for a House's beachhead. A camp that has fallen loses all
// of its land. The search only walks the camp's own tiles, so its cost is the
// size of one camp, never the whole Planetary Defense territory.
import type { DomainTileState } from "@border-empires/game-domain";
import { dockLandingGroundCoords } from "@border-empires/shared";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { isPlanetaryDefenseCampTile } from "./camp-rules.js";

export type CampSupplyInput = {
  readonly campId: string;
  readonly members: ReadonlySet<string>;
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
};

/** Member tiles of `campId` no longer connected to a live camp tile, in no particular order. */
export const campTilesCutOff = (input: CampSupplyInput): string[] => {
  const { campId, members, tiles } = input;
  if (!isPlanetaryDefenseCampTile(campId, tiles.get(campId))) return [...members];
  const reached = new Set<string>([campId]);
  const queue: string[] = [campId];
  const visit = (key: string): void => {
    if (reached.has(key) || !members.has(key)) return;
    reached.add(key);
    queue.push(key);
  };
  const terrainAt = (x: number, y: number) => tiles.get(simulationTileKey(x, y))?.terrain;
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index]!;
    const tile = tiles.get(key);
    if (!tile) continue;
    forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => visit(simulationTileKey(nx, ny)));
    if (!tile.dockId) continue;
    for (const linkedKey of input.dockLinksByDockTileKey.get(key) ?? []) {
      visit(linkedKey);
      const linked = tiles.get(linkedKey);
      if (!linked) continue;
      for (const ground of dockLandingGroundCoords(linked.x, linked.y, terrainAt)) visit(simulationTileKey(ground.x, ground.y));
    }
  }
  const cutOff: string[] = [];
  for (const key of members) if (!reached.has(key)) cutOff.push(key);
  return cutOff;
};
