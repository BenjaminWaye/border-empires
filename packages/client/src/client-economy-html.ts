import type { Tile } from "./client-types.js";

export type EconomyFocusKey = "ALL" | "GOLD" | "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";

type EconomyResource = Exclude<EconomyFocusKey, "ALL">;
type EconomicStructureType = NonNullable<Tile["economicStructure"]>["type"];

type EconomyBucket = {
  label: string;
  amountPerMinute: number;
  count: number;
  note?: string;
};

type EconomyPanelArgs = {
  focus: EconomyFocusKey;
  gold: number;
  me: string;
  incomePerMinute: number;
  strategicResources: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>;
  strategicProductionPerMinute: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>;
  upkeepPerMinute: { food: number; iron: number; supply: number; crystal: number; oil: number; gold: number };
  upkeepLastTick: { foodCoverage?: number };
  activeRevealTargetsCount: number;
  tiles: Iterable<Tile>;
  isMobile: boolean;
  prettyToken: (value: string) => string;
  resourceIconForKey: (resource: string) => string;
  rateToneClass: (rate: number) => string;
  resourceLabel: (resource: string) => string;
  economicStructureName: (type: EconomicStructureType) => string;
};

const resources: EconomyResource[] = ["GOLD", "FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"];

const formatUpkeepSummary = (
  upkeep: EconomyPanelArgs["upkeepPerMinute"],
  resourceIconForKey: EconomyPanelArgs["resourceIconForKey"]
): string => {
  const parts: string[] = [];
  if (upkeep.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${upkeep.food.toFixed(2)}/m`);
  if (upkeep.iron > 0.001) parts.push(`${resourceIconForKey("IRON")} ${upkeep.iron.toFixed(2)}/m`);
  if (upkeep.supply > 0.001) parts.push(`${resourceIconForKey("SUPPLY")} ${upkeep.supply.toFixed(2)}/m`);
  if (upkeep.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${upkeep.crystal.toFixed(2)}/m`);
  if (upkeep.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${upkeep.gold.toFixed(2)}/m`);
  return parts.length > 0 ? `Empire upkeep: ${parts.join("  ")}` : "";
};

const economySourceLabelForTile = (
  tile: Tile,
  resource: EconomyResource,
  prettyToken: EconomyPanelArgs["prettyToken"],
  resourceLabel: EconomyPanelArgs["resourceLabel"],
  economicStructureName: EconomyPanelArgs["economicStructureName"]
): string => {
  if (resource === "GOLD") {
    if (tile.town) return "Towns";
    if (tile.dockId) return "Docks";
    if (tile.resource) return `${prettyToken(resourceLabel(tile.resource))} sites`;
    return tile.economicStructure ? `${economicStructureName(tile.economicStructure.type)} tiles` : "Settled land";
  }
  if (resource === "SHARD") return tile.town ? "Ancient towns" : "Shard sites";
  if (tile.resource) return prettyToken(resourceLabel(tile.resource));
  if (tile.town && resource === "FOOD") return "Town support";
  return tile.economicStructure ? economicStructureName(tile.economicStructure.type) : "Empire effects";
};

const accumulateEconomyBucket = (map: Map<string, EconomyBucket>, label: string, amountPerMinute: number): void => {
  if (amountPerMinute <= 0.0001) return;
  const current = map.get(label);
  if (current) {
    current.amountPerMinute += amountPerMinute;
    current.count += 1;
    return;
  }
  map.set(label, { label, amountPerMinute, count: 1 });
};

const setEconomyBucketNote = (map: Map<string, EconomyBucket>, label: string, note: string): void => {
  const bucket = map.get(label);
  if (bucket) bucket.note = note;
};

const resourceUpkeepPerMinute = (resource: EconomyResource, upkeepPerMinute: EconomyPanelArgs["upkeepPerMinute"]): number => {
  if (resource === "GOLD") return upkeepPerMinute.gold;
  if (resource === "FOOD") return upkeepPerMinute.food;
  if (resource === "IRON") return upkeepPerMinute.iron;
  if (resource === "CRYSTAL") return upkeepPerMinute.crystal;
  if (resource === "SUPPLY") return upkeepPerMinute.supply;
  return 0;
};

const resourceNetPerMinute = (
  resource: EconomyResource,
  incomePerMinute: number,
  strategicProductionPerMinute: EconomyPanelArgs["strategicProductionPerMinute"],
  upkeepPerMinute: EconomyPanelArgs["upkeepPerMinute"]
): number => {
  if (resource === "GOLD") return incomePerMinute - upkeepPerMinute.gold;
  return strategicProductionPerMinute[resource] - resourceUpkeepPerMinute(resource, upkeepPerMinute);
};

const economyDetailForResource = (args: EconomyPanelArgs, resource: EconomyResource): { sources: EconomyBucket[]; sinks: EconomyBucket[] } => {
  const sources = new Map<string, EconomyBucket>();
  const sinks = new Map<string, EconomyBucket>();
  let settledTileCount = 0;
  let fortCount = 0;
  let outpostCount = 0;
  let observatoryCount = 0;
  for (const tile of args.tiles) {
    if (tile.ownerId !== args.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED") continue;
    if (tile.fogged) continue;
    settledTileCount += 1;
    const amountPerMinute =
      resource === "GOLD"
        ? tile.yieldRate?.goldPerMinute ?? 0
        : Number(tile.yieldRate?.strategicPerDay?.[resource] ?? 0) / 1440;
    accumulateEconomyBucket(
      sources,
      economySourceLabelForTile(tile, resource, args.prettyToken, args.resourceLabel, args.economicStructureName),
      amountPerMinute
    );
    if (resource === "FOOD" && tile.town?.foodUpkeepPerMinute) {
      accumulateEconomyBucket(sinks, "Town upkeep", tile.town.foodUpkeepPerMinute);
    }
    if (tile.fort?.ownerId === args.me && tile.fort.status === "active") fortCount += 1;
    if (tile.siegeOutpost?.ownerId === args.me && tile.siegeOutpost.status === "active") outpostCount += 1;
    if (tile.observatory?.ownerId === args.me && tile.observatory.status === "active") observatoryCount += 1;
  }
  if (resource === "GOLD") {
    const settledUpkeep = (settledTileCount / 40) * 0.1;
    const fortUpkeep = fortCount * 0.2;
    const outpostUpkeep = outpostCount * 0.2;
    accumulateEconomyBucket(sinks, "Settled land upkeep", settledUpkeep);
    accumulateEconomyBucket(sinks, "Fort upkeep", fortUpkeep);
    accumulateEconomyBucket(sinks, "Siege outpost upkeep", outpostUpkeep);
    if (settledTileCount > 0) setEconomyBucketNote(sinks, "Settled land upkeep", `${settledTileCount} settled tiles`);
    if (fortCount > 0) setEconomyBucketNote(sinks, "Fort upkeep", `${fortCount} active fort${fortCount === 1 ? "" : "s"}`);
    if (outpostCount > 0) setEconomyBucketNote(sinks, "Siege outpost upkeep", `${outpostCount} active outpost${outpostCount === 1 ? "" : "s"}`);
  } else if (resource === "CRYSTAL") {
    const revealUpkeep = Math.min(1, args.activeRevealTargetsCount) * 0.015;
    const observatoryUpkeep = observatoryCount * 0.025;
    accumulateEconomyBucket(sinks, "Empire reveal upkeep", revealUpkeep);
    accumulateEconomyBucket(sinks, "Observatory upkeep", observatoryUpkeep);
    if (args.activeRevealTargetsCount > 0) setEconomyBucketNote(sinks, "Empire reveal upkeep", `${Math.min(1, args.activeRevealTargetsCount)} active reveal`);
    if (observatoryCount > 0) setEconomyBucketNote(sinks, "Observatory upkeep", `${observatoryCount} active observator${observatoryCount === 1 ? "y" : "ies"}`);
  } else if (resource === "IRON") {
    const fortUpkeep = fortCount * 0.025;
    accumulateEconomyBucket(sinks, "Fort upkeep", fortUpkeep);
    if (fortCount > 0) setEconomyBucketNote(sinks, "Fort upkeep", `${fortCount} active fort${fortCount === 1 ? "" : "s"}`);
  } else if (resource === "SUPPLY") {
    const outpostUpkeep = outpostCount * 0.025;
    accumulateEconomyBucket(sinks, "Siege outpost upkeep", outpostUpkeep);
    if (outpostCount > 0) setEconomyBucketNote(sinks, "Siege outpost upkeep", `${outpostCount} active outpost${outpostCount === 1 ? "" : "s"}`);
  }
  const totalUpkeep = resourceUpkeepPerMinute(resource, args.upkeepPerMinute);
  const knownUpkeep = [...sinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0);
  const residualUpkeep = Math.max(0, totalUpkeep - knownUpkeep);
  if (residualUpkeep > 0.0001) {
    accumulateEconomyBucket(sinks, resource === "FOOD" ? "Other empire upkeep" : "Other upkeep modifiers", residualUpkeep);
  }
  return {
    sources: [...sources.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label)),
    sinks: [...sinks.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label))
  };
};

const economySummaryCardHtml = (args: EconomyPanelArgs, resource: EconomyResource, selected: boolean): string => {
  const stock = resource === "GOLD" ? args.gold : args.strategicResources[resource];
  const gross = resource === "GOLD" ? args.incomePerMinute : args.strategicProductionPerMinute[resource];
  const upkeep = resourceUpkeepPerMinute(resource, args.upkeepPerMinute);
  const net = resourceNetPerMinute(resource, args.incomePerMinute, args.strategicProductionPerMinute, args.upkeepPerMinute);
  const icon = args.resourceIconForKey(resource);
  const label = args.prettyToken(resource);
  return `<button class="economy-summary-card${selected ? " is-active" : ""}" type="button" data-economy-focus="${resource}">
    <div class="economy-summary-head"><span>${icon}</span><strong>${label}</strong></div>
    <div class="economy-summary-stock">${stock.toFixed(1)}</div>
    <div class="economy-summary-rates">
      <span>Gross ${gross.toFixed(2)}/m</span>
      <span>Upkeep ${upkeep.toFixed(2)}/m</span>
      <span class="economy-rate ${args.rateToneClass(net)}">Net ${net >= 0 ? "+" : ""}${net.toFixed(2)}/m</span>
    </div>
  </button>`;
};

export const renderEconomyPanelHtml = (args: EconomyPanelArgs): string => {
  const visibleResources = args.isMobile ? [args.focus === "ALL" ? "GOLD" : args.focus] : args.focus === "ALL" ? resources : [args.focus];
  const totals = formatUpkeepSummary(args.upkeepPerMinute, args.resourceIconForKey);
  return `
    <div class="economy-panel">
      <div class="economy-summary-grid">
        ${resources.map((resource) => economySummaryCardHtml(args, resource, resource === args.focus)).join("")}
      </div>
      ${totals ? `<div class="economy-overview-note">${args.isMobile ? "Tap a resource above to switch the breakdown." : totals}</div>` : args.isMobile ? `<div class="economy-overview-note">Tap a resource above to switch the breakdown.</div>` : ""}
      ${visibleResources
        .map((resource) => {
          const detail = economyDetailForResource(args, resource);
          const net = resourceNetPerMinute(resource, args.incomePerMinute, args.strategicProductionPerMinute, args.upkeepPerMinute);
          const stock = resource === "GOLD" ? args.gold : args.strategicResources[resource];
          return `<section class="economy-detail-card card">
            <div class="economy-detail-head">
              <div>
                <div class="economy-detail-kicker">${args.resourceIconForKey(resource)} ${args.prettyToken(resource)}</div>
                <strong>${stock.toFixed(1)} in reserve</strong>
              </div>
              <div class="economy-rate ${args.rateToneClass(net)}">${net >= 0 ? "+" : ""}${net.toFixed(2)}/m</div>
            </div>
            <div class="economy-detail-columns">
              <div class="economy-detail-column">
                <h4>Income Sources</h4>
                ${detail.sources.length > 0 ? detail.sources.map((bucket) => `<div class="economy-line"><span>${bucket.label}${bucket.count > 1 ? ` · ${bucket.count}` : ""}${bucket.note ? `<small>${bucket.note}</small>` : ""}</span><strong>+${bucket.amountPerMinute.toFixed(2)}/m</strong></div>`).join("") : '<div class="economy-line muted"><span>No current income</span></div>'}
              </div>
              <div class="economy-detail-column">
                <h4>Upkeep</h4>
                ${detail.sinks.length > 0 ? detail.sinks.map((bucket) => `<div class="economy-line is-negative"><span>${bucket.label}${bucket.count > 1 ? ` · ${bucket.count}` : ""}${bucket.note ? `<small>${bucket.note}</small>` : ""}</span><strong>-${bucket.amountPerMinute.toFixed(2)}/m</strong></div>`).join("") : '<div class="economy-line muted"><span>No upkeep on this resource</span></div>'}
              </div>
            </div>
            ${resource === "FOOD" ? `<div class="economy-footnote">Food coverage ${Math.round((args.upkeepLastTick.foodCoverage ?? 1) * 100)}% · unfed towns stop producing until food support catches up.</div>` : ""}
          </section>`;
        })
        .join("")}
    </div>
  `;
};
