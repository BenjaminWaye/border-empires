import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  AIRPORT_BOMBARD_BASE_MISS_CHANCE,
  AIRPORT_BOMBARD_COOLDOWN_MS,
  AIRPORT_BOMBARD_CRYSTAL_COST,
  AIRPORT_BOMBARD_FORT_MISS_BONUS,
  AIRPORT_BOMBARD_GOLD_COST,
  AIRPORT_BOMBARD_MAX_MISS_CHANCE,
  AIRPORT_BOMBARD_RANGE,
  IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS,
  IMPERIAL_EXCHANGE_LEVY_CRYSTAL_COST,
  IMPERIAL_EXCHANGE_LEVY_SHARE,
  TERRAIN_SHAPING_COOLDOWN_MS,
  TERRAIN_SHAPING_CRYSTAL_COST,
  TERRAIN_SHAPING_GOLD_COST,
  WORLD_ENGINE_STRIKE_COOLDOWN_MS,
  WORLD_ENGINE_STRIKE_CRYSTAL_COST,
  WORLD_ENGINE_STRIKE_POPULATION_LOSS_RATIO
} from "@border-empires/game-domain";
import {
  parseAirportBombardPayload,
  parseImperialExchangeLevyPayload,
  parseTilePayload,
  parseWorldEngineStrikePayload
} from "./runtime-command-parsers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { EconomicStructureType } from "@border-empires/shared";
import type { SimulationTileWireDelta, StrategicResourceKey } from "./runtime-types.js";

export type RuntimeMapCommandContext = {
  players: Map<string, DomainPlayer>;
  tiles: Map<string, DomainTileState>;
  now: () => number;
  emitEvent: (event: SimulationEvent) => void;
  ownedLandWithinRange: (playerId: string, x: number, y: number, range: number) => boolean;
  pickReadyOwnedObservatoryForTarget: (playerId: string, targetX: number, targetY: number, now: number) => string | undefined;
  stampObservatoryCooldown: (tileKey: string, durationMs: number, now: number, commandId: string, playerId: string) => void;
  spendStrategicResource: (player: DomainPlayer, resource: StrategicResourceKey, amount: number) => boolean;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  bumpTerrainEpoch: () => void;
  isStructurePowered: (ownerId: string, tileKey: string, structureType: EconomicStructureType) => boolean;
  isTileShieldedByEnemyAegisDome: (actorId: string, targetX: number, targetY: number) => boolean;
  isTileBombardBlockedByRadar: (actorId: string, targetX: number, targetY: number) => boolean;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  getAbilityCooldownUntil: (playerId: string, abilityKey: string) => number;
  setAbilityCooldownUntil: (playerId: string, abilityKey: string, untilMs: number) => void;
  strategicResourceAmount: (player: DomainPlayer, resource: StrategicResourceKey) => number;
  addStrategicResource: (player: DomainPlayer, resource: StrategicResourceKey, amount: number) => void;
};

function rejectCommand(
  context: RuntimeMapCommandContext,
  command: CommandEnvelope,
  code: string,
  message: string
): void {
  context.emitEvent({
    eventType: "COMMAND_REJECTED",
    commandId: command.commandId,
    playerId: command.playerId,
    code,
    message
  });
}

export function handleCreateMountainCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!actor.techIds.has("terrain-engineering")) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "requires Terrain Engineering");
    return;
  }
  if (
    !target ||
    target.terrain !== "LAND" ||
    target.town ||
    target.dockId ||
    target.fort ||
    target.observatory ||
    target.siegeOutpost ||
    target.economicStructure
  ) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "cannot create mountain on this tile");
    return;
  }
  if (!context.ownedLandWithinRange(actor.id, target.x, target.y, 2)) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "target must be within 2 tiles of your land");
    return;
  }
  const now = context.now();
  const observatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, now);
  if (!observatoryKey) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "no ready observatory in range");
    return;
  }
  if (actor.points < TERRAIN_SHAPING_GOLD_COST || !context.spendStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "insufficient resources for create mountain");
    return;
  }
  actor.points -= TERRAIN_SHAPING_GOLD_COST;
  context.stampObservatoryCooldown(observatoryKey, TERRAIN_SHAPING_COOLDOWN_MS, now, command.commandId, command.playerId);
  const updatedTile: DomainTileState = {
    ...target,
    terrain: "MOUNTAIN",
    ownerId: undefined,
    ownershipState: undefined,
    sabotage: undefined,
    fort: undefined,
    observatory: undefined,
    siegeOutpost: undefined,
    economicStructure: undefined
  };
  context.replaceTileState(targetKey, updatedTile);
  context.bumpTerrainEpoch();
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
}

