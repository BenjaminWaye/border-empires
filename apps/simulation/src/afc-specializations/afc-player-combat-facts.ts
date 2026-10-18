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
