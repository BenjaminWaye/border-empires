import { activeRelicTiles, fieldGeneratorForTarget, type RelicReadContext } from "../runtime-relics.js";
import { fortWardIsReady } from "./afc-battle-effects.js";
import type { PlayerCombatSummary } from "@border-empires/sim-protocol";
import type { DomainPlayer } from "@border-empires/game-domain";
import type { AfcCombatFacts } from "@border-empires/sim-protocol";
import { concentratedFactoryEquivalent, type WeaponsFactoryMultContext } from "../runtime-weapons-factory-mults.js";
import { coalitionAttackMult } from "./afc-coalition.js";

export function afcPlayerCombatFacts(player: DomainPlayer, players: ReadonlyMap<string, DomainPlayer>, context: WeaponsFactoryMultContext, now: number): AfcCombatFacts {
  return {
    factoryEquivalents: { titanium: concentratedFactoryEquivalent(context, player.id, "TITANIUM_WEAPONS_FACTORY"), umbrite: concentratedFactoryEquivalent(context, player.id, "UMBRITE_WEAPONS_FACTORY") },
    coalitionTargetIds: Object.entries(player.afcCampaign?.wars ?? {}).filter(([id, until]) => until > now && coalitionAttackMult(player, id, players, now) > 1).map(([id]) => id)
  };
}

interface CombatSummaryContext extends WeaponsFactoryMultContext {
  summaryForPlayer: RelicReadContext["summaryForPlayer"];
  tiles: RelicReadContext["tiles"];
  players: ReadonlyMap<string, DomainPlayer>;
  now: () => number;
  factoryCountsFor: (id: string) => { titanium: number; umbrite: number };
  isFortDormant: (id: string, key: string) => boolean;
}
export function buildPlayerCombatSummary(context: CombatSummaryContext, playerId: string, target?: { x: number; y: number }): PlayerCombatSummary | undefined {
  const player = context.players.get(playerId);
  if (!player) return undefined;
  const key = target ? `${target.x},${target.y}` : undefined;
  const tile = key ? context.tiles?.get(key) : undefined;
  return { techIds: [...player.techIds], domainIds: [...(player.domainIds ?? [])], weaponsFactoryCounts: context.factoryCountsFor(playerId),
    relicCombatFacts: { attackMultiplier: activeRelicTiles(context, playerId, "WARPRESS").length ? 1.5 : 1,
      defenseMultiplier: tile && fieldGeneratorForTarget(context, playerId, tile) ? 1.5 : 1,
      dockAttackMultiplier: player.wonderDockAttackMultiplier ?? 1 },
    afcCombatFacts: { ...afcPlayerCombatFacts(player, context.players, context, context.now()), ...(key ? { targetFortWardReady: Boolean(tile?.ownerId === playerId && !context.isFortDormant(playerId, key) && fortWardIsReady(context.players, tile, context.now())) } : {}) } };
}
