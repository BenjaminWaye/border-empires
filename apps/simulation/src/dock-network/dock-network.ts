export type DockRouteDefinition = {
  dockId: string;
  tileKey: string;
  pairedDockId: string;
  connectedDockIds?: readonly string[];
  // Server-computed sea geometry per connected dock, frozen with the world at
  // worldgen time so the client draws the authoritative route instead of
  // re-deriving it from its own procedural terrain (which drifts from the
  // server's frozen worldgen_baselines terrain).
  routeWaypointsByLinkedDockId?: Readonly<Record<string, ReadonlyArray<{ x: number; y: number }>>>;
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

// Connected components of the dock graph, keyed by every dock tile key in
// the component to the shared member set. Lets a crossing-origin lookup ask
// "does this player control any dock in the same network as this one" in
// O(component size) instead of scanning the whole dock graph or the world.
export const buildDockNetworkComponentByTileKey = (
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>
): Map<string, ReadonlySet<string>> => {
  const componentByTileKey = new Map<string, ReadonlySet<string>>();
  for (const startTileKey of dockLinksByDockTileKey.keys()) {
    if (componentByTileKey.has(startTileKey)) continue;
    const members = new Set<string>([startTileKey]);
    const queue = [startTileKey];
    while (queue.length) {
      const current = queue.pop() as string;
      for (const linked of dockLinksByDockTileKey.get(current) ?? []) {
        if (members.has(linked)) continue;
        members.add(linked);
        queue.push(linked);
      }
    }
    for (const member of members) componentByTileKey.set(member, members);
  }
  return componentByTileKey;
};

export const dockCrossingCandidateTileKeys = (
  fromDockTileKey: string,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>
): string[] => [...(dockLinksByDockTileKey.get(fromDockTileKey) ?? [])];

// A dock crossing (ATTACK or EXPAND) must land on the linked dock tile
// itself — you have to capture the dock before you can reach land beyond it.
export const isValidDockCrossingTarget = (
  fromDockTileKey: string,
  toX: number,
  toY: number,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>
): boolean =>
  (dockLinksByDockTileKey.get(fromDockTileKey) ?? []).some(
    (dockTileKey) => dockTileKey === `${toX},${toY}`
  );

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
