import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { cloneAfcCampaignState } from "@border-empires/shared";

/** The current campaign configuration, never a grant log. Included in durable updates. */
export function afcPlayerStatePayload(player: DomainPlayer): Record<string, unknown> {
  if (player.afcUpgradeRuleset !== "afc-v1") return {};
  return {
    afcUpgradeRuleset: player.afcUpgradeRuleset,
    afcCoreTownKeys: [...(player.afcCoreTownKeys ?? [])],
    afcScarcityFoodSlots: player.afcScarcityFoodSlots ?? 0,
    afcCampaign: cloneAfcCampaignState(player.afcCampaign ?? {}),
    manpower: player.manpower,
    manpowerUpdatedAt: player.manpowerUpdatedAt,
    manpowerBanked: player.manpowerBanked ?? 0,
    waystationManpowerOverflow: player.waystationManpowerOverflow ?? 0
  };
}
export function afcInstallAllowed(playerId: string, tiles: Iterable<DomainTileState>): boolean {
  for (const tile of tiles) if (tile.ownerId === playerId && tile.afc?.ownerId === playerId && tile.afc.status === "active") return true;
  return false;
}
