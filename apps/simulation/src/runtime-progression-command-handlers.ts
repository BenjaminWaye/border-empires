import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { POPULATION_TOWN_MIN } from "@border-empires/game-domain";
import { isChosenTrickleResource, TOWN_TIER_UPGRADE_GOLD_COST, CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT } from "@border-empires/shared";
import {
  buildDomainUpdatePayload,
  buildTechUpdatePayload,
  chooseDomainForPlayer,
  chooseTechForPlayer,
  revealResourceCategoryForTech,
  type ChosenTrickleResource
} from "./tech-domain-bridge/tech-domain-bridge.js";
import { hasSupportedStructure } from "./economy-network/economy-network.js";
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
  // §5.4/user decision: a town tier upgrade permanently adds +1 FOOD slot
  // demand (townFoodSlotDemandForTier), so it needs a free FOOD slot at
  // upgrade time, same "global pool" check hasFreeResourceSlots uses for
  // BUILD_STRUCTURE (runtime-structure-command-handlers.ts).
  resourceSlotSupplyForPlayer: (playerId: string) => Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>;
  resourceSlotDemandForPlayer: (playerId: string) => Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>;
  // §23.2: a successful tech/domain choice can change a player's slot
  // waivers (fortTitaniumSlotWaiverCount etc), so the demand/dormancy caches
  // need dropping the same way a tile mutation would drop them.
  invalidateResourceSlotDemand: (playerId: string) => void;
  // A revealResource tech (e.g. Aetheric Resonance -> "crystal") only
  // unmasks the resource field on tiles as fresh deltas go out for them —
  // tiles already inside the player's vision before the tech finished never
  // get a delta, so they stay stale/masked until something else mutates
  // them. Re-broadcasts every already-visible tile whose raw resource type
  // maps to `category` so the client picks up the newly-revealed resource.
  resyncRevealedResourceTilesForPlayer: (playerId: string, category: string) => void;
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

function populationThresholdForTier(tier: "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS"): number {
  if (tier === "TOWN") return POPULATION_TOWN_MIN;
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
  if ((town.population ?? 0) < populationThresholdForTier(nextTier)) {
    rejectCommand(context, command, "UPGRADE_TOWN_TIER_INVALID", "population too low to upgrade");
    return;
  }
  // §5.4/user decision: every tier step (including the previously-free
  // SETTLEMENT->TOWN) now costs gold + 1 more permanent FOOD slot demand
  // (townFoodSlotDemandForTier), replacing the old FOOD-stockpile lump sum
  // (TIER_UPGRADE_FOOD_COST) now that FOOD has no stockpile to spend from.
  // Census Hall (tech-tree redesign): 25% cheaper town-tier upgrade cost for
  // the town it supports.
  const hasCensusHall = hasSupportedStructure(actor.id, tile, "CENSUS_HALL", context.tiles, false);
  const goldCost = Math.ceil(TOWN_TIER_UPGRADE_GOLD_COST[nextTier] * (hasCensusHall ? CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT : 1));
  if (actor.points < goldCost) {
    rejectCommand(context, command, "INSUFFICIENT_GOLD", `need ${goldCost} gold to upgrade to ${nextTier}`);
    return;
  }
  const freeFoodSlots = context.resourceSlotSupplyForPlayer(actor.id).FOOD - context.resourceSlotDemandForPlayer(actor.id).FOOD;
  if (freeFoodSlots < 1) {
    rejectCommand(context, command, "INSUFFICIENT_SLOT", "no free FOOD slot to support the larger town");
    return;
  }
  actor.points -= goldCost;
  const updatedTile = { ...tile, town: { ...town, populationTier: nextTier } };
  context.setTileState(tileKey, updatedTile);
  context.invalidateTileStringifyCache(tileKey);
  context.summaryForPlayer(actor.id).ownedTownTierByTile.set(tileKey, nextTier);
  context.invalidateEconomySnapshot(actor.id);
  context.invalidateTileYieldContext(actor.id);
  // §5.4: the extra permanent FOOD slot demand this upgrade just added
  // (townFoodSlotDemandForTier) can push one of the actor's outposts into
  // dormancy without touching that outpost's own tile — resyncVisionRadius
  // already re-derives every owned outpost's bonus from current dormancy
  // state (see resyncPlayerOutpostVisionBonuses), so it doubles as the
  // dormancy resync here even though nothing about the actor's base vision
  // radius itself changed.
  context.resyncVisionRadius(actor.id);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
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
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
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
  context.invalidateResourceSlotDemand(actor.id);
  // A tech can grant a gold/growth/vision-adjacent effect that
  // multiplicativeEffectForPlayer/additiveEffectForPlayer feed into the
  // cached per-player tile-yield economy context (dockGoldOutputMult,
  // connectedTownStepBonusAdd, etc.) — without invalidating it here the
  // cache keeps serving pre-purchase multipliers until something else
  // happens to invalidate it (e.g. a later tile mutation).
  context.invalidateEconomySnapshot(actor.id);
  context.invalidateTileYieldContext(actor.id);
  context.resyncVisionRadius(actor.id);
  const revealCategory = revealResourceCategoryForTech(techId);
  if (revealCategory) context.resyncRevealedResourceTilesForPlayer(actor.id, revealCategory);
  context.emitEvent({
    eventType: "TECH_UPDATE",
    commandId: command.commandId,
    playerId: command.playerId,
    payloadJson: JSON.stringify(
      buildTechUpdatePayload(actor, context.tiles.values(), { incomePerMinute: context.incomePerMinuteForPlayer(actor.id) })
    )
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
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
  context.invalidateResourceSlotDemand(actor.id);
  // Same reasoning as CHOOSE_TECH above: a domain (e.g. tier-1 Mercantile
  // Charter's firstThreeTownsGoldOutputMult/firstThreeTownsPopulationGrowthMult)
  // feeds the cached per-player tile-yield economy context. Without
  // invalidating it here, gold production and the town-overview modifiers
  // panel keep showing pre-purchase values until an unrelated tile mutation
  // happens to invalidate the cache.
  context.invalidateEconomySnapshot(actor.id);
  context.invalidateTileYieldContext(actor.id);
  context.resyncVisionRadius(actor.id);
  context.emitEvent({
    eventType: "DOMAIN_UPDATE",
    commandId: command.commandId,
    playerId: command.playerId,
    payloadJson: JSON.stringify(
      buildDomainUpdatePayload(actor, context.tiles.values(), { incomePerMinute: context.incomePerMinuteForPlayer(actor.id) })
    )
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
