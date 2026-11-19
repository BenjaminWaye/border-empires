// Frontier-resource reads shared by the runtime's economy and town-network
// contexts: developed site counts and the luxury biota allocation that both
// manpower and town coin scale by (biota-town-output.ts). Extracted so both
// context builders in runtime.ts share one definition.
import type { BiotaTownSupply, NetworkSiteCounts } from "@border-empires/shared";
import type { RuntimePlayer } from "../runtime-types.js";

export type FrontierSupplyAccessors = {
  networkSitesForPlayer: (id: string) => NetworkSiteCounts | undefined;
  biotaTownSupplyForPlayer: (id: string) => ReadonlyMap<string, BiotaTownSupply> | undefined;
};

export const frontierSupplyAccessors = (
  networkSites: (id: string) => NetworkSiteCounts | undefined,
  players: ReadonlyMap<string, RuntimePlayer>,
  manpowerBonus: (player: RuntimePlayer) => { biotaTownSupply?: ReadonlyMap<string, BiotaTownSupply> }
): FrontierSupplyAccessors => ({
  networkSitesForPlayer: networkSites,
  biotaTownSupplyForPlayer: (id) => {
    const player = players.get(id);
    return player ? manpowerBonus(player).biotaTownSupply : undefined;
  }
});
