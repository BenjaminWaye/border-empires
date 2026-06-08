import { forEachFrontierNeighbor } from "./frontier-topology.js";

type TownSupportTile = { terrain: string; ownerId?: string | undefined; ownershipState?: string | undefined; };

export const computeTownSupport = (
  playerId: string,
  townX: number,
  townY: number,
  tilesByKey: ReadonlyMap<string, TownSupportTile>
): { supportCurrent: number; supportMax: number } => {
  let supportCurrent = 0;
  let supportMax = 0;

  forEachFrontierNeighbor(townX, townY, (x, y) => {
    const tile = tilesByKey.get(`${x},${y}`);

    if (tile?.terrain !== "LAND") {
      return;
    }

    supportMax += 1;

    if (tile.ownerId === playerId && tile.ownershipState === "SETTLED") {
      supportCurrent += 1;
    }
  });

  return { supportCurrent, supportMax };
};