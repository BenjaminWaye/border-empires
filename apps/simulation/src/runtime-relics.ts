import { grantOverflowManpower } from "./runtime-manpower-ceiling.js";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { consumeRelicUse, isRedesignedRelic, relicOperationalState, RELIC_RULES, RELIC_RESOURCE_CAPACITY, selectRelicResource, WORLD_WIDTH, WORLD_HEIGHT, type NaturalWonderType, type RelicResource } from "@border-empires/shared";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationTileWireDelta } from "./runtime-types.js";
import type { ResourceSlotTotals } from "./resource-slot-view/resource-slot-view.js";
import { hasRevealedResourceForPlayer } from "./tech-domain-bridge/tech-resource-reveal.js";

export interface RelicReadContext {
  tiles: ReadonlyMap<string, DomainTileState>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
}
export interface RelicMutationContext extends RelicReadContext {
  replaceTileState: (key: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
}

export function activeRelicTiles(context: RelicReadContext, playerId: string, type?: NaturalWonderType): DomainTileState[] {
  const result: DomainTileState[] = [];
  for (const key of context.summaryForPlayer(playerId).relicTileKeys ?? []) {
    const tile = context.tiles.get(key);
    if (tile?.ownerId !== playerId || tile.ownershipState !== "SETTLED" || !tile.naturalWonder || !isRedesignedRelic(tile.naturalWonder)) continue;
    if (type && tile.naturalWonder.type !== type) continue;
    if (relicOperationalState(tile.naturalWonder, true) === "active") result.push(tile);
  }
  return result;
}

export function fieldGeneratorForTarget(context: RelicReadContext, playerId: string, target: Pick<DomainTileState, "x" | "y" | "terrain" | "ownershipState" | "ownerId">): DomainTileState | undefined {
  if (target.ownerId !== playerId || target.terrain !== "LAND" || target.ownershipState !== "SETTLED") return undefined;
  return activeRelicTiles(context, playerId, "BASTION_FRAME").find(tile => {
    const dx = Math.abs(tile.x - target.x), dy = Math.abs(tile.y - target.y);
    return Math.min(dx, WORLD_WIDTH - dx) + Math.min(dy, WORLD_HEIGHT - dy) <= RELIC_RULES.fieldRadius;
  });
}

export function consumeRelicTile(context: RelicMutationContext, tile: DomainTileState, commandId?: string): void {
  if (!tile.naturalWonder) return;
  const consumed = consumeRelicUse(tile.naturalWonder);
  if (!consumed.consumed) return;
  const next = { ...tile, naturalWonder: consumed.state };
  context.replaceTileState(`${tile.x},${tile.y}`, next, commandId);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", tileDeltas: [context.tileDeltaFromState(next)], commandId: commandId ?? "relic-use", playerId: tile.ownerId ?? "" });
}

/** Called before a tile enters snapshot and economy caches. It never resets a saved reserve. */
export function activateRelic(tile: DomainTileState, player: DomainPlayer | undefined, now: number, manpowerCap: number, totals?: { supply: ResourceSlotTotals; demand: ResourceSlotTotals }): DomainTileState {
  const state = tile.naturalWonder;
  if (!state || !isRedesignedRelic(state) || !player || tile.ownerId !== player.id || tile.ownershipState !== "SETTLED") return tile;
  let next = state;
  if (state.activatedAt === undefined) next = { ...next, activatedAt: now };
  if (state.type === "CONSCRIPTION_ENGINE") {
    const consumed = consumeRelicUse(next);
    if (consumed.consumed) { grantOverflowManpower(player, 2000, manpowerCap); next = consumed.state; }
  }
  if (state.type === "FOUNDRY_HEART" && !state.resourceBonus && totals) {
    const resources: readonly RelicResource[] = ["TITANIUM", "CRYSTAL", "UMBRITE"];
    const revealed = new Set(resources.filter(r => hasRevealedResourceForPlayer(player, r === "CRYSTAL" ? "GEMS" : r)));
    const scarcity = Object.fromEntries(resources.map(r => [r, { supply: totals.supply[r], demand: totals.demand[r] }])) as Record<RelicResource, { supply: number; demand: number }>;
    // Stable site/first-activation draw: retries cannot reroll a scarce resource.
    const draw = ((Math.imul(tile.x + 1, 73856093) ^ Math.imul(tile.y + 1, 19349663) ^ (next.activatedAt ?? now)) >>> 0) / 4294967296;
    const resource = selectRelicResource(revealed, scarcity, draw);
    if (resource) next = { ...next, resourceBonus: { resource, amount: RELIC_RESOURCE_CAPACITY[resource] } };
  }
  return next === state ? tile : { ...tile, naturalWonder: next };
}

export function addRelicResourceSupply(context: RelicReadContext, player: DomainPlayer | undefined, totals: ResourceSlotTotals): void {
  if (!player) return;
  for (const tile of activeRelicTiles(context, player.id, "FOUNDRY_HEART")) {
    const bonus = tile.naturalWonder?.resourceBonus;
    if (bonus && hasRevealedResourceForPlayer(player, bonus.resource === "CRYSTAL" ? "GEMS" : bonus.resource)) totals[bonus.resource] += bonus.amount;
  }
}

export function consumeBattleRelics(context: RelicMutationContext, attackerId: string, target: DomainTileState | undefined, commandId: string): void {
  const suits = activeRelicTiles(context, attackerId, "WARPRESS")[0];
  if (suits) consumeRelicTile(context, suits, commandId);
  const field = target?.ownerId ? fieldGeneratorForTarget(context, target.ownerId, target) : undefined;
  if (field) consumeRelicTile(context, field, commandId);
}

/** A resource reveal can make a previously sealed reclamation line usable. */
export function activateUnallocatedFoundries(context: RelicMutationContext, player: DomainPlayer, now: number, totals: { supply: ResourceSlotTotals; demand: ResourceSlotTotals }): void {
  for (const tile of activeRelicTiles(context, player.id, "FOUNDRY_HEART")) {
    if (tile.naturalWonder?.resourceBonus) continue;
    const next = activateRelic(tile, player, now, 0, totals);
    if (next === tile) continue;
    context.replaceTileState(`${tile.x},${tile.y}`, next, "relic-resource-unlock");
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: "relic-resource-unlock", playerId: player.id, tileDeltas: [context.tileDeltaFromState(next)] });
  }
}
