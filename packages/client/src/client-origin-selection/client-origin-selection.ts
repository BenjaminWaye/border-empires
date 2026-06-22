import { LIGHT_OUTPOST_ATTACK_MULT, SIEGE_OUTPOST_ATTACK_MULT, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { tileSyncDebugEnabled } from "../client-debug/client-debug.js";
import { townHasSupportStructureType } from "../client-support-structures/client-support-structures.js";
import type { SupportTownStructureKey } from "../client-support-structures/client-support-structures.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { isFrontierOriginCutOff } from "../client-tile-menu-status/client-tile-menu-status.js";

type OriginSelectionDeps = {
  state: ClientState;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
};

export const createClientOriginSelection = (deps: OriginSelectionDeps) => {
  const { state, keyFor, wrapX, wrapY } = deps;

  const currentOutpostAttackMult = (): number => {
    let mult = 1;
    for (const tech of state.techCatalog) {
      if (!state.techIds.includes(tech.id)) continue;
      const effectMult = tech.effects?.outpostAttackMult;
      if (typeof effectMult === "number" && effectMult > 0) mult *= effectMult;
    }
    for (const domain of state.domainCatalog) {
      if (!state.domainIds.includes(domain.id)) continue;
      const effectMult = domain.effects?.outpostAttackMult;
      if (typeof effectMult === "number" && effectMult > 0) mult *= effectMult;
    }
    return mult;
  };

  const attackOriginMultiplierForTile = (tile: Tile): number => {
    if (tile.siegeOutpost?.ownerId === state.me && tile.siegeOutpost.status === "active") {
      return SIEGE_OUTPOST_ATTACK_MULT * currentOutpostAttackMult();
    }
    if (tile.economicStructure?.ownerId === state.me && tile.economicStructure.status === "active" && tile.economicStructure.type === "LIGHT_OUTPOST") {
      return LIGHT_OUTPOST_ATTACK_MULT;
    }
    return 1;
  };

  const pickBestOrigin = (candidates: Tile[]): Tile | undefined => {
    let best: Tile | undefined;
    let bestMult = -1;
    for (const candidate of candidates) {
      const attackMult = attackOriginMultiplierForTile(candidate);
      if (attackMult > bestMult) {
        best = candidate;
        bestMult = attackMult;
      }
    }
    return best;
  };

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
    return out.sort((a, b) => a.x - b.x || a.y - b.y).slice(0, 1);
  };

  const townHasSupportStructure = (
    town: Tile | undefined,
    structureType: SupportTownStructureKey
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

  const isDockLinkedToTarget = (dx: number, dy: number, tx: number, ty: number, allowAdjacent: boolean): boolean => {
    for (const d of dockDestinationsFor(dx, dy)) {
      if (d.x === tx && d.y === ty) return true;
      if (allowAdjacent && isAdjacent(d.x, d.y, tx, ty)) return true;
    }
    return false;
  };

  const pickDockOriginForTarget = (
    tx: number,
    ty: number,
    allowAdjacentToDock = true,
    allowOptimisticExpandOrigin = true
  ): Tile | undefined => {
    const candidates: Tile[] = [];
    for (const t of state.tiles.values()) {
      if (
        t.ownerId !== state.me ||
        t.terrain !== "LAND" ||
        t.fogged ||
        !t.dockId ||
        isFrontierOriginCutOff(t) ||
        (!allowOptimisticExpandOrigin && t.optimisticPending === "expand")
      ) continue;
      if (isDockLinkedToTarget(t.x, t.y, tx, ty, allowAdjacentToDock)) {
        candidates.push(t);
      }
    }
    const result = pickBestOrigin(candidates);
    if (!result && tileSyncDebugEnabled() && state.tiles.get(keyFor(tx, ty))?.dockId) {
      const playerDocks: Array<Record<string, unknown>> = [];
      for (const t of state.tiles.values()) {
        if (t.ownerId === state.me && t.dockId) {
          playerDocks.push({ x: t.x, y: t.y, dockId: t.dockId, ownershipState: t.ownershipState, optimisticPending: t.optimisticPending, cutOff: isFrontierOriginCutOff(t) });
        }
      }
      console.warn("[dock-origin] pickDockOriginForTarget: no origin for dock target", {
        target: { x: tx, y: ty }, allowAdjacentToDock, allowOptimisticExpandOrigin,
        dockPairs: state.dockPairs, playerDocks,
      });
    }
    return result;
  };

  const pickAetherBridgeOriginForTarget = (
    tx: number,
    ty: number,
    allowOptimisticExpandOrigin = true
  ): Tile | undefined => {
    const now = Date.now();
    const candidates: Tile[] = [];
    for (const bridge of state.activeAetherBridges) {
      if (bridge.ownerId !== state.me || bridge.endsAt <= now) continue;
      if (bridge.to.x !== tx || bridge.to.y !== ty) continue;
      const origin = state.tiles.get(keyFor(bridge.from.x, bridge.from.y));
      if (!origin || origin.ownerId !== state.me || origin.fogged) continue;
      if (isFrontierOriginCutOff(origin)) continue;
      if (!allowOptimisticExpandOrigin && origin.optimisticPending === "expand") continue;
      candidates.push(origin);
    }
    return pickBestOrigin(candidates);
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
    const adjacent = pickBestOrigin(
      candidates.filter((t) => t.ownerId === state.me && (allowOptimisticExpandOrigin || t.optimisticPending !== "expand") && !isFrontierOriginCutOff(t))
    );
    if (adjacent) return adjacent;
    const dockOrigin = pickDockOriginForTarget(tx, ty, allowAdjacentToDock, allowOptimisticExpandOrigin);
    if (dockOrigin) return dockOrigin;
    return pickAetherBridgeOriginForTarget(tx, ty, allowOptimisticExpandOrigin);
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
    pickAetherBridgeOriginForTarget,
    pickOriginForTarget,
    startingExpansionArrowTargets
  };
};
