import type { PlayerCombatSummary } from "@border-empires/sim-protocol";

export type ProtoPlayerCombatSummaryAck = {
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
  request: { player_id: string },
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
  playerId: string
): Promise<PlayerCombatSummary | undefined> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetPlayerCombatSummary RPC is unavailable"));
      return;
    }
    rpc({ player_id: playerId }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      const found = response.found ?? false;
      if (!found) {
        resolve(undefined);
        return;
      }
      resolve({
        techIds: response.tech_ids ?? response.techIds ?? [],
        domainIds: response.domain_ids ?? response.domainIds ?? [],
        weaponsFactoryCounts: {
          titanium: response.titanium_weapons_factory_count ?? response.titaniumWeaponsFactoryCount ?? 0,
          umbrite: response.umbrite_weapons_factory_count ?? response.umbriteWeaponsFactoryCount ?? 0
        }
      });
    });
  });
