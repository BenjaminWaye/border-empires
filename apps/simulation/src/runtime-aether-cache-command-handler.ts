import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { AETHER_CACHE_REVEAL_HALF_EXTENT } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

export type AetherCacheEffect = "FREE_BUILD" | "FREE_TECH" | "REVEAL_DEPOSIT";

export type RuntimeAetherCacheCommandContext = {
  players: Map<string, DomainPlayer>;
  tiles: Map<string, DomainTileState>;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">, playerId?: string) => void;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  filterTileDeltasForPlayer: (tileDeltas: SimulationTileWireDelta[], playerId: string) => SimulationTileWireDelta[];
  random?: () => number;
};

function rejectCommand(
  context: RuntimeAetherCacheCommandContext,
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

function rollAetherCacheEffect(random: () => number): AetherCacheEffect {
  const roll = Math.floor(random() * 3);
  if (roll <= 0) return "FREE_BUILD";
  if (roll === 1) return "FREE_TECH";
  return "REVEAL_DEPOSIT";
}

// Scans a bounded box around the player's first town for a resource deposit
// tile the player can't currently see, mirroring Survey Sweep's ping scan
// (runtime-ability-command-handlers.ts) but narrowed to a single nearest
// deposit rather than a full multi-ping sweep.
function findNearestHiddenResourceDeposit(
  context: RuntimeAetherCacheCommandContext,
  playerId: string,
  centerX: number,
  centerY: number
): DomainTileState | undefined {
  let nearest: DomainTileState | undefined;
  let nearestDistance = Infinity;
  for (let dy = -AETHER_CACHE_REVEAL_HALF_EXTENT; dy <= AETHER_CACHE_REVEAL_HALF_EXTENT; dy += 1) {
    const y = ((centerY + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
    for (let dx = -AETHER_CACHE_REVEAL_HALF_EXTENT; dx <= AETHER_CACHE_REVEAL_HALF_EXTENT; dx += 1) {
      const x = ((centerX + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      const tile = context.tiles.get(simulationTileKey(x, y));
      if (!tile || !tile.resource) continue;
      if (context.filterTileDeltasForPlayer([context.tileDeltaFromState(tile)], playerId).length > 0) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = tile;
      }
    }
  }
  return nearest;
}

export function handleOpenAetherCacheCommand(context: RuntimeAetherCacheCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  if (!actor) {
    rejectCommand(context, command, "UNKNOWN_PLAYER", "player not found");
    return;
  }
  const chargesRemaining = actor.aetherCacheCharges ?? 0;
  if (chargesRemaining <= 0) {
    rejectCommand(context, command, "AETHER_CACHE_INVALID", "no aether caches to open");
    return;
  }
  actor.aetherCacheCharges = chargesRemaining - 1;

  const random = context.random ?? Math.random;
  const effect = rollAetherCacheEffect(random);

  if (effect === "REVEAL_DEPOSIT") {
    const summary = context.summaryForPlayer(actor.id);
    const homeTileKey = [...summary.ownedTownTierByTile.keys()][0];
    const homeTile = homeTileKey ? context.tiles.get(homeTileKey) : undefined;
    const deposit = homeTile
      ? findNearestHiddenResourceDeposit(context, actor.id, homeTile.x, homeTile.y)
      : undefined;
    context.emitPlayerMessage(command, {
      type: "AETHER_CACHE_OPENED",
      effect,
      chargesRemaining: actor.aetherCacheCharges,
      ...(deposit ? { deposit: { x: deposit.x, y: deposit.y, resource: deposit.resource } } : {})
    });
  } else {
    actor.pendingAetherCacheEffect = effect;
    context.emitPlayerMessage(command, {
      type: "AETHER_CACHE_OPENED",
      effect,
      chargesRemaining: actor.aetherCacheCharges
    });
  }

  context.emitPlayerStateUpdate(command);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
