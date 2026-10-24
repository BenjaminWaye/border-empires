import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { FORCED_ANCILLARIFICATION_COOLDOWN_MS, forcedAncillarificationQuote, capTownPopulationTier, townPopulationTierFromPopulation, SETTLEMENT_TO_TOWN_POPULATION_MIN } from "@border-empires/shared";
import type { AfcActiveCommandContext } from "../afc-specializations/afc-active-commands.js";
import { parseTilePayload } from "../runtime-command-parsers.js";
import { assignedTownKeyForSupportTile } from "../town-support-lookup.js";
import { grantOverflowManpower } from "../runtime-manpower-ceiling.js";

export function handleForcedAncillarification(context: AfcActiveCommandContext, command: CommandEnvelope): void {
  const { abilities } = context;
  const reject = (message: string): void => abilities.emitEvent({
    eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId,
    code: "FORCED_ANCILLARIFICATION_INVALID", message
  });
  const actor = abilities.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) return reject("invalid factory coordinates");
  const key = `${payload.x},${payload.y}`;
  const factory = abilities.tiles.get(key);
  const structure = factory?.economicStructure;
  if (!factory || factory.ownerId !== actor.id || factory.ownershipState !== "SETTLED" ||
      structure?.ownerId !== actor.id || structure.type !== "ANCILLARY_FACTORY" || structure.status !== "active") {
    return reject("select an active Ancillary Factory you own");
  }
  if ((structure.disabledUntil ?? 0) > abilities.now()) return reject("Ancillary Factory is temporarily disabled");
  if (abilities.isStructureDormant(actor.id, key, "economicStructure")) return reject("Ancillary Factory has no free resource slot");
  const townKey = factory.town ? key : assignedTownKeyForSupportTile(abilities.tiles, actor.id, factory.x, factory.y);
  const tile = townKey ? abilities.tiles.get(townKey) : undefined;
  if (!tile?.town || !townKey || tile.ownerId !== actor.id || tile.ownershipState !== "SETTLED" || tile.town.populationTier === "SETTLEMENT") {
    return reject("factory needs an owned, settled town");
  }
  const now = abilities.now();
  if ((tile.town.forcedAncillarificationCooldownUntil ?? 0) > now) return reject("this town is recovering from Forced Ancillarification");
  const quote = forcedAncillarificationQuote(tile.town.population ?? 0);
  if (!quote.available) return reject("must leave at least 10,000 residents in the town");
  // Settle the old economy before changing population or granting an immediate reserve.
  context.settleEconomy?.(actor);
  context.refreshManpower(actor);
  const updated = { ...tile, town: { ...tile.town,
    population: (tile.town.population ?? 0) - quote.populationCost,
    populationTier: capTownPopulationTier(townPopulationTierFromPopulation((tile.town.population ?? 0) - quote.populationCost, SETTLEMENT_TO_TOWN_POPULATION_MIN), tile.town.populationTier),
    forcedAncillarificationCooldownUntil: now + FORCED_ANCILLARIFICATION_COOLDOWN_MS
  } };
  abilities.replaceTileState(townKey, updated, command.commandId);
  grantOverflowManpower(actor, quote.manpower, context.playerManpowerCap(actor));
  abilities.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: actor.id,
    tileDeltas: [abilities.tileDeltaFromState(updated)] });
  abilities.emitEvent({ eventType: "DOMAIN_UPDATE", commandId: command.commandId, playerId: actor.id,
    payloadJson: JSON.stringify({ manpower: actor.manpower, manpowerUpdatedAt: actor.manpowerUpdatedAt,
      manpowerBanked: actor.manpowerBanked ?? 0, waystationManpowerOverflow: actor.waystationManpowerOverflow ?? 0 }) });
  context.emitPlayerStateUpdate(command);
  abilities.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: actor.id });
}
