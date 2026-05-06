import { isSeaTerrain, type Dock } from "@border-empires/shared";

import type { ServerWorldgenDocksDeps, ServerWorldgenDocksRuntime } from "./server-world-runtime-types.js";

type DockCandidate = { x: number; y: number; componentId: number; seaX: number; seaY: number };
type LandComponent = {
  id: number;
  tileCount: number;
  fallbackX: number;
  fallbackY: number;
  oceanCandidates: DockCandidate[];
  clusteredOceanCandidates: DockCandidate[];
  inlandSeaCandidates: DockCandidate[];
  clusteredInlandSeaCandidates: DockCandidate[];
};

export const createServerWorldgenDocks = (deps: ServerWorldgenDocksDeps): ServerWorldgenDocksRuntime => {
  const {
    seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    key,
    wrapX,
    wrapY,
    worldIndex,
    terrainAt,
    largestSeaComponentMask,
    clusterByTile,
    LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD,
    docksByTile,
    dockById,
    getDockLinkedTileKeysByDockTileKey
  } = deps;

  const selectSpacedDockCandidates = (candidates: DockCandidate[], count: number, seed: number): DockCandidate[] => {
    if (count <= 0 || candidates.length === 0) return [];
    const pool = [...candidates];
    const startIdx = Math.floor(seeded01(seed + count, seed + pool.length, seed + 4123) * pool.length);
    const selected = [pool[startIdx]!];
    while (selected.length < count && selected.length < pool.length) {
      let bestCandidate;
      let bestDistance = Number.NEGATIVE_INFINITY;
      for (const candidate of pool) {
        if (selected.includes(candidate)) continue;
        let minDistance = Number.POSITIVE_INFINITY;
        for (const existing of selected) {
          const dx = Math.min(Math.abs(candidate.seaX - existing.seaX), WORLD_WIDTH - Math.abs(candidate.seaX - existing.seaX));
          const dy = Math.min(Math.abs(candidate.seaY - existing.seaY), WORLD_HEIGHT - Math.abs(candidate.seaY - existing.seaY));
          minDistance = Math.min(minDistance, dx + dy);
        }
        if (minDistance > bestDistance) {
          bestDistance = minDistance;
          bestCandidate = candidate;
        }
      }
      if (!bestCandidate) break;
      selected.push(bestCandidate);
    }
    return selected;
  };

  const analyzeLandComponentsForDocks = (seed: number, oceanMask: Uint8Array) => {
    const total = WORLD_WIDTH * WORLD_HEIGHT;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    const components: LandComponent[] = [];
    let componentId = 0;
    const adjacentSea = (x: number, y: number): { x: number; y: number; ocean: boolean } | undefined => {
      for (const [nx, ny] of [
        [wrapX(x, WORLD_WIDTH), wrapY(y - 1, WORLD_HEIGHT)],
        [wrapX(x + 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)],
        [wrapX(x, WORLD_WIDTH), wrapY(y + 1, WORLD_HEIGHT)],
        [wrapX(x - 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)]
      ] as const) {
        if (!isSeaTerrain(terrainAt(nx, ny))) continue;
        return { x: nx, y: ny, ocean: oceanMask[worldIndex(nx, ny)] === 1 };
      }
      return undefined;
    };

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        const startIdx = worldIndex(x, y);
        if (visited[startIdx] || terrainAt(x, y) !== "LAND") continue;
        visited[startIdx] = 1;
        let head = 0;
        let tail = 0;
        queue[tail++] = startIdx;
        const component: LandComponent = {
          id: componentId,
          tileCount: 0,
          fallbackX: x,
          fallbackY: y,
          oceanCandidates: [],
          clusteredOceanCandidates: [],
          inlandSeaCandidates: [],
          clusteredInlandSeaCandidates: []
        };

        while (head < tail) {
          const idx = queue[head++]!;
          component.tileCount += 1;
          const cx = idx % WORLD_WIDTH;
          const cy = Math.floor(idx / WORLD_WIDTH);
          if (seeded01(cx, cy, seed + 733) > 0.997) {
            component.fallbackX = cx;
            component.fallbackY = cy;
          }
          const sea = adjacentSea(cx, cy);
          if (sea) {
            const candidate = { x: cx, y: cy, componentId, seaX: sea.x, seaY: sea.y };
            if (sea.ocean) {
              if (clusterByTile.has(key(cx, cy))) component.clusteredOceanCandidates.push(candidate);
              else component.oceanCandidates.push(candidate);
            } else if (clusterByTile.has(key(cx, cy))) {
              component.clusteredInlandSeaCandidates.push(candidate);
            } else {
              component.inlandSeaCandidates.push(candidate);
            }
          }
          for (const [nx, ny] of [
            [wrapX(cx, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)],
            [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)],
            [wrapX(cx, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)],
            [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)],
            [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)],
            [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)],
            [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)],
            [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)]
          ] as const) {
            const nIdx = worldIndex(nx, ny);
            if (visited[nIdx] || terrainAt(nx, ny) !== "LAND") continue;
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }
        components.push(component);
        componentId += 1;
      }
    }
    return { components };
  };

  const generateDocks = (seed: number): void => {
    docksByTile.clear();
    dockById.clear();
    getDockLinkedTileKeysByDockTileKey().clear();
    const oceanMask = largestSeaComponentMask();
    const { components } = analyzeLandComponentsForDocks(seed, oceanMask);
    const orderedDockCandidatesForComponent = (component: LandComponent): DockCandidate[] => {
      const preferredPools = [
        component.oceanCandidates,
        component.clusteredOceanCandidates,
        component.inlandSeaCandidates,
        component.clusteredInlandSeaCandidates
      ];
      const seenTileKeys = new Set<string>();
      const orderedCandidates: DockCandidate[] = [];
      for (const pool of preferredPools) {
        for (const candidate of pool) {
          const candidateTileKey = key(candidate.x, candidate.y);
          if (seenTileKeys.has(candidateTileKey)) continue;
          seenTileKeys.add(candidateTileKey);
          orderedCandidates.push(candidate);
        }
      }
      if (orderedCandidates.length > 0) return orderedCandidates;
      return [{ x: component.fallbackX, y: component.fallbackY, componentId: component.id, seaX: component.fallbackX, seaY: component.fallbackY }];
    };
    const dockCandidatesForComponent = (component: LandComponent): DockCandidate[] => orderedDockCandidatesForComponent(component);
    const eligibleComponents = components.filter((component) => dockCandidatesForComponent(component).length > 0);
    const primaryDockCandidateByComponent = new Map<number, DockCandidate>();
    for (const component of eligibleComponents) {
      const primary = selectSpacedDockCandidates(dockCandidatesForComponent(component), 1, seed + component.id * 17)[0];
      if (primary) primaryDockCandidateByComponent.set(component.id, primary);
    }

    const componentSeaDistance = (aComponentId: number, bComponentId: number): number => {
      const a = primaryDockCandidateByComponent.get(aComponentId);
      const b = primaryDockCandidateByComponent.get(bComponentId);
      if (!a || !b) return Number.POSITIVE_INFINITY;
      const dx = Math.min(Math.abs(a.seaX - b.seaX), WORLD_WIDTH - Math.abs(a.seaX - b.seaX));
      const dy = Math.min(Math.abs(a.seaY - b.seaY), WORLD_HEIGHT - Math.abs(a.seaY - b.seaY));
      return dx + dy;
    };

    const componentIds = eligibleComponents.map((component) => component.id);
    const componentEdges: Array<[number, number]> = [];
    const componentEdgeKeys = new Set<string>();
    const addComponentEdge = (aComponentId: number, bComponentId: number): void => {
      if (aComponentId === bComponentId) return;
      const edgeKey = aComponentId < bComponentId ? `${aComponentId}|${bComponentId}` : `${bComponentId}|${aComponentId}`;
      if (componentEdgeKeys.has(edgeKey)) return;
      componentEdgeKeys.add(edgeKey);
      componentEdges.push([aComponentId, bComponentId]);
    };

    const desiredDockCountForComponent = (component: LandComponent): number =>
      component.tileCount >= LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD ? 2 : 1;

    const degreeByComponent = new Map<number, number>();

    if (componentIds.length > 1) {
      const visitedComponents = new Set<number>([componentIds[0]!]);
      while (visitedComponents.size < componentIds.length) {
        let bestFrom = -1;
        let bestTo = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const fromId of visitedComponents) {
          for (const toId of componentIds) {
            if (visitedComponents.has(toId)) continue;
            const distance = componentSeaDistance(fromId, toId);
            if (distance < bestDist) {
              bestDist = distance;
              bestFrom = fromId;
              bestTo = toId;
            }
          }
        }
        if (bestFrom < 0 || bestTo < 0) break;
        addComponentEdge(bestFrom, bestTo);
        visitedComponents.add(bestTo);
      }
      for (const componentId of componentIds) {
        const component = eligibleComponents.find((candidate) => candidate.id === componentId);
        if (!component || component.tileCount >= LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD) continue;
        let bestNeighbor = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const otherId of componentIds) {
          if (otherId === componentId) continue;
          const distance = componentSeaDistance(componentId, otherId);
          if (distance < bestDist) {
            bestDist = distance;
            bestNeighbor = otherId;
          }
        }
        if (bestNeighbor >= 0) addComponentEdge(componentId, bestNeighbor);
      }

      for (const [aComponentId, bComponentId] of componentEdges) {
        degreeByComponent.set(aComponentId, (degreeByComponent.get(aComponentId) ?? 0) + 1);
        degreeByComponent.set(bComponentId, (degreeByComponent.get(bComponentId) ?? 0) + 1);
      }

      const additionalEdgeNeeded = (componentId: number): boolean => {
        const component = eligibleComponents.find((candidate) => candidate.id === componentId);
        if (!component) return false;
        return (degreeByComponent.get(componentId) ?? 0) < desiredDockCountForComponent(component);
      };

      let edgeAdded = true;
      while (edgeAdded) {
        edgeAdded = false;
        for (const componentId of componentIds) {
          if (!additionalEdgeNeeded(componentId)) continue;
          let bestNeighbor = -1;
          let bestDist = Number.POSITIVE_INFINITY;
          for (const otherId of componentIds) {
            if (otherId === componentId) continue;
            const edgeKey = componentId < otherId ? `${componentId}|${otherId}` : `${otherId}|${componentId}`;
            if (componentEdgeKeys.has(edgeKey)) continue;
            const distance = componentSeaDistance(componentId, otherId);
            if (distance < bestDist) {
              bestDist = distance;
              bestNeighbor = otherId;
            }
          }
          if (bestNeighbor < 0) continue;
          addComponentEdge(componentId, bestNeighbor);
          degreeByComponent.set(componentId, (degreeByComponent.get(componentId) ?? 0) + 1);
          degreeByComponent.set(bestNeighbor, (degreeByComponent.get(bestNeighbor) ?? 0) + 1);
          edgeAdded = true;
        }
      }
    }

    const selectedByComponent = new Map<number, DockCandidate[]>();
    for (const component of eligibleComponents) {
      const desiredCount =
        component.tileCount >= LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD ? Math.max(2, degreeByComponent.get(component.id) ?? 1) : 1;
      const candidates = dockCandidatesForComponent(component);
      const picks = selectSpacedDockCandidates(candidates, Math.min(desiredCount, candidates.length), seed + component.id * 97);
      if (picks.length > 0) selectedByComponent.set(component.id, picks);
    }

    const selected = [...selectedByComponent.values()].flat();
    const docks: Dock[] = selected.map((dock, index) => ({
      dockId: `dock-${index}`,
      tileKey: key(dock.x, dock.y),
      pairedDockId: "",
      connectedDockIds: [] as string[],
      cooldownUntil: 0
    }));
    const dockIndicesByComponent = new Map<number, number[]>();
    for (let index = 0; index < selected.length; index += 1) {
      const componentId = selected[index]!.componentId;
      const indices = dockIndicesByComponent.get(componentId) ?? [];
      indices.push(index);
      dockIndicesByComponent.set(componentId, indices);
    }

    const edgeKeys = new Set<string>();
    const addDockConnection = (aIdx: number, bIdx: number): void => {
      if (aIdx === bIdx) return;
      const a = docks[aIdx]!;
      const b = docks[bIdx]!;
      const edgeKey = a.dockId < b.dockId ? `${a.dockId}|${b.dockId}` : `${b.dockId}|${a.dockId}`;
      if (edgeKeys.has(edgeKey)) return;
      edgeKeys.add(edgeKey);
      const aConnectedDockIds = a.connectedDockIds ?? [];
      const bConnectedDockIds = b.connectedDockIds ?? [];
      if (!aConnectedDockIds.includes(b.dockId)) a.connectedDockIds = [...aConnectedDockIds, b.dockId];
      if (!bConnectedDockIds.includes(a.dockId)) b.connectedDockIds = [...bConnectedDockIds, a.dockId];
      if (!a.pairedDockId) a.pairedDockId = b.dockId;
      if (!b.pairedDockId) b.pairedDockId = a.dockId;
    };

    const nextDockOffsetByComponent = new Map<number, number>();
    const dockIndexForEdge = (componentId: number): number | undefined => {
      const indices = dockIndicesByComponent.get(componentId);
      if (!indices || indices.length === 0) return undefined;
      const component = eligibleComponents.find((candidate) => candidate.id === componentId);
      if (!component || component.tileCount < LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD) return indices[0];
      const offset = nextDockOffsetByComponent.get(componentId) ?? 0;
      nextDockOffsetByComponent.set(componentId, offset + 1);
      return indices[Math.min(offset, indices.length - 1)];
    };

    for (const [aComponentId, bComponentId] of componentEdges) {
      const aIdx = dockIndexForEdge(aComponentId);
      const bIdx = dockIndexForEdge(bComponentId);
      if (aIdx === undefined || bIdx === undefined) continue;
      addDockConnection(aIdx, bIdx);
    }

    const seaDistanceBetweenDockIndices = (aIdx: number, bIdx: number): number => {
      const a = selected[aIdx]!;
      const b = selected[bIdx]!;
      const dx = Math.min(Math.abs(a.seaX - b.seaX), WORLD_WIDTH - Math.abs(a.seaX - b.seaX));
      const dy = Math.min(Math.abs(a.seaY - b.seaY), WORLD_HEIGHT - Math.abs(a.seaY - b.seaY));
      return dx + dy;
    };

    for (const component of eligibleComponents) {
      if (component.tileCount < LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD) continue;
      const indices = dockIndicesByComponent.get(component.id) ?? [];
      let offset = nextDockOffsetByComponent.get(component.id) ?? 0;
      while (offset < indices.length) {
        const localIdx = indices[offset]!;
        offset += 1;
        nextDockOffsetByComponent.set(component.id, offset);
        let bestRemoteIdx: number | undefined;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const otherComponent of eligibleComponents) {
          if (otherComponent.id === component.id) continue;
          for (const remoteIdx of dockIndicesByComponent.get(otherComponent.id) ?? []) {
            const distance = seaDistanceBetweenDockIndices(localIdx, remoteIdx);
            if (distance < bestDist) {
              bestDist = distance;
              bestRemoteIdx = remoteIdx;
            }
          }
        }
        if (bestRemoteIdx === undefined) break;
        addDockConnection(localIdx, bestRemoteIdx);
      }
    }

    for (const dock of docks) {
      if (!dock.pairedDockId && (dock.connectedDockIds?.length ?? 0) === 0) continue;
      docksByTile.set(dock.tileKey, dock);
      dockById.set(dock.dockId, dock);
    }
  };

  return {
    generateDocks
  };
};
