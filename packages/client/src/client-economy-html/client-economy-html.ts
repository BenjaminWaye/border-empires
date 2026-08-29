import {
  townFoodSlotDemandForTier,
  structureSlotRequirements,
  RELAY_BEACON_FREE_FOOD_SLOT_COUNT,
  BASE_SLOTS_BY_TILE_RESOURCE,
  TILE_SLOT_BOOST_STRUCTURES,
  WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS,
  FOUNDRY_MINE_SLOT_BONUS,
  isSlotSourceConverter,
  converterModeOf,
  wrappedChebyshevDistance,
  type EmpireStorageCap,
  type SlotResource
} from "@border-empires/shared";
import { FOUNDRY_RADIUS, WATERWORKS_RADIUS } from "../client-structure-effects/client-structure-effects.js";
import { STRUCTURE_DISPLAY_NAMES } from "../client-structure-display-names.js";
import type { EconomyBreakdown, EconomyBucket, EconomyFocusKey, EconomyResourceKey } from "../client-economy-model.js";
import type { Tile } from "../client-types.js";

type EconomyResource = Exclude<EconomyFocusKey, "ALL">;
type EconomicStructureType = NonNullable<Tile["economicStructure"]>["type"];

// §5 (resource slots, docs/manpower-economy-rewrite-plan.md): FOOD/TITANIUM/CRYSTAL/
// UMBRITE stopped being stockpiled flows once Step 5 shipped — they're now
// discrete slot capacity, so this panel renders them with a slots-used mode
// instead of the stock/cap/income/upkeep flow mode. GOLD is the only resource
// left on the flow mode (§14.1 item 2 / §5.5) — SHARD is event-gated and isn't
// part of this panel's resource list at all.
const isSlotResource = (resource: EconomyResource): resource is SlotResource => resource !== "GOLD";

