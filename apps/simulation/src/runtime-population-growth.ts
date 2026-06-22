import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  GROWTH_FOOD_COST_PER_POP,
  LONG_PEACE_GROWTH_MULT,
  LONG_PEACE_MS,
  NEARBY_WAR_PAUSE_MS,
  NEARBY_WAR_RADIUS,
  POPULATION_GROWTH_BASE_RATE,
  SEED_GRANARY_GROWTH_MULT,
  type DomainTileState
} from "@border-empires/game-domain";
import { buildFedTownKeys, hasSupportedStructure } from "./player-update-economy/player-update-economy.js";
import { firstThreeTownKeysForPlayer, firstThreeTownsPopulationGrowthMultiplierForPlayer } from "./economy-network/economy-network.js";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

export function seedGranaryGrowthMultForTile(input: {
  tile: DomainTileState;
  playerId: string;
  tiles: ReadonlyMap<string, DomainTileState>;
}): number {
  const hasGranary = hasSupportedStructure(input.playerId, input.tile, "GRANARY", input.tiles);
  const hasSeedGranary = hasSupportedStructure(input.playerId, input.tile, "SEED_GRANARY", input.tiles);
  if (!hasGranary && !hasSeedGranary) return 1;
  if (!hasSeedGranary) return 1.15;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = input.tiles.get(`${input.tile.x + dx},${input.tile.y + dy}`);
      if (
        neighbor?.ownerId === input.playerId &&
        neighbor.ownershipState === "SETTLED" &&
        neighbor.economicStructure?.type === "SEED_GRANARY" &&
        neighbor.economicStructure.status === "active"
      ) {
        return SEED_GRANARY_GROWTH_MULT;
      }
    }
  }
  return 1.15;
}

