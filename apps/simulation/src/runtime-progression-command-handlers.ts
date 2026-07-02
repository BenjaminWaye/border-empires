import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { TIER_UPGRADE_FOOD_COST } from "@border-empires/game-domain";
import { isChosenTrickleResource } from "@border-empires/shared";
import {
  buildDomainUpdatePayload,
  buildTechUpdatePayload,
  chooseDomainForPlayer,
  chooseTechForPlayer,
  type ChosenTrickleResource
} from "./tech-domain-bridge/tech-domain-bridge.js";
import { parseTilePayload } from "./runtime-command-parsers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { SimulationTileWireDelta, StrategicResourceKey } from "./runtime-types.js";

type TownPopulationTier = NonNullable<DomainTileState["town"]>["populationTier"];
type UpgradeTownTier = Exclude<TownPopulationTier, "SETTLEMENT">;

export type RuntimeProgressionCommandContext = {
  players: Map<string, DomainPlayer>;
  tiles: Map<string, DomainTileState>;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">, playerId?: string) => void;
  spendStrategicResource: (player: DomainPlayer, resource: StrategicResourceKey, amount: number) => boolean;
  addStrategicResource: (player: DomainPlayer, resource: StrategicResourceKey, amount: number) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  setTileState: (tileKey: string, tile: DomainTileState) => void;
  invalidateTileStringifyCache: (tileKey: string) => void;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  invalidateEconomySnapshot: (playerId: string) => void;
  invalidateTileYieldContext: (playerId: string) => void;
  invalidateUpkeepAccrual: (playerId: string) => void;
  // Tech/domain choices can change a player's effective vision radius
  // (vision mods, visionRadiusBonus effects). Call after a successful choice
  // so the incremental visibility coverage cache stays correct — see
  // resyncVisionRadiusContribution in runtime.ts.
  resyncVisionRadius: (playerId: string) => void;
  incomePerMinuteForPlayer: (playerId: string) => number;
  decrementShardRainSiteCount: () => number;
  clearShardRainExpiry: () => void;
  clearLastShardRainHello: () => void;
  onShardCollected: (() => void) | undefined;
};

function rejectCommand(
  context: RuntimeProgressionCommandContext,
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

function nextTownTier(currentTier: TownPopulationTier): UpgradeTownTier | null {
  return currentTier === "SETTLEMENT" ? "TOWN" as const
    : currentTier === "TOWN" ? "CITY" as const
    : currentTier === "CITY" ? "GREAT_CITY" as const
    : currentTier === "GREAT_CITY" ? "METROPOLIS" as const
    : null;
}

function populationThresholdForTier(tier: "CITY" | "GREAT_CITY" | "METROPOLIS"): number {
  if (tier === "CITY") return 100_000;
  if (tier === "GREAT_CITY") return 1_000_000;
  return 5_000_000;
}

export function handleUpgradeTownTierCommand(context: RuntimeProgressionCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const tileKey = simulationTileKey(payload.x, payload.y);
  const tile = context.tiles.get(tileKey);
  if (!tile || tile.ownerId !== actor.id || tile.ownershipState !== "SETTLED" || !tile.town) {
    rejectCommand(context, command, "UPGRADE_TOWN_TIER_INVALID", "not your settled town");
    return;
  }
  const town = tile.town;
  const nextTier = nextTownTier(town.populationTier);
  if (!nextTier) {
    rejectCommand(context, command, "UPGRADE_TOWN_TIER_INVALID", "already at max tier");
    return;
  }
  if (nextTier !== "TOWN") {
    if ((town.population ?? 0) < populationThresholdForTier(nextTier)) {
      rejectCommand(context, command, "UPGRADE_TOWN_TIER_INVALID", "population too low to upgrade");
      return;
    }
    if (!context.spendStrategicResource(actor, "FOOD", TIER_UPGRADE_FOOD_COST[nextTier])) {
      rejectCommand(context, command, "UPGRADE_TOWN_TIER_INVALID", "insufficient FOOD");
      return;
    }
  }
  const updatedTile = { ...tile, town: { ...town, populationTier: nextTier } };
  context.setTileState(tileKey, updatedTile);
  context.invalidateTileStringifyCache(tileKey);
  context.summaryForPlayer(actor.id).ownedTownTierByTile.set(tileKey, nextTier);
  context.invalidateEconomySnapshot(actor.id);
  context.invalidateTileYieldContext(actor.id);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
}

export function handleCollectShardCommand(context: RuntimeProgressionCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  const amount = target?.shardSite?.amount ?? 0;
  if (!target || !target.shardSite || amount <= 0) {
    rejectCommand(context, command, "COLLECT_EMPTY", "no shard present");
    return;
  }
  if (
    target.ownerId !== command.playerId ||
    (target.ownershipState !== "FRONTIER" && target.ownershipState !== "SETTLED")
  ) {
    rejectCommand(context, command, "COLLECT_NOT_OWNED", "shard tile must be owned by you");
    return;
  }
  context.addStrategicResource(actor, "SHARD", amount);
  if (target.shardSite.kind === "FALL") {
    if (context.decrementShardRainSiteCount() === 0) {
      context.clearShardRainExpiry();
      context.clearLastShardRainHello();
    }
  } else {
    context.onShardCollected?.();
  }
  const updatedTile: DomainTileState = { ...target, shardSite: undefined };
  context.replaceTileState(targetKey, updatedTile);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [{ ...context.tileDeltaFromState(updatedTile), shardSiteJson: "" }]
  });
  context.emitEvent({
    eventType: "COLLECT_RESULT",
    commandId: command.commandId,
    playerId: command.playerId,
    mode: "tile",
    x: payload.x,
    y: payload.y,
    tiles: 1,
    gold: 0,
    strategic: { SHARD: amount }
  });
  context.emitPlayerStateUpdate(command);
}

