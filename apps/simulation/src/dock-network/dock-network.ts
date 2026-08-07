import { isFrontierAdjacent } from "../frontier-adjacency/frontier-adjacency.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";

export type DockRouteDefinition = {
  dockId: string;
  tileKey: string;
  pairedDockId: string;
  connectedDockIds?: readonly string[];
};

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
};

const linkedDockIdsFor = (dock: DockRouteDefinition): readonly string[] =>
  dock.connectedDockIds?.length ? dock.connectedDockIds : dock.pairedDockId ? [dock.pairedDockId] : [];

export const buildDockLinksByDockTileKey = (
  docks: readonly DockRouteDefinition[]
): Map<string, readonly string[]> => {
  const dockById = new Map(docks.map((dock) => [dock.dockId, dock] as const));
  const linksByDockTileKey = new Map<string, readonly string[]>();
  for (const dock of docks) {
    const linkedTileKeys = linkedDockIdsFor(dock)
      .map((dockId) => dockById.get(dockId)?.tileKey)
      .filter((tileKey): tileKey is string => typeof tileKey === "string");
    linksByDockTileKey.set(dock.tileKey, linkedTileKeys);
  }
  return linksByDockTileKey;
};

export const dockCrossingCandidateTileKeys = (
  fromDockTileKey: string,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>
): string[] => {
  const linkedDockTileKeys = dockLinksByDockTileKey.get(fromDockTileKey) ?? [];
  const candidates = new Set<string>();
  for (const dockTileKey of linkedDockTileKeys) {
    candidates.add(dockTileKey);
    const coords = parseTileKey(dockTileKey);
    if (!coords) continue;
    forEachFrontierNeighbor(coords.x, coords.y, (nx, ny) => candidates.add(`${nx},${ny}`));
  }
  return [...candidates];
};

export const isValidDockCrossingTarget = (
  fromDockTileKey: string,
  toX: number,
  toY: number,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>,
  // ATTACK may reach land beside a linked dock (raiding past a hostile dock);
  // EXPAND must land on the linked dock tile itself — you can't settle around
  // an unowned dock without capturing it first.
  allowAdjacent: boolean
): boolean =>
  (dockLinksByDockTileKey.get(fromDockTileKey) ?? []).some((dockTileKey) => {
    const coords = parseTileKey(dockTileKey);
    return Boolean(coords) && (
      dockTileKey === `${toX},${toY}` ||
      (allowAdjacent && isFrontierAdjacent(coords!.x, coords!.y, toX, toY))
    );
  });

export const computeLinkedDockRevealTileKeys = (
  ownedDockTileKeys: Iterable<string>,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>,
  worldWidth: number,
  worldHeight: number,
  radius = 1
): Set<string> => {
  const wrapX = (x: number): number => ((x % worldWidth) + worldWidth) % worldWidth;
  const wrapY = (y: number): number => ((y % worldHeight) + worldHeight) % worldHeight;
  const revealKeys = new Set<string>();
  for (const ownedDockTileKey of ownedDockTileKeys) {
    const linkedTileKeys = dockLinksByDockTileKey.get(ownedDockTileKey);
    if (!linkedTileKeys?.length) continue;
    for (const linkedTileKey of linkedTileKeys) {
      const coords = parseTileKey(linkedTileKey);
      if (!coords) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          revealKeys.add(`${wrapX(coords.x + dx)},${wrapY(coords.y + dy)}`);
        }
      }
    }
  }
  return revealKeys;
};

export const collectLinkedDockRevealKeysForOwners = (
  visibilityOwnerIds: ReadonlySet<string>,
  docks: Iterable<{ tileKey: string }>,
  ownerOf: (tileKey: string) => string | undefined,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>,
  worldWidth: number,
  worldHeight: number,
  radius = 1
): Set<string> => {
  if (visibilityOwnerIds.size === 0) return new Set<string>();
  const ownedDockTileKeys: string[] = [];
  for (const dock of docks) {
    const ownerId = ownerOf(dock.tileKey);
    if (ownerId && visibilityOwnerIds.has(ownerId)) ownedDockTileKeys.push(dock.tileKey);
  }
  if (ownedDockTileKeys.length === 0) return new Set<string>();
  return computeLinkedDockRevealTileKeys(ownedDockTileKeys, dockLinksByDockTileKey, worldWidth, worldHeight, radius);
};