export function tickPopulationGrowth(input: {
  nowMs: number;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: Map<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  townLastGrowthTickAtByKey: Map<string, number>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  invalidateTileStringifyCache: (tileKey: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  invalidateEconomyCachesForPlayer: (playerId: string) => void;
  integrityGrowthMultForPlayer?: ((playerId: string) => number) | undefined;
}): {
  growthStalledNoFood: number;
  townsGrown: number;
  townsSkippedWar: number;
  townsSkippedCaptureShock: number;
  townsSkippedUnfed: number;
  townsSkippedLogisticCap: number;
  playersSkippedNoFedTowns: number;
  playerDiag: Map<string, { grown: number; stalledFood: number; war: number; shock: number; unfed: number; logisticCap: number; totalTowns: number }>;
} {
  const dirtyPlayerIds = new Set<string>();
  let growthStalledNoFood = 0;
  let townsGrown = 0;
  let townsSkippedWar = 0;
  let townsSkippedCaptureShock = 0;
  let townsSkippedUnfed = 0;
  let townsSkippedLogisticCap = 0;
  let playersSkippedNoFedTowns = 0;
  const playerDiag = new Map<string, { grown: number; stalledFood: number; war: number; shock: number; unfed: number; logisticCap: number; totalTowns: number }>();
  const attackCoords: number[] = [];
  const seenLockCommandIds = new Set<string>();
  for (const lock of input.locksByTile.values()) {
    if (seenLockCommandIds.has(lock.commandId)) continue;
    seenLockCommandIds.add(lock.commandId);
    if (lock.actionType !== "ATTACK") continue;
    for (const lockedKey of [lock.originKey, lock.targetKey]) {
      const comma = lockedKey.indexOf(",");
      if (comma > 0) {
        attackCoords.push(Number(lockedKey.slice(0, comma)), Number(lockedKey.slice(comma + 1)));
      }
    }
  }

  for (const player of input.players.values()) {
    if (player.id.startsWith("barbarian-")) continue;
    const summary = input.summaryForPlayer(player.id);
    const ownedTowns = summary.ownedTownTierByTile;
    if (ownedTowns.size === 0) continue;

    const fedTownKeys = buildFedTownKeys(
      player,
      summary,
      input.tiles,
      summary.strategicProductionPerMinute
    );
    if (fedTownKeys.size === 0) {
      playersSkippedNoFedTowns += 1;
      playerDiag.set(player.id, { grown: 0, stalledFood: 0, war: 0, shock: 0, unfed: ownedTowns.size, logisticCap: 0, totalTowns: ownedTowns.size });
      continue;
    }

    // Only compute first-three-town keys if the player has a domain that grants
    // firstThreeTownsPopulationGrowthMult. Without such a domain the multiplier
    // is 1.0 and the key set has no effect — skip the O(towns) sort entirely.
    const firstThreePopMult = firstThreeTownsPopulationGrowthMultiplierForPlayer(player);
    const firstThreeKeys = firstThreePopMult !== 1
      ? firstThreeTownKeysForPlayer(player.id, ownedTowns.keys())
      : new Set<string>();
    const integrityGrowthMult = input.integrityGrowthMultForPlayer?.(player.id) ?? 1;

    // Accumulate all tile deltas for this player and emit ONE batch event per
    // player instead of one per town. Reduces ~50 event pipeline calls to ~6.
    const playerTileDeltas: ReturnType<typeof input.tileDeltaFromState>[] = [];

    const pDiag = { grown: 0, stalledFood: 0, war: 0, shock: 0, unfed: 0, logisticCap: 0, totalTowns: 0 };
    let pHadEligibleTown = false;

    for (const tileKey of ownedTowns.keys()) {
      const tile = input.tiles.get(tileKey);
      if (!tile?.town || tile.ownershipState !== "SETTLED") continue;
      const town = tile.town;
      if (town.populationTier === "SETTLEMENT") continue;
      pDiag.totalTowns += 1;
      if (typeof town.captureShockUntil === "number" && town.captureShockUntil > input.nowMs) {
        pDiag.shock += 1;
        townsSkippedCaptureShock += 1;
        continue;
      }
      if (!fedTownKeys.has(tileKey)) {
        pDiag.unfed += 1;
        townsSkippedUnfed += 1;
        continue;
      }
      if (typeof town.population !== "number" || typeof town.maxPopulation !== "number") continue;

      let isNearActiveWar = false;
      for (let i = 0; i < attackCoords.length; i += 2) {
        if (
          Math.abs(tile.x - (attackCoords[i] as number)) <= NEARBY_WAR_RADIUS &&
          Math.abs(tile.y - (attackCoords[i + 1] as number)) <= NEARBY_WAR_RADIUS
        ) {
          isNearActiveWar = true;
          break;
        }
      }
      if (isNearActiveWar) {
        const pausedUntil = input.nowMs + NEARBY_WAR_PAUSE_MS;
        if ((town.nearbyWarPausedUntil ?? 0) < pausedUntil) {
          const updatedTown = { ...town, nearbyWarPausedUntil: pausedUntil, nearbyWarLastAt: input.nowMs };
          const updatedTile = { ...tile, town: updatedTown };
          input.tiles.set(tileKey, updatedTile);
          input.invalidateTileStringifyCache(tileKey);
          playerTileDeltas.push(input.tileDeltaFromState(updatedTile));
          dirtyPlayerIds.add(player.id);
        }
        input.townLastGrowthTickAtByKey.set(tileKey, input.nowMs);
        pDiag.war += 1;
        townsSkippedWar += 1;
        continue;
      }
      if (typeof town.nearbyWarPausedUntil === "number" && town.nearbyWarPausedUntil > input.nowMs) {
        input.townLastGrowthTickAtByKey.set(tileKey, input.nowMs);
        pDiag.war += 1;
        townsSkippedWar += 1;
        continue;
      }

      const logisticFactor = 1 - town.population / Math.max(1, town.maxPopulation);
      if (logisticFactor <= 0) {
        pDiag.logisticCap += 1;
        townsSkippedLogisticCap += 1;
        continue;
      }

      const granaryGrowthMult = seedGranaryGrowthMultForTile({ tile, playerId: player.id, tiles: input.tiles });
      const firstThreeMult = firstThreeKeys.has(tileKey) ? firstThreePopMult : 1;
      const hasLongPeace = !town.nearbyWarLastAt || input.nowMs - town.nearbyWarLastAt >= LONG_PEACE_MS;
      const longPeaceMult = hasLongPeace ? LONG_PEACE_GROWTH_MULT : 1;
      const lastTick = input.townLastGrowthTickAtByKey.get(tileKey) ?? input.nowMs;
      const elapsedMinutes = (input.nowMs - lastTick) / 60_000;
      if (elapsedMinutes <= 0) {
        input.townLastGrowthTickAtByKey.set(tileKey, input.nowMs);
        continue;
      }

      const growthPerMinute =
        town.population *
        POPULATION_GROWTH_BASE_RATE *
        granaryGrowthMult *
        firstThreeMult *
        longPeaceMult *
        integrityGrowthMult *
        logisticFactor;
      const growth = growthPerMinute * elapsedMinutes;
      if (growth <= 0) continue;

      const growthFoodCost = growth * GROWTH_FOOD_COST_PER_POP;
      const foodAvailable = player.strategicResources?.FOOD ?? 0;
      if (foodAvailable + 1e-6 < growthFoodCost) {
        input.townLastGrowthTickAtByKey.set(tileKey, input.nowMs);
        growthStalledNoFood += 1;
        pDiag.stalledFood += 1;
        pHadEligibleTown = true;
        continue;
      }
      if (player.strategicResources) {
        player.strategicResources.FOOD = (player.strategicResources.FOOD ?? 0) - growthFoodCost;
      }

      const newPopulation = Math.min(town.maxPopulation, town.population + growth);
      const { nearbyWarPausedUntil: _clearPause, ...townWithoutPause } = town;
      const updatedTown = { ...townWithoutPause, population: newPopulation };
      const updatedTile = { ...tile, town: updatedTown };
      input.tiles.set(tileKey, updatedTile);
      input.invalidateTileStringifyCache(tileKey);
      input.townLastGrowthTickAtByKey.set(tileKey, input.nowMs);
      playerTileDeltas.push(input.tileDeltaFromState(updatedTile));
      dirtyPlayerIds.add(player.id);
      pDiag.grown += 1;
      townsGrown += 1;
      pHadEligibleTown = true;
    }

    // Only record diagnostic for players where eligible towns existed but nothing grew.
    // Healthy players (all grew, or only skipped for war/shock/logistic cap) are excluded
    // to avoid allocating Map entries on every tick for every player.
    if (pHadEligibleTown && pDiag.grown === 0) {
      playerDiag.set(player.id, pDiag);
    }

    // Emit one batched event for all of this player's town changes this tick.
    if (playerTileDeltas.length > 0) {
      input.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `population-growth-tick:${player.id}:${input.nowMs}`,
        playerId: player.id,
        tileDeltas: playerTileDeltas
      });
    }
  }

  for (const playerId of dirtyPlayerIds) input.invalidateEconomyCachesForPlayer(playerId);
  return {
    growthStalledNoFood,
    townsGrown,
    townsSkippedWar,
    townsSkippedCaptureShock,
    townsSkippedUnfed,
    townsSkippedLogisticCap,
    playersSkippedNoFedTowns,
    playerDiag
  };
}
