import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  AETHER_BRIDGE_COOLDOWN_MS,
  AETHER_BRIDGE_DURATION_MS,
  AETHER_LANCE_COOLDOWN_MS,
  AETHER_WALL_COOLDOWN_MS,
  AETHER_WALL_DURATION_MS,
  REVEAL_EMPIRE_STATS_COOLDOWN_MS,
  SURVEY_SWEEP_COOLDOWN_MS,
  SURVEY_SWEEP_HALF_EXTENT
} from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, neighborTileKeys } from "@border-empires/shared";
import { parseAetherWallPayload, parseRevealPayload, parseTilePayload } from "./runtime-command-parsers.js";
import { isAlliedOrTruced } from "./runtime-player-factory.js";
import { attackAlertDisplayName } from "./runtime-frontier-command.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { multiplicativeEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type {
  ActiveAetherBridgeView,
  ActiveAetherWallView,
  AetherWallDirection,
  SimulationTileWireDelta
} from "./runtime-types.js";
import type { AetherWallSegment } from "./runtime-ability-helpers.js";

// Hidden Hand / Oracle State's observatoryCooldownMult scales every
// observatory-gated ability's cooldown (Reveal Empire Stats, Survey Sweep,
// Aether Lance, Aether Bridge, Aether Wall) uniformly.
const observatoryCooldownMsForActor = (actor: DomainPlayer, baseCooldownMs: number): number =>
  Math.round(baseCooldownMs * multiplicativeEffectForPlayer(actor, "observatoryCooldownMult"));

type SurveySweepPingKind = "resource" | "town";

type SurveySweepPing = {
  x: number;
  y: number;
  kind: SurveySweepPingKind;
};

export type RuntimeAbilityCommandContext = {
  players: Map<string, DomainPlayer>;
  tiles: Map<string, DomainTileState>;
  activeAetherBridgesByPlayer: Map<string, ActiveAetherBridgeView[]>;
  activeAetherWallsByPlayer: Map<string, ActiveAetherWallView[]>;
  now: () => number;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  revealTargetsForPlayer: (playerId: string) => Set<string>;
  revealCapacityForPlayer: (player: DomainPlayer) => number;
  spendStrategicResource: (player: DomainPlayer, resource: "CRYSTAL", amount: number) => boolean;
  pickReadyOwnedObservatoryAny: (playerId: string, now: number) => string | undefined;
  pickReadyOwnedObservatoryForTarget: (
    playerId: string,
    targetX: number,
    targetY: number,
    now: number
  ) => string | undefined;
  stampObservatoryCooldown: (
    tileKey: string,
    durationMs: number,
    now: number,
    commandId: string,
    playerId: string
  ) => void;
  buildRevealEmpireStats: (target: DomainPlayer) => Record<string, unknown>;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  filterTileDeltasForPlayer: (tileDeltas: SimulationTileWireDelta[], playerId: string) => SimulationTileWireDelta[];
  isTileShieldedByEnemyAegisDome: (actorId: string, targetX: number, targetY: number) => boolean;
  // §5.4: see pickReadyOwnedObservatoryForTarget/Any — Survey Sweep targets a
  // specific observatory tile directly rather than going through a picker, so
  // it needs its own dormancy gate.
  isStructureDormant: (playerId: string, tileKey: string, field: "observatory") => boolean;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  isCoastalLand: (x: number, y: number) => boolean;
  closestAetherBridgeOrigin: (playerId: string, targetX: number, targetY: number) => { x: number; y: number } | undefined;
  wallSegments: (originX: number, originY: number, direction: AetherWallDirection, length: 1 | 2 | 3) => AetherWallSegment[];
  activeAetherBridgesForPlayer: (playerId: string) => ActiveAetherBridgeView[];
  activeAetherWallsForPlayer: (playerId: string) => ActiveAetherWallView[];
  crossingBlockedByAetherWall: (fromX: number, fromY: number, toX: number, toY: number) => boolean;
  reachBorderOwnerAt: (x: number, y: number) => string | undefined;
  grantAetherBridgeReach: (playerId: string, x: number, y: number, commandId: string) => void;
  // Sweeps a purged tile's neighbors for other SETTLED ground of the previous
  // owner this purge just stranded outside their own live reach
  // (runtime-reach-stranded-sweep.ts) -- Aether Lance clears ownerId directly
  // via replaceTileState, bypassing the border/anchor machinery
  // settleOvertaken normally hooks this into. Optional, tests may omit it.
  strandedSettledSweep?: (seedTileKeys: readonly string[], ownerId: string, causeCommandId: string) => void;
};