type EconomyPanelArgs = {
  focus: EconomyFocusKey;
  gold: number;
  me: string;
  incomePerMinute: number;
  strategicResources: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
  storageCap: EmpireStorageCap;
  strategicProductionPerMinute: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
  upkeepPerMinute: { food: number; titanium: number; umbrite: number; crystal: number; gold: number };
  upkeepLastTick: {
    foodCoverage?: number;
    gold?: { contributors?: EconomyBucket[] };
    food?: { contributors?: EconomyBucket[] };
    titanium?: { contributors?: EconomyBucket[] };
    crystal?: { contributors?: EconomyBucket[] };
    umbrite?: { contributors?: EconomyBucket[] };
  };
  activeRevealTargetsCount: number;
  tiles: Iterable<Tile>;
  economyBreakdown: EconomyBreakdown | undefined;
  isMobile: boolean;
  prettyToken: (value: string) => string;
  resourceIconForKey: (resource: string) => string;
  rateToneClass: (rate: number) => string;
  resourceLabel: (resource: string) => string;
  economicStructureName: (type: EconomicStructureType) => string;
  resourceSlots: { supply: Record<SlotResource, number>; demand: Record<SlotResource, number> };
  dormantStructures: Array<{ key: string; resources: SlotResource[] }>;
  // Same reveal gate as the toolbar ribbon (client-panel-html.ts's
  // strategicRibbonHtml): TITANIUM/CRYSTAL/UMBRITE must stay hidden here too
  // until the viewing player has researched the tech that reveals them.
  // GOLD/FOOD are never gated by this.
  isRevealed?: (key: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE") => boolean;
};

const resources: EconomyResource[] = ["GOLD", "FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"];

const FORT_VARIANT_LABEL: Record<NonNullable<Tile["fort"]>["variant"] & string, string> = {
  WOODEN_FORT: "Palisade",
  FORT: "Fort",
  TITANIUM_BASTION: "Titanium Bastion",
  THUNDER_BASTION: "Thunder Bastion"
};

const SIEGE_VARIANT_LABEL: Record<NonNullable<Tile["siegeOutpost"]>["variant"] & string, string> = {
  SIEGE_OUTPOST: "Siege Outpost",
  SIEGE_TOWER: "Siege Tower",
  DREAD_TOWER: "Dread Tower"
};

// §14.1 item 2 / §14.2: which structures/towns are occupying a slot of this
// resource right now, for the "Occupied by" column of the detail card. Reuses
// the same authoritative structureSlotRequirements table the server gates
// BUILD_STRUCTURE on, rather than re-deriving demand from scratch — this is a
// display-only grouping of that same table, not a second computation of it.
// §14.1: an occupant whose own field is dormant (no free slot of `resource`,
// per §5.4) still holds the slot count shown here — dormancy silences the
// structure's bonus, it doesn't free the slot — so this only tags the row
// with a warning rather than excluding it from the count.
const isDormantOccupant = (
  args: EconomyPanelArgs,
  tile: Tile,
  field: "fort" | "siegeOutpost" | "economicStructure",
  resource: SlotResource
): boolean => {
  if (tile.ownerId !== args.me) return false;
  const key = `${tile.x},${tile.y}:${field}`;
  return args.dormantStructures.find((entry) => entry.key === key)?.resources.includes(resource) ?? false;
};

const slotOccupantsForResource = (args: EconomyPanelArgs, resource: SlotResource): EconomyBucket[] => {
  const buckets = new Map<string, EconomyBucket>();
  const add = (label: string, count: number, dormant = false): void => {
    if (count <= 0) return;
    const current = buckets.get(label);
    if (current) {
      current.amountPerMinute += count;
      current.count += 1;
      if (dormant) current.dormantCount = (current.dormantCount ?? 0) + 1;
      return;
    }
    buckets.set(label, { label, amountPerMinute: count, count: 1, ...(dormant ? { dormantCount: 1 } : {}) });
  };
  // §23.2: the player's first RELAY_BEACON_FREE_FOOD_SLOT_COUNT outposts are
  // waived server-side (slot-waivers.ts) and never bill a FOOD slot — mirror
  // that here so this breakdown doesn't overcount vs. the demand total above it.
  let waivedRelayBeaconsRemaining = resource === "FOOD" ? RELAY_BEACON_FREE_FOOD_SLOT_COUNT : 0;
  for (const tile of args.tiles) {
    if (tile.ownerId !== args.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED") continue;
    if (tile.fogged) continue;
    if (tile.town && resource === "FOOD") add("Town support", townFoodSlotDemandForTier(tile.town.populationTier));
    if (tile.fort && tile.fort.status !== "removing") {
      const variant = tile.fort.variant ?? "FORT";
      const count = structureSlotRequirements(variant).find((r) => r.resource === resource)?.count ?? 0;
      add(FORT_VARIANT_LABEL[variant], count, isDormantOccupant(args, tile, "fort", resource));
    }
    if (tile.siegeOutpost && tile.siegeOutpost.status !== "removing") {
      const variant = tile.siegeOutpost.variant ?? "SIEGE_OUTPOST";
      const count = structureSlotRequirements(variant).find((r) => r.resource === resource)?.count ?? 0;
      add(SIEGE_VARIANT_LABEL[variant], count, isDormantOccupant(args, tile, "siegeOutpost", resource));
    }
    if (
      tile.economicStructure &&
      tile.economicStructure.status !== "removing" &&
      tile.economicStructure.status !== "inactive" &&
      // Mirrors buildDemandContributors (resource-slot-view.ts): a converter
      // in SYNTHESIZE/Refine mode is a slot SOURCE for its own family
      // resource (counted in slotSourcesForResource instead), not an
      // occupant — only count it here once it's flipped to EXCHANGE/Sell
      // Off mode and starts occupying the slot it used to supply.
      !isSlotSourceConverter(tile.economicStructure.type, converterModeOf(tile.economicStructure))
    ) {
      const type = tile.economicStructure.type;
      let count = structureSlotRequirements(type).find((r) => r.resource === resource)?.count ?? 0;
      if (type === "RELAY_BEACON" && resource === "FOOD" && waivedRelayBeaconsRemaining > 0) {
        waivedRelayBeaconsRemaining -= 1;
        count = 0;
      }
      add(args.economicStructureName(type), count, isDormantOccupant(args, tile, "economicStructure", resource));
    }
  }
  return [...buckets.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
};

// Mirrors resourceSlotSupplyForPlayer (apps/simulation/src/resource-slot-view/
// resource-slot-view.ts): base slots per owned settled resource tile, +1 for
// a same-tile boost structure (Farmstead/Mine/Umbrite Rig), +2 for a Farmstead
// within Waterworks radius or a Mine within Foundry radius, plus +1 per active
// SYNTHESIZE-mode converter of this resource. This is a client-side re-derivation
// (same tradeoff as slotOccupantsForResource above) and does NOT see
// domain/tech-effect supply grants (resourceSlotSupplyForPlayer's
// domainGrantedSupply argument is server-only) — any gap between this
// breakdown's total and the authoritative args.resourceSlots.supply is folded
// into a trailing "Other bonuses" row so the two never visibly disagree.
const isWithinRadiusOfActiveStructure = (
  tiles: Iterable<Tile>,
  ownerId: string,
  target: Tile,
  structureType: NonNullable<Tile["economicStructure"]>["type"],
  radius: number
): boolean => {
  for (const candidate of tiles) {
    const structure = candidate.economicStructure;
    if (!structure || structure.ownerId !== ownerId || structure.type !== structureType || structure.status !== "active") continue;
    if (wrappedChebyshevDistance(candidate.x, candidate.y, target.x, target.y) <= radius) return true;
  }
  return false;
};

const slotSourcesForResource = (args: EconomyPanelArgs, resource: SlotResource): EconomyBucket[] => {
  const buckets = new Map<string, EconomyBucket>();
  const add = (label: string, count: number): void => {
    if (count <= 0) return;
    const current = buckets.get(label);
    if (current) {
      current.amountPerMinute += count;
      current.count += 1;
      return;
    }
    buckets.set(label, { label, amountPerMinute: count, count: 1 });
  };
  const tiles = [...args.tiles];
  let total = 0;
  for (const tile of tiles) {
    if (tile.ownerId !== args.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED") continue;
    if (tile.fogged) continue;
    const structure = tile.economicStructure;
    const isActiveStructure = structure?.status === "active" && structure?.inactiveReason !== "manual";
    const structureType = isActiveStructure ? structure!.type : undefined;
    if (structureType && isSlotSourceConverter(structureType, converterModeOf(structure))) {
      for (const req of structureSlotRequirements(structureType)) {
        if (req.resource !== resource) continue;
        add(args.economicStructureName(structureType), req.count);
        total += req.count;
      }
    }
    if (!tile.resource) continue;
    const base = BASE_SLOTS_BY_TILE_RESOURCE[tile.resource as keyof typeof BASE_SLOTS_BY_TILE_RESOURCE];
    if (!base || base.slotResource !== resource) continue;
    let slots = base.baseSlots;
    const label = args.prettyToken(args.resourceLabel(tile.resource));
    const boostBlockedOnFish = structureType === "FARMSTEAD" && tile.resource !== "FARM";
    const boost = structureType && !boostBlockedOnFish ? TILE_SLOT_BOOST_STRUCTURES[structureType] : undefined;
    if (boost) slots += boost;
    if (structureType === "FARMSTEAD" && tile.resource === "FARM" && isWithinRadiusOfActiveStructure(tiles, args.me, tile, "WATERWORKS", WATERWORKS_RADIUS)) {
      slots += WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS;
    }
    if (structureType === "MINE" && isWithinRadiusOfActiveStructure(tiles, args.me, tile, "FOUNDRY", FOUNDRY_RADIUS)) {
      slots += FOUNDRY_MINE_SLOT_BONUS;
    }
    add(label, slots);
    total += slots;
  }
  const supply = args.resourceSlots.supply[resource];
  if (supply > total + 0.5) add("Other bonuses", supply - total);
  return [...buckets.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
};

const slotStatusLine = (supply: number, demand: number): { text: string; tone: number } => {
  if (supply <= 0) return { text: "No access to this resource yet", tone: -1 };
  if (demand > supply) return { text: `Short by ${demand - supply}`, tone: -1 };
  if (demand === supply) return { text: "Fully committed", tone: 0 };
  return { text: `${supply - demand} free`, tone: 1 };
};

const formatUpkeepSummary = (
  upkeep: EconomyPanelArgs["upkeepPerMinute"],
  resourceIconForKey: EconomyPanelArgs["resourceIconForKey"]
): string => {
  // §5/§12.1: FOOD/TITANIUM/CRYSTAL/UMBRITE stopped being stockpiled flows — their
  // upkeep is the slot occupancy shown in the per-resource cards, so only the
  // GOLD flow upkeep belongs in this summary line.
  const parts: string[] = [];
  if (upkeep.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${(upkeep.gold * 1440).toFixed(1)}/day`);
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
  if (resource === "TITANIUM") return upkeepPerMinute.titanium;
  if (resource === "CRYSTAL") return upkeepPerMinute.crystal;
  if (resource === "UMBRITE") return upkeepPerMinute.umbrite;
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

const upkeepBreakdownForResource = (
  args: EconomyPanelArgs,
  resource: EconomyResource
): { contributors?: EconomyBucket[] } | undefined => {
  if (resource === "GOLD") return args.upkeepLastTick.gold;
  if (resource === "FOOD") return args.upkeepLastTick.food;
  if (resource === "TITANIUM") return args.upkeepLastTick.titanium;
  if (resource === "CRYSTAL") return args.upkeepLastTick.crystal;
  if (resource === "UMBRITE") return args.upkeepLastTick.umbrite;
  return undefined;
};

// The server labels a structure-driven bucket (e.g. a converter's EXCHANGE-mode
// gold) with the raw persisted structure type (e.g. "CRYSTAL_SYNTHESIZER")
// rather than its display name, since that's the source-of-truth identifier.
// Only remap labels that are actually known structure types — other bucket
// labels ("Towns", "Docks", "Live empire income", etc.) aren't structure
// types and must pass through unchanged.
const withDisplayNames = (buckets: EconomyBucket[]): EconomyBucket[] =>
  buckets.map((bucket) =>
    bucket.label in STRUCTURE_DISPLAY_NAMES
      ? { ...bucket, label: STRUCTURE_DISPLAY_NAMES[bucket.label as EconomicStructureType]! }
      : bucket
  );

const economyDetailForResource = (args: EconomyPanelArgs, resource: EconomyResource): { sources: EconomyBucket[]; sinks: EconomyBucket[] } => {
  const sharedBreakdown = args.economyBreakdown?.[resource];
  if (sharedBreakdown) {
    return { sources: withDisplayNames(sharedBreakdown.sources), sinks: withDisplayNames(sharedBreakdown.sinks) };
  }
  const sources = new Map<string, EconomyBucket>();
  const sinks = new Map<string, EconomyBucket>();
  for (const tile of args.tiles) {
    if (tile.ownerId !== args.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED") continue;
    if (tile.fogged) continue;
    const amountPerMinute =
      resource === "GOLD"
        ? tile.yieldRate?.goldPerMinute ?? 0
        : Number(tile.yieldRate?.strategicPerDay?.[resource] ?? 0) / 1440;
    accumulateEconomyBucket(
      sources,
      economySourceLabelForTile(tile, resource, args.prettyToken, args.resourceLabel, args.economicStructureName),
      amountPerMinute
    );
  }
  for (const contributor of upkeepBreakdownForResource(args, resource)?.contributors ?? []) {
    accumulateEconomyBucket(sinks, contributor.label, contributor.amountPerMinute);
    if (contributor.note) setEconomyBucketNote(sinks, contributor.label, contributor.note);
  }
  const sourceBuckets = [...sources.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
  if (sourceBuckets.length === 0) {
    const gross =
      resource === "GOLD"
        ? args.incomePerMinute
        : args.strategicProductionPerMinute[resource];
    if (gross > 0.0001) {
      sourceBuckets.push({
        label: resource === "GOLD" ? "Live empire income" : `${args.prettyToken(resource)} production`,
        amountPerMinute: gross,
        count: 1,
        note: "Detailed source rows are still catching up on this session."
      });
    }
  }
  return {
    sources: sourceBuckets,
    sinks: [...sinks.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label))
  };
};

const formatCap = (cap: number): string => (cap >= 1000 ? `${(cap / 1000).toFixed(1)}k` : cap.toFixed(0));

const economySummaryCardHtml = (args: EconomyPanelArgs, resource: EconomyResource, selected: boolean): string => {
  const icon = args.resourceIconForKey(resource);
  const label = args.prettyToken(resource);
  const head = `<div class="economy-summary-head"><span>${icon}</span><strong>${label}</strong></div>`;
  if (isSlotResource(resource)) {
    const supply = args.resourceSlots.supply[resource];
    const demand = args.resourceSlots.demand[resource];
    const status = slotStatusLine(supply, demand);
    return `<button class="economy-summary-card${selected ? " is-active" : ""}" type="button" data-economy-focus="${resource}">
    ${head}
    <div class="economy-summary-stock">${demand}<span class="economy-summary-cap"> / ${supply} slots</span></div>
    <div class="economy-summary-rates">
      <span class="economy-rate ${args.rateToneClass(status.tone)}">${status.text}</span>
    </div>
  </button>`;
  }
  const stock = args.gold;
  const cap = args.storageCap.GOLD;
  const gross = args.incomePerMinute;
  const upkeep = resourceUpkeepPerMinute(resource, args.upkeepPerMinute);
  const net = resourceNetPerMinute(resource, args.incomePerMinute, args.strategicProductionPerMinute, args.upkeepPerMinute);
  return `<button class="economy-summary-card${selected ? " is-active" : ""}" type="button" data-economy-focus="${resource}">
    ${head}
    <div class="economy-summary-stock">${stock.toFixed(1)}<span class="economy-summary-cap"> / ${formatCap(cap)}</span></div>
    <div class="economy-summary-rates">
      <span>Gross ${(gross * 1440).toFixed(1)}/day</span>
      <span>Upkeep ${(upkeep * 1440).toFixed(1)}/day</span>
      <span class="economy-rate ${args.rateToneClass(net)}">Net ${net >= 0 ? "+" : ""}${(net * 1440).toFixed(1)}/day</span>
    </div>
  </button>`;
};

const economyBucketAmountLabel = (
  args: EconomyPanelArgs,
  bucket: EconomyBucket,
  resource: EconomyResource,
  positive: boolean
): string => {
  const prefix = positive ? "+" : "-";
  const perDay = bucket.amountPerMinute * 1440;
  if (bucket.resourceKey && bucket.resourceKey !== resource) {
    return `${prefix}${perDay.toFixed(1)} ${args.prettyToken(bucket.resourceKey)}/day`;
  }
  return `${prefix}${perDay.toFixed(1)}/day`;
};

export const renderEconomyPanelHtml = (args: EconomyPanelArgs): string => {
  const isResourceRevealed = (resource: EconomyResource): boolean =>
    resource === "GOLD" || !args.isRevealed || args.isRevealed(resource);
  const revealedResources = resources.filter(isResourceRevealed);
  const visibleResources = (
    args.isMobile ? [args.focus === "ALL" ? "GOLD" : args.focus] : args.focus === "ALL" ? resources : [args.focus]
  ).filter(isResourceRevealed);
  const totals = formatUpkeepSummary(args.upkeepPerMinute, args.resourceIconForKey);
  return `
    <div class="economy-panel">
      <div class="economy-summary-grid">
        ${revealedResources.map((resource) => economySummaryCardHtml(args, resource, resource === args.focus)).join("")}
      </div>
      ${totals ? `<div class="economy-overview-note">${args.isMobile ? "Tap a resource above to switch the breakdown." : totals}</div>` : args.isMobile ? `<div class="economy-overview-note">Tap a resource above to switch the breakdown.</div>` : ""}
      ${visibleResources
        .map((resource) => {
          const foodFootnote = resource === "FOOD" ? `<div class="economy-footnote">Food coverage ${Math.round((args.upkeepLastTick.foodCoverage ?? 1) * 100)}% · unfed towns stop producing until food support catches up.</div>` : "";
          if (isSlotResource(resource)) {
            const supply = args.resourceSlots.supply[resource];
            const demand = args.resourceSlots.demand[resource];
            const status = slotStatusLine(supply, demand);
            const occupants = slotOccupantsForResource(args, resource);
            const sources = slotSourcesForResource(args, resource);
            // §12.1: a slot resource's upkeep IS the slot occupancy, so the card
            // has no separate Upkeep column — instead it has two columns: where
            // the slots come from ("Slot Sources", mirroring GOLD's Income
            // Sources) and who occupies them ("Occupied by"). Any cross-resource
            // flow upkeep (e.g. a synthesizer's GOLD upkeep) is not repeated
            // here; it's on the GOLD card's own Upkeep column instead.
            return `<section class="economy-detail-card card">
            <div class="economy-detail-head">
              <div>
                <div class="economy-detail-kicker">${args.resourceIconForKey(resource)} ${args.prettyToken(resource)}</div>
                <strong>${demand} / ${supply} slots used</strong>
              </div>
              <div class="economy-rate ${args.rateToneClass(status.tone)}">${status.text}</div>
            </div>
            <div class="economy-detail-columns">
              <div class="economy-detail-column">
                <h4>Slot Sources</h4>
                ${sources.length > 0 ? sources.map((bucket) => `<div class="economy-line"><span>${bucket.label}${bucket.count > 1 ? ` · ${bucket.count}` : ""}</span><strong>+${bucket.amountPerMinute} slot${bucket.amountPerMinute === 1 ? "" : "s"}</strong></div>`).join("") : `<div class="economy-line muted"><span>No ${args.prettyToken(resource)} slots yet</span></div>`}
              </div>
              <div class="economy-detail-column">
                <h4>Occupied by</h4>
                ${occupants.length > 0 ? occupants.map((bucket) => `<div class="economy-line${bucket.dormantCount ? " is-dormant" : ""}"><span>${bucket.label}${bucket.dormantCount ? ` <small class="economy-dormant-flag">⚠ ${bucket.dormantCount > 1 ? `${bucket.dormantCount} dormant` : "dormant"}</small>` : ""}</span><strong>${bucket.amountPerMinute} slot${bucket.amountPerMinute === 1 ? "" : "s"}</strong></div>`).join("") : `<div class="economy-line muted"><span>No structures using a ${args.prettyToken(resource)} slot yet</span></div>`}
              </div>
            </div>
            ${foodFootnote}
          </section>`;
          }
          const detail = economyDetailForResource(args, resource);
          const net = resourceNetPerMinute(resource, args.incomePerMinute, args.strategicProductionPerMinute, args.upkeepPerMinute);
          const cap = args.storageCap.GOLD;
          return `<section class="economy-detail-card card">
            <div class="economy-detail-head">
              <div>
                <div class="economy-detail-kicker">${args.resourceIconForKey(resource)} ${args.prettyToken(resource)}</div>
                <strong>${args.gold.toFixed(1)} / ${formatCap(cap)} in reserve</strong>
              </div>
              <div class="economy-rate ${args.rateToneClass(net)}">${net >= 0 ? "+" : ""}${(net * 1440).toFixed(1)}/day</div>
            </div>
            <div class="economy-detail-columns">
              <div class="economy-detail-column">
                <h4>Income Sources</h4>
                ${detail.sources.length > 0 ? detail.sources.map((bucket) => `<div class="economy-line"><span>${bucket.label}${bucket.count > 1 ? ` · ${bucket.count}` : ""}${bucket.note ? `<small>${bucket.note}</small>` : ""}</span><strong>${economyBucketAmountLabel(args, bucket, resource, true)}</strong></div>`).join("") : '<div class="economy-line muted"><span>No current income</span></div>'}
              </div>
              <div class="economy-detail-column">
                <h4>Upkeep</h4>
                ${detail.sinks.length > 0 ? detail.sinks.map((bucket) => `<div class="economy-line is-negative"><span>${bucket.label}${bucket.count > 1 ? ` · ${bucket.count}` : ""}${bucket.note ? `<small>${bucket.note}</small>` : ""}</span><strong>${economyBucketAmountLabel(args, bucket, resource, false)}</strong></div>`).join("") : '<div class="economy-line muted"><span>No upkeep on this resource</span></div>'}
              </div>
            </div>
          </section>`;
        })
        .join("")}
    </div>
  `;
};
