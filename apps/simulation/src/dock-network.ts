import { isFrontierAdjacent } from "./frontier-adjacency.js";
import { frontierNeighborKeys } from "./frontier-topology.js";

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
    for (const neighborKey of frontierNeighborKeys(coords.x, coords.y)) {
      candidates.add(neighborKey);
    }
  }
  return [...candidates];
};

export const isValidDockCrossingTarget = (
  fromDockTileKey: string,
  toX: number,
  toY: number,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>
): boolean =>
  (dockLinksByDockTileKey.get(fromDockTileKey) ?? []).some((dockTileKey) => {
    const coords = parseTileKey(dockTileKey);
    return Boolean(coords) && (
      dockTileKey === `${toX},${toY}` ||
      isFrontierAdjacent(coords!.x, coords!.y, toX, toY)
    );
  });