export function handleRemoveMountainCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!actor.techIds.has("terrain-engineering")) {
    rejectCommand(context, command, "REMOVE_MOUNTAIN_INVALID", "requires Terrain Engineering");
    return;
  }
  if (!target || target.terrain !== "MOUNTAIN") {
    rejectCommand(context, command, "REMOVE_MOUNTAIN_INVALID", "target must be mountain");
    return;
  }
  const now = context.now();
  const observatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, now);
  if (!observatoryKey) {
    rejectCommand(context, command, "REMOVE_MOUNTAIN_INVALID", "no ready observatory in range");
    return;
  }
  if (actor.points < TERRAIN_SHAPING_GOLD_COST || !context.spendStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) {
    rejectCommand(context, command, "REMOVE_MOUNTAIN_INVALID", "insufficient resources for remove mountain");
    return;
  }
  actor.points -= TERRAIN_SHAPING_GOLD_COST;
  context.stampObservatoryCooldown(observatoryKey, TERRAIN_SHAPING_COOLDOWN_MS, now, command.commandId, command.playerId);
  const updatedTile: DomainTileState = { ...target, terrain: "LAND" };
  context.replaceTileState(targetKey, updatedTile);
  context.bumpTerrainEpoch();
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
}

export function handleAirportBombardCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseAirportBombardPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const airportKey = simulationTileKey(payload.fromX, payload.fromY);
  const airport = context.tiles.get(airportKey);
  const airportStructure = airport?.economicStructure;
  if (
    !airport ||
    airport.ownerId !== actor.id ||
    !airportStructure ||
    airportStructure.ownerId !== actor.id ||
    airportStructure.type !== "AIRPORT" ||
    airportStructure.status !== "active"
  ) {
    rejectCommand(context, command, "AIRPORT_BOMBARD_INVALID", "select an active airport first");
    return;
  }
  if (Math.max(Math.abs(payload.toX - payload.fromX), Math.abs(payload.toY - payload.fromY)) > AIRPORT_BOMBARD_RANGE) {
    rejectCommand(context, command, "AIRPORT_BOMBARD_INVALID", "target must be within 30 tiles of the airport");
    return;
  }
  if (!context.isStructurePowered(actor.id, airportKey, "AIRPORT")) {
    rejectCommand(context, command, "AIRPORT_BOMBARD_INVALID", "airport requires a nearby Aether Tower");
    return;
  }
  const now = context.now();
  const bombardCooldownUntil = airportStructure.bombardCooldownUntil ?? 0;
  if (bombardCooldownUntil > now) {
    rejectCommand(context, command, "AIRPORT_BOMBARD_INVALID", "airport bombardment on cooldown");
    return;
  }
  if (context.isTileBombardBlockedByRadar(actor.id, payload.toX, payload.toY)) {
    rejectCommand(context, command, "AIRPORT_BOMBARD_INVALID", "blocked by a Resonance Grid");
    return;
  }
  if (actor.points < AIRPORT_BOMBARD_GOLD_COST) {
    rejectCommand(context, command, "AIRPORT_BOMBARD_INVALID", "insufficient gold for bombardment");
    return;
  }
  if (!context.spendStrategicResource(actor, "CRYSTAL", AIRPORT_BOMBARD_CRYSTAL_COST)) {
    rejectCommand(context, command, "AIRPORT_BOMBARD_INVALID", "insufficient CRYSTAL for bombardment");
    return;
  }
  actor.points -= AIRPORT_BOMBARD_GOLD_COST;
  const changedTiles: SimulationTileWireDelta[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const tileKey = simulationTileKey(payload.toX + dx, payload.toY + dy);
      const tile = context.tiles.get(tileKey);
      if (!tile || tile.terrain !== "LAND" || !tile.ownerId || tile.ownerId === actor.id || actor.allies.has(tile.ownerId)) continue;
      const missChance = Math.min(
        AIRPORT_BOMBARD_BASE_MISS_CHANCE + (tile.fort ? AIRPORT_BOMBARD_FORT_MISS_BONUS : 0),
        AIRPORT_BOMBARD_MAX_MISS_CHANCE
      );
      if (Math.random() < missChance) continue;
      const updatedTile: DomainTileState = {
        ...tile,
        ownerId: undefined,
        ownershipState: undefined,
        frontierDecayAt: undefined,
        frontierDecayKind: undefined
      };
      context.replaceTileState(tileKey, updatedTile, command.commandId);
      changedTiles.push(context.tileDeltaFromState(updatedTile));
    }
  }
  // Stamp cooldown on the airport tile and broadcast it
  const updatedAirport: DomainTileState = {
    ...airport,
    economicStructure: {
      ...airportStructure,
      bombardCooldownUntil: now + AIRPORT_BOMBARD_COOLDOWN_MS
    }
  };
  context.replaceTileState(airportKey, updatedAirport, command.commandId);
  changedTiles.push(context.tileDeltaFromState(updatedAirport));
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: changedTiles
  });
  context.emitPlayerMessage(command, {
    type: "PLAYER_UPDATE",
    points: actor.points,
    strategicResources: actor.strategicResources
  });
}

export function handleImperialExchangeLevyCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseImperialExchangeLevyPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const tileKey = simulationTileKey(payload.fromX, payload.fromY);
  const tile = context.tiles.get(tileKey);
  if (
    !tile ||
    tile.ownerId !== actor.id ||
    tile.economicStructure?.ownerId !== actor.id ||
    tile.economicStructure.type !== "IMPERIAL_EXCHANGE" ||
    tile.economicStructure.status !== "active"
  ) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "select an active Imperial Exchange");
    return;
  }
  if (!actor.techIds || !actor.techIds.has("exchange-levy")) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "requires Exchange Levy Writs research");
    return;
  }
  if (!context.isStructurePowered(actor.id, tileKey, "IMPERIAL_EXCHANGE")) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "Imperial Exchange requires a nearby Aether Tower");
    return;
  }
  const now = context.now();
  if (context.getAbilityCooldownUntil(actor.id, "imperial_exchange_levy") > now) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "ability on cooldown");
    return;
  }
  if (!context.spendStrategicResource(actor, "CRYSTAL", IMPERIAL_EXCHANGE_LEVY_CRYSTAL_COST)) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "insufficient CRYSTAL");
    return;
  }
  let totalTransferred = 0;
  for (const other of context.players.values()) {
    if (other.id === actor.id || actor.allies.has(other.id)) continue;
    const stock = context.strategicResourceAmount(other, payload.resource);
    const take = Math.floor(stock * IMPERIAL_EXCHANGE_LEVY_SHARE);
    if (take <= 0) continue;
    other.strategicResources = {
      ...(other.strategicResources ?? {}),
      [payload.resource]: Math.max(0, stock - take)
    };
    totalTransferred += take;
  }
  if (totalTransferred > 0) context.addStrategicResource(actor, payload.resource, totalTransferred);
  context.setAbilityCooldownUntil(actor.id, "imperial_exchange_levy", now + IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS);
}

export function handleWorldEngineStrikeCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseWorldEngineStrikePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const anchorKey = simulationTileKey(payload.fromX, payload.fromY);
  const anchor = context.tiles.get(anchorKey);
  if (
    !anchor ||
    anchor.ownerId !== actor.id ||
    anchor.economicStructure?.ownerId !== actor.id ||
    anchor.economicStructure.type !== "WORLD_ENGINE" ||
    anchor.economicStructure.status !== "active"
  ) {
    rejectCommand(context, command, "WORLD_ENGINE_STRIKE_INVALID", "select an active World Engine");
    return;
  }
  if (!actor.techIds || !actor.techIds.has("worldbreaker-fire")) {
    rejectCommand(context, command, "WORLD_ENGINE_STRIKE_INVALID", "requires Worldbreaker Fire research");
    return;
  }
  if (!context.isStructurePowered(actor.id, anchorKey, "WORLD_ENGINE")) {
    rejectCommand(context, command, "WORLD_ENGINE_STRIKE_INVALID", "World Engine requires a nearby Aether Tower");
    return;
  }
  const now = context.now();
  if (context.getAbilityCooldownUntil(actor.id, "world_engine_strike") > now) {
    rejectCommand(context, command, "WORLD_ENGINE_STRIKE_INVALID", "ability on cooldown");
    return;
  }
  const targetKey = simulationTileKey(payload.toX, payload.toY);
  if (context.isTileShieldedByEnemyAegisDome(actor.id, payload.toX, payload.toY)) {
    rejectCommand(context, command, "WORLD_ENGINE_STRIKE_INVALID", "blocked by an Aegis Dome");
    return;
  }
  if (!context.spendStrategicResource(actor, "CRYSTAL", WORLD_ENGINE_STRIKE_CRYSTAL_COST)) {
    rejectCommand(context, command, "WORLD_ENGINE_STRIKE_INVALID", "insufficient CRYSTAL");
    return;
  }
  const target = context.tiles.get(targetKey);
  if (target) {
    let updated: DomainTileState = target;
    if (target.economicStructure && target.economicStructure.ownerId !== actor.id) {
      updated = { ...updated, economicStructure: undefined };
    }
    if (target.town && (target.ownershipState === "SETTLED" || target.ownershipState === "FRONTIER") && target.ownerId !== actor.id) {
      const pop = typeof target.town.population === "number" ? target.town.population : 0;
      const loss = Math.floor(pop * WORLD_ENGINE_STRIKE_POPULATION_LOSS_RATIO);
      if (loss > 0) {
        const newPop = Math.max(1, pop - loss);
        const currentTier = updated.town!.populationTier;
        let nextTier = currentTier;
        if (currentTier !== "SETTLEMENT") {
          if (newPop >= 5_000_000) nextTier = "METROPOLIS";
          else if (newPop >= 1_000_000) nextTier = "GREAT_CITY";
          else if (newPop >= 100_000) nextTier = "CITY";
          else nextTier = "TOWN";
        }
        updated = { ...updated, town: { ...updated.town!, population: newPop, populationTier: nextTier } };
      }
    }
    if (updated !== target) {
      context.replaceTileState(targetKey, updated, command.commandId);
      context.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [context.tileDeltaFromState(updated)]
      });
    }
  }
  context.setAbilityCooldownUntil(actor.id, "world_engine_strike", now + WORLD_ENGINE_STRIKE_COOLDOWN_MS);
}
