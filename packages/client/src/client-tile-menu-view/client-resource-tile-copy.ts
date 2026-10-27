import { MANPOWER_REFILL_WINDOW_MS, BASE_SLOTS_BY_TILE_RESOURCE, RESOURCE_NETWORKS, isNetworkResource, isSiphonModeSabotage, type ResourceType } from "@border-empires/shared";
import type { TechInfo, Tile } from "../client-types.js";

type BaseResource = Exclude<ResourceType, keyof typeof RESOURCE_NETWORKS>;
const isBaseResource = (value: string): value is BaseResource =>
  value === "FARM" || value === "FISH" || value === "TITANIUM" || value === "GEMS" || value === "UMBRITE";
const DEPOSIT_DESCRIPTIONS: Readonly<Record<BaseResource, string>> = {
  FARM: "Fertile grainland supplies FOOD for towns, garrisons and industry. A Hydrogarden can increase its FOOD supply.",
  FISH: "Coastal fishing grounds supply FOOD for towns, garrisons and industry. Fishing supply comes from the claimed land tile; the fish offshore mark its fishing grounds.",
  TITANIUM: "Titanium ore provides metal for armour, construction and machinery. A Mine increases the site's Titanium supply.",
  GEMS: "Crystal deposits contain dormant, mineralised aether used by advanced industry and control systems. A Mine increases their Crystal supply. Crystal is distinct from Shards.",
  UMBRITE: "Umbrite deposits supply a strategic material for machinery and military equipment, including weapon rounds. An Umbrite Rig increases their Umbrite supply."
};

/** Public geology and potential benefits, never another House's private production. */
export function resourceTileDescriptionLines(tile: Tile, techCatalog: readonly Pick<TechInfo, "id" | "name">[] = []): readonly string[] {
  const resource = tile.resource;
  if (!resource) return [];
  if (!isNetworkResource(resource)) {
    if (!isBaseResource(resource)) return [];
    const slots = BASE_SLOTS_BY_TILE_RESOURCE[resource];
    return [DEPOSIT_DESCRIPTIONS[resource], ...(slots ? [
      `Base supply: ${slots.baseSlots} ${slots.slotResource === "CRYSTAL" ? "Crystal" : slots.slotResource === "TITANIUM" ? "Titanium" : slots.slotResource === "UMBRITE" ? "Umbrite" : "FOOD"} slot${slots.baseSlots === 1 ? "" : "s"} while owned and garrisoned. These are renewable supply slots, not a stockpile.`
    ] : [])];
  }
  const spec = RESOURCE_NETWORKS[resource];
  const structure = tile.economicStructure;
  const unlock = (techCatalog.find(tech => tech.id === spec.tech)?.name ?? "the matching Manifest")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const status = isSiphonModeSabotage(tile.sabotage) && tile.sabotage.ownerId !== tile.ownerId
    ? "Supply diverted by an active Siphon. A working extractor supplies the caster while the drain lasts, instead of its owner."
    : structure?.type !== spec.building
    ? `Develop this deposit with ${spec.buildingName} after unlocking ${unlock}. Claiming and garrisoning the deposit alone provides no industrial bonus.`
    : structure.status === "under_construction"
      ? `${spec.buildingName} under construction: supply starts after completion, while the site is owned, garrisoned, active and supplied with FOOD.`
      : `${spec.buildingName}: supplies one slot while owned, garrisoned, active, authorised by its Manifest and supplied with FOOD. Inactive or unpowered sites provide no supply.`;
  return [spec.description, `Potential benefit: ${spec.effect}${spec.batchBonus ? ` A production batch occurs every ${MANPOWER_REFILL_WINDOW_MS / 3_600_000} hours.` : ""}`, status,
    "Each working site reserves one renewable supply slot for one eligible building. Extra buildings need extra supply; trading the slot commits it to the other House."];
}
