import type { DomainPlayer } from "@border-empires/game-domain";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

type StealableResource = "IRON" | "CRYSTAL" | "SUPPLY" | "FOOD" | "OIL";
type SynthResource = "IRON" | "CRYSTAL" | "SUPPLY";

export type RuntimeResourceStealContext = {
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
};

const TILE_RESOURCE_TO_STRATEGIC: Record<string, StealableResource> = {
  IRON: "IRON",
  GEMS: "CRYSTAL",
  FUR: "SUPPLY",
  WOOD: "SUPPLY",
  FARM: "FOOD",
  FISH: "FOOD",
  OIL: "OIL"
};

const SYNTH_STRUCTURE_TO_STRATEGIC: Record<string, SynthResource> = {
  IRONWORKS: "IRON",
  ADVANCED_IRONWORKS: "IRON",
  CRYSTAL_SYNTHESIZER: "CRYSTAL",
  ADVANCED_CRYSTAL_SYNTHESIZER: "CRYSTAL",
  FUR_SYNTHESIZER: "SUPPLY",
  ADVANCED_FUR_SYNTHESIZER: "SUPPLY"
};

const PER_TILE_RATE_BY_RESOURCE: Record<StealableResource, number> = {
  IRON: 60 / 1440,
  CRYSTAL: 36 / 1440,
  SUPPLY: 60 / 1440,
  FOOD: 72 / 1440,
  OIL: 48 / 1440
};

export function stolenResourceForCapture(tileResource: string | undefined, structureType?: string): StealableResource | undefined {
  return (tileResource ? TILE_RESOURCE_TO_STRATEGIC[tileResource] : undefined)
    ?? (structureType ? SYNTH_STRUCTURE_TO_STRATEGIC[structureType] : undefined);
}

function equivalentResourceSourceCount(summary: PlayerRuntimeSummary, resource: StealableResource): number {
  const production = summary.strategicProductionPerMinute[resource] ?? 0;
  const perTileRate = PER_TILE_RATE_BY_RESOURCE[resource];
  const synthBonus = resource === "IRON" || resource === "CRYSTAL" || resource === "SUPPLY"
    ? (summary.synthesizerCapBonus[resource] ?? 0) / 30
    : 0;
  return Math.max(1, Math.round(production / perTileRate + synthBonus));
}

export function applyResourceTileSteal(
  context: RuntimeResourceStealContext,
  attacker: DomainPlayer,
  defender: DomainPlayer,
  tileResource: string | undefined,
  structureType?: string
): void {
  const resource = stolenResourceForCapture(tileResource, structureType);
  if (!resource) return;

  const defenderBalance = defender.strategicResources?.[resource] ?? 0;
  if (defenderBalance <= 0) return;

  const sourceCount = equivalentResourceSourceCount(context.summaryForPlayer(defender.id), resource);
  const stolen = defenderBalance / sourceCount;
  if (stolen <= 0.01) return;

  defender.strategicResources = { ...(defender.strategicResources ?? {}), [resource]: Math.max(0, defenderBalance - stolen) };
  attacker.strategicResources = { ...(attacker.strategicResources ?? {}), [resource]: ((attacker.strategicResources?.[resource] ?? 0) + stolen) };
}
