import type { OwnershipState, Tile, TileKey } from "@border-empires/shared";

export const FRONTIER_BUREAU_DOMAIN_ID = "frontier-bureau";

type FrontierTarget = Pick<Tile, "x" | "y" | "ownershipState">;

type FrontierDefenseDeps = {
  worldWidth: number;
  worldHeight: number;
  key: (x: number, y: number) => TileKey;
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  ownerAt: (tileKey: TileKey) => string | undefined;
  ownershipStateAt: (tileKey: TileKey) => OwnershipState | undefined;
};

export const hasAdjacentSettledTerritory = (tileKey: TileKey, ownerId: string | undefined, deps: FrontierDefenseDeps): boolean => {
  if (!ownerId) return false;
  const [rawXText = "0", rawYText = "0"] = tileKey.split(",");
  const rawX = Number(rawXText);
  const rawY = Number(rawYText);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = deps.wrapX(rawX + dx, deps.worldWidth);
      const ny = deps.wrapY(rawY + dy, deps.worldHeight);
      const neighborKey = deps.key(nx, ny);
      if (deps.ownerAt(neighborKey) !== ownerId) continue;
      if (deps.ownershipStateAt(neighborKey) !== "SETTLED") continue;
      return true;
    }
  }
  return false;
};

export const supportedFrontierUsesSettledDefense = (
  defenderDomainIds: ReadonlySet<string> | undefined,
  defenderId: string | undefined,
  target: FrontierTarget | undefined,
  deps: FrontierDefenseDeps
): boolean => {
  if (!defenderId || !target || target.ownershipState !== "FRONTIER") return false;
  if (!defenderDomainIds?.has(FRONTIER_BUREAU_DOMAIN_ID)) return false;
  return hasAdjacentSettledTerritory(deps.key(target.x, target.y), defenderId, deps);
};
