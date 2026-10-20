import type { DomainPlayer } from "@border-empires/game-domain";

type AfcPlayerExport = Pick<DomainPlayer,
  "afcUpgradeRuleset" | "afcCoreTownKeys" | "afcScarcityFoodSlots" | "afcCampaign">;

/** Shared by durable exports and login/reconnect exports so their AFC rules cannot drift. */
export function afcPlayerExportFields(player: AfcPlayerExport): AfcPlayerExport {
  return {
    ...(player.afcUpgradeRuleset ? { afcUpgradeRuleset: player.afcUpgradeRuleset } : {}),
    ...(player.afcCoreTownKeys ? { afcCoreTownKeys: [...player.afcCoreTownKeys] } : {}),
    ...(player.afcScarcityFoodSlots ? { afcScarcityFoodSlots: player.afcScarcityFoodSlots } : {}),
    ...(player.afcCampaign ? { afcCampaign: structuredClone(player.afcCampaign) } : {})
  };
}
