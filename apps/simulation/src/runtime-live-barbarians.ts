import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationTileWireDelta, RuntimePlayer } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

export type SeedLiveBarbariansResult = {
  requested: number;
  placed: number;
  candidates: number;
  scanned: number;
  skippedNearOwned: number;
  skippedNearBarb: number;
  skippedBlocked: number;
  cappedScan: boolean;
  barbTilesAfter: number;
};

export const seedLiveBarbarians = (input: {
  targetCount: number;
  commandId: string;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  pendingSettlementsByTile: ReadonlyMap<string, unknown>;
  locksByTile: ReadonlyMap<string, unknown>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitTileDeltaBatch: (input: { commandId: string; playerId: string; tileDeltas: SimulationTileWireDelta[] }) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
}): SeedLiveBarbariansResult => {
  const requested = Math.max(0, Math.floor(input.targetCount));
  const result: SeedLiveBarbariansResult = {
    requested,
    placed: 0,
    candidates: 0,
    scanned: 0,
    skippedNearOwned: 0,
    skippedNearBarb: 0,
    skippedBlocked: 0,
    cappedScan: false,
    barbTilesAfter: input.summaryForPlayer("barbarian-1").territoryTileKeys.size
  };
  if (requested === 0) return result;
  if (!input.players.get("barbarian-1")) {
    input.runtimeLogInfo(
      { type: "barb_seed_skipped", reason: "no_barbarian_player", commandId: input.commandId, ...result },
      "live barbarian seed skipped: barbarian-1 player record missing"
    );
    return result;
  }

  const minDistanceFromOwned = 8;
  const minBarbSeparation = 4;
  const cheb = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const candidates: DomainTileState[] = [];
  const barbAnchors: Array<{ x: number; y: number }> = [];
  for (const tile of input.tiles.values()) {
    if (tile.ownerId === "barbarian-1") {
      barbAnchors.push({ x: tile.x, y: tile.y });
      continue;
    }
    if (tile.terrain !== "LAND") continue;
    if (tile.ownerId) continue;
    if (tile.town || tile.dockId || tile.shardSite) continue;
    candidates.push(tile);
  }
  result.candidates = candidates.length;

  let seed = 0;
  for (let i = 0; i < input.commandId.length; i += 1) seed = (Math.imul(seed, 31) + input.commandId.charCodeAt(i)) >>> 0;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }

  const ownedNearby = (x: number, y: number): boolean => {
    for (let dx = -minDistanceFromOwned; dx <= minDistanceFromOwned; dx += 1) {
      for (let dy = -minDistanceFromOwned; dy <= minDistanceFromOwned; dy += 1) {
        const neighbor = input.tiles.get(simulationTileKey(x + dx, y + dy));
        if (neighbor?.ownerId && neighbor.ownerId !== "barbarian-1") return true;
      }
    }
    return false;
  };

  const maxScan = Math.max(2_000, requested * 1_000);
  const placedDeltas: SimulationTileWireDelta[] = [];
  for (const tile of candidates) {
    if (result.placed >= requested) break;
    if (result.scanned >= maxScan) {
      result.cappedScan = true;
      break;
    }
    result.scanned += 1;
    const tileKey = simulationTileKey(tile.x, tile.y);
    if (input.pendingSettlementsByTile.has(tileKey) || input.locksByTile.has(tileKey)) {
      result.skippedBlocked += 1;
      continue;
    }
    if (ownedNearby(tile.x, tile.y)) {
      result.skippedNearOwned += 1;
      continue;
    }
    if (barbAnchors.some((anchor) => cheb(anchor.x, anchor.y, tile.x, tile.y) < minBarbSeparation)) {
      result.skippedNearBarb += 1;
      continue;
    }
    const barbTile: DomainTileState = { ...tile, ownerId: "barbarian-1", ownershipState: "SETTLED" };
    input.replaceTileState(tileKey, barbTile, input.commandId);
    placedDeltas.push(input.tileDeltaFromState(barbTile));
    barbAnchors.push({ x: tile.x, y: tile.y });
    result.placed += 1;
  }

  if (placedDeltas.length > 0) input.emitTileDeltaBatch({ commandId: input.commandId, playerId: "barbarian-1", tileDeltas: placedDeltas });
  result.barbTilesAfter = input.summaryForPlayer("barbarian-1").territoryTileKeys.size;
  input.runtimeLogInfo({ type: "barb_seed_placed", commandId: input.commandId, ...result }, "live barbarian seed");
  return result;
};
