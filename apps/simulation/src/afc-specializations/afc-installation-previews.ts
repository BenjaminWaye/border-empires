import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { afcSpecializationProgress } from "@border-empires/shared";
import { techEntryById } from "../tech-domain-bridge/tech-domain-catalogs.js";
import { previewScarcityDelivery } from "./afc-installation-grants.js";
import { reconcileAfcCoreTowns } from "./afc-core-towns.js";

/** Small factual summaries, not full tile/deposit records. Selection revalidates them. */
export function afcInstallationPreviews(player: Pick<DomainPlayer, "id" | "techIds" | "domainIds" | "afcUpgradeRuleset" | "afcCoreTownKeys">, tiles: readonly DomainTileState[]): Record<string, string> {
  if (player.afcUpgradeRuleset !== "afc-v1") return {};
  const { choices } = afcSpecializationProgress(player, techEntryById.values());
  if (choices.includes("afc-exchequer-2")) {
    const preview = previewScarcityDelivery(player, tiles);
    return { "afc-exchequer-2": preview.fallback ? "No eligible unboosted deposit. Delivery supplies 1 permanent FOOD slot instead."
      : `Current delivery: ${preview.deliveries.length} finished boosting buildings on ${preview.resource} deposits. No Manifest required.` };
  }
  if (!choices.includes("afc-exchequer-5")) return {};
  const towns = tiles.filter(tile => tile.ownerId === player.id && tile.ownershipState === "SETTLED" && tile.town);
  const copy = { ...player, afcCoreTownKeys: [...(player.afcCoreTownKeys ?? [])] };
  const core = new Set(reconcileAfcCoreTowns(copy, towns.map(tile => [`${tile.x},${tile.y}`, tile.town!.populationTier])));
  let population = 0, count = 0;
  for (const tile of towns) {
    const town = tile.town!;
    if (!core.has(`${tile.x},${tile.y}`) || town.populationTier === "METROPOLIS" || typeof town.population !== "number" || typeof town.maxPopulation !== "number") continue;
    const gain = Math.max(0, Math.min(town.maxPopulation, Math.floor(town.population * 1.5)) - town.population);
    if (gain > 0) { population += gain; count += 1; }
  }
  return { "afc-exchequer-5": `Current consignment: +${population} population across ${count} core towns with headroom. Core Coin output doubles permanently.` };
}