export function handleChooseTechCommand(context: RuntimeProgressionCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  if (!actor) {
    rejectCommand(context, command, "BAD_COMMAND", "unknown player");
    return;
  }
  let techId = "";
  try {
    const parsed = JSON.parse(command.payloadJson) as { techId?: unknown };
    if (typeof parsed.techId === "string") techId = parsed.techId;
  } catch {
    techId = "";
  }
  if (!techId) {
    rejectCommand(context, command, "TECH_INVALID", "missing tech id");
    return;
  }
  const outcome = chooseTechForPlayer(actor, techId, context.tiles.values());
  if (!outcome.ok) {
    rejectCommand(context, command, "TECH_INVALID", outcome.reason);
    return;
  }
  context.invalidateUpkeepAccrual(actor.id);
  context.resyncVisionRadius(actor.id);
  context.emitEvent({
    eventType: "TECH_UPDATE",
    commandId: command.commandId,
    playerId: command.playerId,
    payloadJson: JSON.stringify(
      buildTechUpdatePayload(actor, context.tiles.values(), { incomePerMinute: context.incomePerMinuteForPlayer(actor.id) })
    )
  });
}

export function handleChooseDomainCommand(context: RuntimeProgressionCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  if (!actor) {
    rejectCommand(context, command, "BAD_COMMAND", "unknown player");
    return;
  }
  let domainId = "";
  let chosenTrickleResource: ChosenTrickleResource | undefined;
  try {
    const parsed = JSON.parse(command.payloadJson) as { domainId?: unknown; chosenTrickleResource?: unknown };
    if (typeof parsed.domainId === "string") domainId = parsed.domainId;
    if (isChosenTrickleResource(parsed.chosenTrickleResource)) {
      chosenTrickleResource = parsed.chosenTrickleResource;
    }
  } catch {
    domainId = "";
  }
  if (!domainId) {
    rejectCommand(context, command, "DOMAIN_INVALID", "missing domain id");
    return;
  }
  const outcome = chooseDomainForPlayer(
    actor,
    domainId,
    context.tiles.values(),
    chosenTrickleResource ? { chosenTrickleResource } : undefined
  );
  if (!outcome.ok) {
    rejectCommand(context, command, "DOMAIN_INVALID", outcome.reason);
    return;
  }
  context.invalidateUpkeepAccrual(actor.id);
  context.resyncVisionRadius(actor.id);
  context.emitEvent({
    eventType: "DOMAIN_UPDATE",
    commandId: command.commandId,
    playerId: command.playerId,
    payloadJson: JSON.stringify(
      buildDomainUpdatePayload(actor, context.tiles.values(), { incomePerMinute: context.incomePerMinuteForPlayer(actor.id) })
    )
  });
}
