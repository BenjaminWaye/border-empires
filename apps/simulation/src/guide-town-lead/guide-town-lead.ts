// The guide's town lead: where a House that holds no town yet should send its scout drone. A new House
// that finds no town quits (Playtest Run 4: one persona flew the drone five times over three mornings and
// never saw one), so the simulation, which knows the whole map, names the nearest unclaimed town and the
// guide marks the fog toward it (packages/client/src/client-tutorial-guide/).
//
// Reads only the neutral-town index the runtime already keeps (neutralBeaconTileKeys: unowned towns and
// docks), so the cost is one pass over that small set, and only for Houses with no town; no new state.
import type { DomainTileState } from "@border-empires/game-domain";
import { wrappedChebyshevDistance, type GuideTownLead } from "@border-empires/shared";

type TownPopulationTier = NonNullable<NonNullable<DomainTileState["town"]>["populationTier"]>;

export type { GuideTownLead };

export type GuideTownLeadInput = {
  tiles: ReadonlyMap<string, DomainTileState>;
  /** Unowned town and dock tiles (runtime neutralBeaconTileKeys). */
  neutralTileKeys: Iterable<string>;
  /** The player's towns by tile; their own landing SETTLEMENT doesn't count as a town for the guide. */
  ownedTownTierByTile: ReadonlyMap<string, TownPopulationTier>;
  /** Where the drone launches from: the player's AFC tiles. */
  ownedAfcTileKeys: Iterable<string>;
};

const parseKey = (key: string): { x: number; y: number } | undefined => {
  const [x, y] = key.split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x: x as number, y: y as number } : undefined;
};

/** The nearest unowned town to the player's AFC, or undefined once they hold a town (or have no AFC). */
export const guideTownLeadFor = (input: GuideTownLeadInput): GuideTownLead | undefined => {
  for (const tier of input.ownedTownTierByTile.values()) if (tier !== "SETTLEMENT") return undefined;
  const origins = [...input.ownedAfcTileKeys].map(parseKey).filter((p): p is { x: number; y: number } => p !== undefined);
  if (origins.length === 0) return undefined;
  let best: GuideTownLead | undefined;
  let bestDistance = Infinity;
  for (const key of input.neutralTileKeys) {
    const tile = input.tiles.get(key);
    if (!tile?.town || tile.ownerId) continue;
    for (const origin of origins) {
      const distance = wrappedChebyshevDistance(origin.x, origin.y, tile.x, tile.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: tile.x, y: tile.y };
      }
    }
  }
  return best;
};