function rejectCommand(
  context: RuntimeAbilityCommandContext,
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

function surveySweepPingKind(tile: DomainTileState): SurveySweepPingKind | undefined {
  if (tile.town) return "town";
  if (tile.resource === "GEMS" || tile.resource === "TITANIUM") return "resource";
  return undefined;
}

function buildSurveySweepPings(
  context: RuntimeAbilityCommandContext,
  playerId: string,
  centerX: number,
  centerY: number
): SurveySweepPing[] {
  const pings: SurveySweepPing[] = [];
  let scannedTiles = 0;
  let missingTiles = 0;
  let candidateKindTiles = 0;
  let filteredAsVisible = 0;
  for (let dy = -SURVEY_SWEEP_HALF_EXTENT; dy <= SURVEY_SWEEP_HALF_EXTENT; dy += 1) {
    const y = ((centerY + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
    for (let dx = -SURVEY_SWEEP_HALF_EXTENT; dx <= SURVEY_SWEEP_HALF_EXTENT; dx += 1) {
      const x = ((centerX + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      scannedTiles += 1;
      const tile = context.tiles.get(simulationTileKey(x, y));
      if (!tile) {
        missingTiles += 1;
        continue;
      }
      const kind = surveySweepPingKind(tile);
      if (!kind) continue;
      candidateKindTiles += 1;
      if (context.filterTileDeltasForPlayer([context.tileDeltaFromState(tile)], playerId).length > 0) {
        filteredAsVisible += 1;
        continue;
      }
      pings.push({ x, y, kind });
    }
  }
  console.log(
    `[survey-sweep-debug] server buildSurveySweepPings playerId=${playerId} center=(${centerX},${centerY}) scannedTiles=${scannedTiles} missingTiles=${missingTiles} candidateKindTiles=${candidateKindTiles} filteredAsVisible=${filteredAsVisible} finalPingCount=${pings.length}`
  );
  return pings.sort((left, right) => left.kind.localeCompare(right.kind) || left.y - right.y || left.x - right.x);
}

export function handleRevealEmpireCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseRevealPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  if (!actor.techIds.has("beacon-towers") && context.revealTargetsForPlayer(actor.id).size === 0) {
    rejectCommand(context, command, "REVEAL_EMPIRE_INVALID", "unlock reveal capability via tech/domain first");
    return;
  }
  if (payload.targetPlayerId === actor.id) {
    rejectCommand(context, command, "REVEAL_EMPIRE_INVALID", "cannot reveal yourself");
    return;
  }
  if (!context.players.has(payload.targetPlayerId) || isAlliedOrTruced(actor, payload.targetPlayerId)) {
    rejectCommand(context, command, "REVEAL_EMPIRE_INVALID", "target empire not found or not hostile");
    return;
  }
  const reveals = context.revealTargetsForPlayer(actor.id);
  if (reveals.has(payload.targetPlayerId)) {
    reveals.delete(payload.targetPlayerId);
  } else {
    if (context.revealCapacityForPlayer(actor) < 1 || reveals.size >= 1) {
      rejectCommand(context, command, "REVEAL_EMPIRE_INVALID", "only one revealed empire allowed");
      return;
    }
    reveals.clear();
    reveals.add(payload.targetPlayerId);
  }
  context.emitPlayerMessage(command, {
    type: "REVEAL_EMPIRE_UPDATE",
    activeTargets: [...reveals].sort(),
    revealCapacity: context.revealCapacityForPlayer(actor)
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

export function handleRevealEmpireStatsCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseRevealPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const target = context.players.get(payload.targetPlayerId);
  if (!actor.techIds.has("surveying")) {
    rejectCommand(context, command, "REVEAL_EMPIRE_STATS_INVALID", "requires Surveying");
    return;
  }
  if (!target || payload.targetPlayerId === actor.id || isAlliedOrTruced(actor, payload.targetPlayerId)) {
    rejectCommand(context, command, "REVEAL_EMPIRE_STATS_INVALID", "target empire not found or not hostile");
    return;
  }
  const revealNow = context.now();
  const revealObservatoryKey = context.pickReadyOwnedObservatoryAny(actor.id, revealNow);
  if (!revealObservatoryKey) {
    rejectCommand(context, command, "REVEAL_EMPIRE_STATS_INVALID", "no ready observatory available");
    return;
  }
  context.stampObservatoryCooldown(
    revealObservatoryKey,
    observatoryCooldownMsForActor(actor, REVEAL_EMPIRE_STATS_COOLDOWN_MS),
    revealNow,
    command.commandId,
    command.playerId
  );
  context.emitPlayerMessage(command, {
    type: "REVEAL_EMPIRE_STATS_RESULT",
    stats: context.buildRevealEmpireStats(target)
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

export function handleSurveySweepCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  if (!actor.techIds.has("surveying")) {
    rejectCommand(context, command, "SURVEY_SWEEP_INVALID", "requires Surveying");
    return;
  }
  const observatoryKey = simulationTileKey(payload.x, payload.y);
  const observatoryTile = context.tiles.get(observatoryKey);
  const observatory = observatoryTile?.observatory;
  if (
    !observatoryTile ||
    observatoryTile.ownerId !== actor.id ||
    observatoryTile.terrain !== "LAND" ||
    !observatory ||
    observatory.ownerId !== actor.id ||
    observatory.status !== "active"
  ) {
    rejectCommand(context, command, "SURVEY_SWEEP_INVALID", "target an active owned observatory");
    return;
  }
  const now = context.now();
  if ((observatory.cooldownUntil ?? 0) > now) {
    rejectCommand(context, command, "SURVEY_SWEEP_INVALID", "observatory is cooling down");
    return;
  }
  if (context.isStructureDormant(actor.id, observatoryKey, "observatory")) {
    rejectCommand(context, command, "SURVEY_SWEEP_INVALID", "observatory has no free resource slot");
    return;
  }
  const pings = buildSurveySweepPings(context, actor.id, observatoryTile.x, observatoryTile.y);
  context.stampObservatoryCooldown(observatoryKey, observatoryCooldownMsForActor(actor, SURVEY_SWEEP_COOLDOWN_MS), now, command.commandId, command.playerId);
  console.log(
    `[survey-sweep-debug] server emitting SURVEY_SWEEP_RESULT commandId=${command.commandId} playerId=${command.playerId} pingCount=${pings.length}`
  );
  context.emitPlayerMessage(command, {
    type: "SURVEY_SWEEP_RESULT",
    center: { x: observatoryTile.x, y: observatoryTile.y },
    halfExtent: SURVEY_SWEEP_HALF_EXTENT,
    pings
  });
  context.emitPlayerMessage(command, {
    type: "PLAYER_UPDATE",
    points: actor.points,
    strategicResources: actor.strategicResources
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

export function handleAetherLanceCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!actor.techIds.has("crystal-lattices")) {
    rejectCommand(context, command, "AETHER_LANCE_INVALID", "requires Aetheric Resonance");
    return;
  }
  const targetIsPurgeableOwnership = target?.ownershipState === "SETTLED" || target?.ownershipState === "FRONTIER";
  if (
    !target ||
    target.terrain !== "LAND" ||
    !target.ownerId ||
    target.ownerId === actor.id ||
    isAlliedOrTruced(actor, target.ownerId) ||
    !targetIsPurgeableOwnership
  ) {
    rejectCommand(context, command, "AETHER_LANCE_INVALID", "target hostile settled or frontier land");
    return;
  }
  if (context.isTileShieldedByEnemyAegisDome(actor.id, target.x, target.y)) {
    rejectCommand(context, command, "AETHER_LANCE_INVALID", "blocked by an Aegis Dome");
    return;
  }
  const lanceNow = context.now();
  const lanceObservatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, lanceNow);
  if (!lanceObservatoryKey) {
    rejectCommand(context, command, "AETHER_LANCE_INVALID", "no ready observatory in range");
    return;
  }
  context.stampObservatoryCooldown(
    lanceObservatoryKey,
    observatoryCooldownMsForActor(actor, AETHER_LANCE_COOLDOWN_MS),
    lanceNow,
    command.commandId,
    command.playerId
  );
  const hadMuster = Boolean(target.muster);
  const updatedTile: DomainTileState = {
    ...target,
    ownerId: undefined,
    ownershipState: undefined,
    frontierDecayAt: undefined,
    frontierDecayKind: undefined,
    // Purging ownership destroys any muster flag staged on the tile — the
    // accumulated manpower is lost, not refunded.
    muster: undefined
  };
  context.replaceTileState(targetKey, updatedTile, command.commandId);
  // Purged tile could be the previous owner's sole corridor to a SETTLED
  // pocket elsewhere -- see strandedSettledSweep's doc comment. Barbarian
  // land is environment, not a bordered empire (matches settleOvertaken's
  // own exemption), so it has no territory to strand.
  if (target.ownerId !== "barbarian-1") {
    context.strandedSettledSweep?.(neighborTileKeys(targetKey), target.ownerId, command.commandId);
  }
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  if (hadMuster) {
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `${command.commandId}:bc`,
      playerId: "__broadcast__",
      tileDeltas: [{ x: updatedTile.x, y: updatedTile.y, ownerId: updatedTile.ownerId, ownershipState: updatedTile.ownershipState, musterJson: "" }]
    });
  }
  // target.ownerId was checked non-empty and hostile (not the caster, not
  // allied/truced) above, so this always addresses a real defender.
  context.emitEvent({
    eventType: "PLAYER_MESSAGE",
    commandId: command.commandId,
    playerId: target.ownerId,
    messageType: "AETHER_PURGE_ALERT",
    payloadJson: JSON.stringify({
      type: "AETHER_PURGE_ALERT",
      attackerId: actor.id,
      attackerName: attackAlertDisplayName(actor.id, actor.name),
      x: target.x,
      y: target.y
    })
  });
  context.emitPlayerMessage(command, {
    type: "PLAYER_UPDATE",
    points: actor.points,
    strategicResources: actor.strategicResources
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

export function handleCastAetherBridgeCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const target = context.tiles.get(simulationTileKey(payload.x, payload.y));
  if (!actor.techIds.has("navigation")) {
    rejectCommand(context, command, "AETHER_BRIDGE_INVALID", "requires Aether Bridge");
    return;
  }
  if (!target || !context.isCoastalLand(target.x, target.y)) {
    rejectCommand(context, command, "AETHER_BRIDGE_INVALID", "target must be coastal land");
    return;
  }
  const origin = context.closestAetherBridgeOrigin(actor.id, target.x, target.y);
  if (!origin) {
    rejectCommand(context, command, "AETHER_BRIDGE_INVALID", "no settled coastal tile can reach this target");
    return;
  }
  const bridgeNow = context.now();
  const bridgeObservatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, bridgeNow);
  if (!bridgeObservatoryKey) {
    rejectCommand(context, command, "AETHER_BRIDGE_INVALID", "no ready observatory in range");
    return;
  }
  context.stampObservatoryCooldown(
    bridgeObservatoryKey,
    observatoryCooldownMsForActor(actor, AETHER_BRIDGE_COOLDOWN_MS),
    bridgeNow,
    command.commandId,
    command.playerId
  );
  const active = context.activeAetherBridgesForPlayer(actor.id);
  const startedAt = context.now();
  active.push({
    bridgeId: `${command.commandId}:bridge`,
    ownerId: actor.id,
    from: origin,
    to: { x: target.x, y: target.y },
    startedAt,
    endsAt: startedAt + AETHER_BRIDGE_DURATION_MS
  });
  context.activeAetherBridgesByPlayer.set(actor.id, active);
  // A bridge always opens the crossing itself (see isAetherBridgeCrossingTarget
  // in runtime.ts, consulted independently of reach), but only grants the
  // landing-tile reach bonus when it isn't landing inside a RIVAL player's
  // existing border -- otherwise casting a bridge into enemy territory would
  // let the caster colonize around it for free instead of just opening an
  // attack lane, which is the bridge's actual purpose there.
  const landingBorderOwner = context.reachBorderOwnerAt(target.x, target.y);
  if (!landingBorderOwner || landingBorderOwner === actor.id) {
    context.grantAetherBridgeReach(actor.id, target.x, target.y, command.commandId);
  }
  context.emitPlayerMessage(command, {
    type: "AETHER_BRIDGE_UPDATE",
    bridges: active
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

export function handleCastAetherWallCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseAetherWallPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  if (!actor.techIds.has("harborcraft")) {
    rejectCommand(context, command, "AETHER_WALL_INVALID", "requires Aether Moorings");
    return;
  }
  const wallNow = context.now();
  const wallObservatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, payload.x, payload.y, wallNow);
  if (!wallObservatoryKey) {
    rejectCommand(context, command, "AETHER_WALL_INVALID", "no ready observatory in range");
    return;
  }
  const segments = context.wallSegments(payload.x, payload.y, payload.direction, payload.length);
  for (const segment of segments) {
    const base = context.tiles.get(simulationTileKey(segment.baseX, segment.baseY));
    const outward = context.tiles.get(simulationTileKey(segment.toX, segment.toY));
    if (!base || base.terrain !== "LAND" || base.ownerId !== actor.id || base.ownershipState !== "SETTLED") {
      rejectCommand(context, command, "AETHER_WALL_INVALID", "wall must anchor on your settled land");
      return;
    }
    if (!outward || outward.terrain !== "LAND" || outward.ownerId === actor.id) {
      rejectCommand(context, command, "AETHER_WALL_INVALID", "wall must face passable land");
      return;
    }
    if (context.crossingBlockedByAetherWall(segment.fromX, segment.fromY, segment.toX, segment.toY)) {
      rejectCommand(context, command, "AETHER_WALL_INVALID", "that border already has an aether wall");
      return;
    }
  }
  context.stampObservatoryCooldown(
    wallObservatoryKey,
    observatoryCooldownMsForActor(actor, AETHER_WALL_COOLDOWN_MS),
    wallNow,
    command.commandId,
    command.playerId
  );
  const active = context.activeAetherWallsForPlayer(actor.id);
  const startedAt = context.now();
  active.push({
    wallId: `${command.commandId}:wall`,
    ownerId: actor.id,
    origin: { x: payload.x, y: payload.y },
    direction: payload.direction,
    length: payload.length,
    startedAt,
    endsAt: startedAt + AETHER_WALL_DURATION_MS
  });
  context.activeAetherWallsByPlayer.set(actor.id, active);
  context.emitPlayerMessage(command, {
    type: "AETHER_WALL_UPDATE",
    walls: active
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

export function handlePurgeSiphonCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  rejectCommand(context, command, "PURGE_SIPHON_INVALID", "siphons cannot be purged");
}
