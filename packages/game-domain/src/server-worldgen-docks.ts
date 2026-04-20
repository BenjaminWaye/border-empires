import type { Dock } from "@border-empires/shared";

import type { ServerWorldgenDocksDeps, ServerWorldgenDocksRuntime } from "./server-world-runtime-types.js";

type DockCandidate = { x: number; y: number; componentId: number; seaX: number; seaY: number };
type LandComponent = { id: number; tileCount: number; fallbackX: number; fallbackY: number; oceanCandidates: DockCandidate[] };

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
    adjacentOceanSea,
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

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        const startIdx = worldIndex(x, y);
        if (visited[startIdx] || terrainAt(x, y) !== "LAND") continue;
        visited[startIdx] = 1;
        let head = 0;
        let tail = 0;
        queue[tail++] = startIdx;
        const component: LandComponent = { id: componentId, tileCount: 0, fallbackX: x, fallbackY: y, oceanCandidates: [] };

        while (head < tail) {
          const idx = queue[head++]!;
          component.tileCount += 1;
          const cx = idx % WORLD_WIDTH;
          const cy = Math.floor(idx / WORLD_WIDTH);
          if (seeded01(cx, cy, seed + 733) > 0.997) {
            component.fallbackX = cx;
            component.fallbackY = cy;
          }
          const ocean = adjacentOceanSea(cx, cy, oceanMask);
          if (ocean && !clusterByTile.has(key(cx, cy))) {
            component.oceanCandidates.push({ x: cx, y: cy, componentId, seaX: ocean.x, seaY: ocean.y });
          }
          for (const [nx, ny] of [[wrapX(cx, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)], [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)], [wrapX(cx, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)], [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)]] as const) {
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
    const eligibleComponents = components.filter((component) => component.tileCount >= 24 && component.oceanCandidates.length > 0);
    const primaryDockCandidateByComponent = new Map<number, DockCandidate>();
    for (const component of eligibleComponents) {
      const primary = selectSpacedDockCandidates(component.oceanCandidates, 1, seed + component.id * 17)[0];
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
    }

    const degreeByComponent = new Map<number, number>();
    for (const [aComponentId, bComponentId] of componentEdges) {
      degreeByComponent.set(aComponentId, (degreeByComponent.get(aComponentId) ?? 0) + 1);
      degreeByComponent.set(bComponentId, (degreeByComponent.get(bComponentId) ?? 0) + 1);
    }

    const selectedByComponent = new Map<number, DockCandidate[]>();
    for (const component of eligibleComponents) {
      const desiredCount =
        component.tileCount >= LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD ? Math.max(2, degreeByComponent.get(component.id) ?? 1) : 1;
      const picks = selectSpacedDockCandidates(component.oceanCandidates, Math.min(desiredCount, component.oceanCandidates.length), seed + component.id * 97);
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
