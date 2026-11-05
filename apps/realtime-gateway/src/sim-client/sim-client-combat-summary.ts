import { parseAfcCombatFacts, parseRelicCombatFacts } from "@border-empires/sim-protocol";
import type { PlayerCombatSummary } from "@border-empires/sim-protocol";

export type ProtoPlayerCombatSummaryAck = {
  afc_combat_facts_json?: string;
  afcCombatFactsJson?: string;
  relic_combat_facts_json?: string;
  relicCombatFactsJson?: string;
  ok: boolean;
  found?: boolean;
  tech_ids?: string[];
  techIds?: string[];
  domain_ids?: string[];
  domainIds?: string[];
  titanium_weapons_factory_count?: number;
  titaniumWeaponsFactoryCount?: number;
  umbrite_weapons_factory_count?: number;
  umbriteWeaponsFactoryCount?: number;
};

type GetPlayerCombatSummaryRpc = (
  request: { player_id: string; has_target?: boolean; target_x?: number; target_y?: number },
  callback: (error: Error | null, response: ProtoPlayerCombatSummaryAck) => void
) => void;

// Extracted out of sim-client.ts (which is over the 500-line file budget and
// may not grow further -- see AGENTS.md's file-and-type-discipline rule),
// mirroring sim-client-prepare-player.ts's callPrepareLikeRpc pattern.
// Backs the getPlayerCombatSummary fallback attack-preview.ts uses when a
// player has no live cached subscription snapshot (e.g. they are offline) --
// see player-combat-summary-snapshot.ts on the simulation side.
export const getPlayerCombatSummaryRpcCall = (
  rpc: GetPlayerCombatSummaryRpc | undefined,
  playerId: string,
  target?: { x: number; y: number }
): Promise<PlayerCombatSummary | undefined> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetPlayerCombatSummary RPC is unavailable"));
      return;
    }
    rpc({ player_id: playerId, ...(target ? { has_target: true, target_x: target.x, target_y: target.y } : {}) }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const found = response.found ?? false;
      if (!found) {
        resolve(undefined);
        return;
      }
      const facts = parseAfcCombatFacts(response.afc_combat_facts_json ?? response.afcCombatFactsJson);
      const relicFacts = parseRelicCombatFacts(response.relic_combat_facts_json ?? response.relicCombatFactsJson);
      resolve({
        ...(relicFacts ? { relicCombatFacts: relicFacts } : {}),
        ...(facts ? { afcCombatFacts: facts } : {}),
        techIds: response.tech_ids ?? response.techIds ?? [],
        domainIds: response.domain_ids ?? response.domainIds ?? [],
        weaponsFactoryCounts: {
          titanium: response.titanium_weapons_factory_count ?? response.titaniumWeaponsFactoryCount ?? 0,
          umbrite: response.umbrite_weapons_factory_count ?? response.umbriteWeaponsFactoryCount ?? 0
        }
      });
    });
  });
