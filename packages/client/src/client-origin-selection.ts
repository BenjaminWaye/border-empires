import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { townHasSupportStructureType } from "./client-support-structures.js";
import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

type OriginSelectionDeps = {
  state: ClientState;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
};

export const createClientOriginSelection = (deps: OriginSelectionDeps) => {
  const { state, keyFor, wrapX, wrapY } = deps;

  const isTownSupportNeighbor = (tx: number, ty: number, sx: number, sy: number): boolean => {
    const dx = Math.min(Math.abs(tx - sx), WORLD_WIDTH - Math.abs(tx - sx));
    const dy = Math.min(Math.abs(ty - sy), WORLD_HEIGHT - Math.abs(ty - sy));
    if (dx === 0 && dy === 0) return false;
    return dx <= 1 && dy <= 1;
  };

  const isTownSupportHighlightableTile = (tile: Tile | undefined): boolean => {
    if (!tile) return false;
    if (tile.terrain !== "LAND") return false;
    if (tile.dockId) return false;
    return true;
  };

  const supportedOwnedTownsForTile = (tile: Tile): Tile[] => {
    const out: Tile[] = [];
    for (const candidate of state.tiles.values()) {
      if (!candidate.town || candidate.ownerId !== state.me || candidate.ownershipState !== "SETTLED") continue;
      if (candidate.town.populationTier === "SETTLEMENT") continue;
      if (!isTownSupportNeighbor(tile.x, tile.y, candidate.x, candidate.y)) continue;
      out.push(candidate);
    }
    return out.sort((a, b) => a.x - b.x || a.y - b.y);
  };

  const townHasSupportStructure = (
    town: Tile | undefined,
    structureType: "MARKET" | "GRANARY" | "BANK" | "CARAVANARY" | "FUR_SYNTHESIZER" | "IRONWORKS" | "CRYSTAL_SYNTHESIZER" | "FUEL_PLANT"
  ): boolean => townHasSupportStructureType(state.tiles.values(), town, state.me, structureType);

  const supportedOwnedDocksForTile = (tile: Tile): Tile[] => {
    const out: Tile[] = [];
    for (const candidate of state.tiles.values()) {
      if (!candidate.dockId || candidate.ownerId !== state.me || candidate.ownershipState !== "SETTLED") continue;
      if (!isTownSupportNeighbor(tile.x, tile.y, candidate.x, candidate.y)) continue;
      out.push(candidate);
    }
    return out.sort((a, b) => a.x - b.x || a.y - b.y);
  };

  const hoverTile = (): Tile | undefined => {
    if (!state.hover) return undefined;
    return state.tiles.get(keyFor(state.hover.x, state.hover.y));
  };

  const isAdjacent = (ax: number, ay: number, bx: number, by: number): boolean => {
    const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
    const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
    return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
  };

  const isAdjacentCardinal = (ax: number, ay: number, bx: number, by: number): boolean => {
    const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
    const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  };

  const dockDestinationsFor = (dx: number, dy: number): Array<{ x: number; y: number }> => {
    const out: Array<{ x: number; y: number }> = [];
    const seen = new Set<string>();
    for (const pair of state.dockPairs) {
      if (pair.ax === dx && pair.ay === dy) {
        const k = keyFor(pair.bx, pair.by);
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ x: pair.bx, y: pair.by });
        }
      }
      if (pair.bx === dx && pair.by === dy) {
        const k = keyFor(pair.ax, pair.ay);
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ x: pair.ax, y: pair.ay });
        }
      }
    }
    return out;
  };

  const pickDockOriginForTarget = (
    tx: number,
    ty: number,
    allowAdjacentToDock = true,
    allowOptimisticExpandOrigin = true
  ): Tile | undefined => {
    for (const t of state.tiles.values()) {
      if (
        t.ownerId !== state.me ||
        t.terrain !== "LAND" ||
        t.fogged ||
        !t.dockId ||
        (!allowOptimisticExpandOrigin && t.optimisticPending === "expand")
      ) continue;
      const linked = dockDestinationsFor(t.x, t.y);
      for (const d of linked) {
        if ((d.x === tx && d.y === ty) || (allowAdjacentToDock && isAdjacent(d.x, d.y, tx, ty))) return t;
      }
    }
    return undefined;
  };

  const pickOriginForTarget = (
    tx: number,
    ty: number,
    allowAdjacentToDock = true,
    allowOptimisticExpandOrigin = true
  ): Tile | undefined => {
    const candidates = [
      state.tiles.get(keyFor(wrapX(tx), wrapY(ty - 1))),
      state.tiles.get(keyFor(wrapX(tx + 1), wrapY(ty))),
      state.tiles.get(keyFor(wrapX(tx), wrapY(ty + 1))),
      state.tiles.get(keyFor(wrapX(tx - 1), wrapY(ty))),
      state.tiles.get(keyFor(wrapX(tx - 1), wrapY(ty - 1))),
      state.tiles.get(keyFor(wrapX(tx + 1), wrapY(ty - 1))),
      state.tiles.get(keyFor(wrapX(tx + 1), wrapY(ty + 1))),
      state.tiles.get(keyFor(wrapX(tx - 1), wrapY(ty + 1)))
    ].filter((t): t is Tile => Boolean(t));
    const adjacent = candidates.find((t) => t.ownerId === state.me && (allowOptimisticExpandOrigin || t.optimisticPending !== "expand"));
    if (adjacent) return adjacent;
    return pickDockOriginForTarget(tx, ty, allowAdjacentToDock, allowOptimisticExpandOrigin);
  };

  const startingExpansionArrowTargets = (): Array<{ x: number; y: number; dx: number; dy: number }> => {
    if (!state.homeTile) return [];
    if (state.actionInFlight || state.capture || state.actionQueue.length > 0 || state.settleProgressByTile.size > 0) return [];
    const homeKey = keyFor(state.homeTile.x, state.homeTile.y);
    const home = state.tiles.get(homeKey);
    if (!home || home.fogged || home.ownerId !== state.me || home.ownershipState !== "SETTLED") return [];
    for (const tile of state.tiles.values()) {
      if (tile.ownerId !== state.me) continue;
      if (keyFor(tile.x, tile.y) === homeKey) continue;
      if (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED") return [];
    }

    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: -1, dy: 1 }
    ];
    const out: Array<{ x: number; y: number; dx: number; dy: number }> = [];
    for (const dir of dirs) {
      const x = wrapX(state.homeTile.x + dir.dx);
      const y = wrapY(state.homeTile.y + dir.dy);
      const tile = state.tiles.get(keyFor(x, y));
      if (!tile || tile.fogged || tile.terrain !== "LAND" || tile.ownerId) continue;
      if (!pickOriginForTarget(x, y, false)) continue;
      out.push({ x, y, dx: dir.dx, dy: dir.dy });
    }
    return out;
  };

  return {
    isTownSupportNeighbor,
    isTownSupportHighlightableTile,
    supportedOwnedTownsForTile,
    townHasSupportStructure,
    supportedOwnedDocksForTile,
    hoverTile,
    isAdjacent,
    isAdjacentCardinal,
    dockDestinationsFor,
    pickDockOriginForTarget,
    pickOriginForTarget,
    startingExpansionArrowTargets
  };
};
