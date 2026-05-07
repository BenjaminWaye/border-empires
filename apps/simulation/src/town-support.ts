import { frontierNeighborKeys } from "./frontier-topology.js";

type TownSupportTile = {
  terrain: string;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
};

export const computeTownSupport = (
  playerId: string,
  townX: number,
  townY: number,
  tilesByKey: ReadonlyMap<string, TownSupportTile>
): { supportCurrent: number; supportMax: number } => {
  let supportCurrent = 0;
  let supportMax = 0;
  for (const neighborKey of frontierNeighborKeys(townX, townY)) {
    const neighbor = tilesByKey.get(neighborKey);
    if (!neighbor || neighbor.terrain !== "LAND") continue;
    supportMax += 1;
    if (neighbor.ownerId === playerId && neighbor.ownershipState === "SETTLED") supportCurrent += 1;
  }
  return { supportCurrent, supportMax };
};
