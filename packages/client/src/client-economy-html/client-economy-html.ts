import {
  townFoodSlotDemandForTier,
  structureSlotRequirements,
  RELAY_BEACON_FREE_FOOD_SLOT_COUNT,
  isSlotSourceConverter,
  converterModeOf,
  type EmpireStorageCap,
  type ResourceSlotSources,
  type SlotResource
} from "@border-empires/shared";
import { economyRowsFromPanelArgs } from "./client-economy-rows.js";
import { slotSourcesForResource, type SlotSourceNames } from "./client-economy-slot-sources.js";
import { STRUCTURE_DISPLAY_NAMES } from "../client-structure-display-names.js";
import type { EconomyBreakdown, EconomyBucket, EconomyFocusKey } from "../client-economy-model.js";
import type { Tile } from "../client-types.js";
import type { StructureInfoKey } from "../client-map-display.js";

type EconomyResource = Exclude<EconomyFocusKey, "ALL">;
type EconomicStructureType = NonNullable<Tile["economicStructure"]>["type"];

// Resource slots: FOOD/TITANIUM/CRYSTAL/
// UMBRITE stopped being stockpiled flows once Step 5 shipped — they're now
// discrete slot capacity, so this panel renders them with a slots-used mode
// instead of the stock/cap/income/upkeep flow mode. GOLD is the only resource
// left on the flow mode (§14.1 item 2 / §5.5).
export type EconomyPanelArgs = {
  focus: EconomyFocusKey;
  gold: number;
  me: string;
  /** Relays that need no FOOD slot (Relay Fabrication Line raises the built-in allowance). */
  freeRelayBeaconCount?: number;
  incomePerMinute: number;
  strategicResources: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>;
  storageCap: EmpireStorageCap;
  strategicProductionPerMinute: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>;
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
  prettyToken: (value: string) => string;
  resourceIconHtml: (resource: string) => string;
  rateToneClass: (rate: number) => string;
  resourceLabel: (resource: string) => string;
  economicStructureName: (type: EconomicStructureType) => string;
  resourceSlots: { supply: Record<SlotResource, number>; demand: Record<SlotResource, number>; sources?: ResourceSlotSources; bonusSupply?: import("@border-empires/shared").NetworkSupplyStatus };
  dormantStructures: Array<{ key: string; resources: SlotResource[] }>;
  /** Names for the upgrade / player ids in resourceSlots.sources. */
  slotSourceNames?: SlotSourceNames;
  // Same reveal gate as the toolbar ribbon (client-panel-html.ts's
  // strategicRibbonHtml): TITANIUM/CRYSTAL/UMBRITE must stay hidden here too
  // until the viewing player has researched the tech that reveals them.
  // GOLD/FOOD are never gated by this.
  isRevealed?: (key: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE") => boolean;
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
  field: "fort" | "siegeBattery" | "economicStructure" | "observatory",
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
  // §23.2: the player's first freeRelayBeaconCount outposts are
  // waived server-side (slot-waivers.ts) and never bill a FOOD slot — mirror
  // that here so this breakdown doesn't overcount vs. the demand total above it.
  let waivedRelayBeaconsRemaining = resource === "FOOD" ? args.freeRelayBeaconCount ?? RELAY_BEACON_FREE_FOOD_SLOT_COUNT : 0;
  for (const tile of args.tiles) {
    if (tile.ownerId !== args.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED") continue;
    if (tile.fogged) continue;
    if (tile.town && resource === "FOOD") add("Town support", townFoodSlotDemandForTier(tile.town.populationTier));
    if (tile.fort && tile.fort.status !== "removing") {
      const variant = tile.fort.variant ?? "FORT";
      const count = structureSlotRequirements(variant).find((r) => r.resource === resource)?.count ?? 0;
      add(STRUCTURE_DISPLAY_NAMES[variant], count, isDormantOccupant(args, tile, "fort", resource));
    }
    if (tile.siegeBattery && tile.siegeBattery.status !== "removing") {
      const variant = tile.siegeBattery.variant ?? "SIEGE_BATTERY";
      const count = structureSlotRequirements(variant).find((r) => r.resource === resource)?.count ?? 0;
      add(STRUCTURE_DISPLAY_NAMES[variant], count, isDormantOccupant(args, tile, "siegeBattery", resource));
    }
    if (tile.observatory && tile.observatory.status !== "removing" && tile.observatory.status !== "inactive") {
      const count = structureSlotRequirements("OBSERVATORY").find((r) => r.resource === resource)?.count ?? 0;
      add(STRUCTURE_DISPLAY_NAMES.OBSERVATORY, count, isDormantOccupant(args, tile, "observatory", resource));
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
    return tile.economicStructure ? `${economicStructureName(tile.economicStructure.type)} tiles` : "Garrisoned land";
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
// gold) with the raw persisted structure type (e.g. "AETHER_CONDENSER")
// rather than its display name, since that's the source-of-truth identifier.
// Only remap labels that are actually known structure types — other bucket
// labels ("Towns", "Docks", "Live empire income", etc.) aren't structure
// types and must pass through unchanged.
const withDisplayNames = (buckets: EconomyBucket[]): EconomyBucket[] =>
  buckets.map((bucket) =>
    bucket.label in STRUCTURE_DISPLAY_NAMES
      ? { ...bucket, label: STRUCTURE_DISPLAY_NAMES[bucket.label as EconomicStructureType | StructureInfoKey]! }
      : bucket
  );

// The currency key stays "GOLD" internally; players see it as "Coin".
const economyResourceName = (args: EconomyPanelArgs, resource: string): string =>
  resource === "GOLD" ? "Coin" : args.prettyToken(resource);

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
    // Tiles only carry a gold rate; strategic production is slot-based and
    // falls through to the empire-wide gross bucket below.
    const amountPerMinute = resource === "GOLD" ? tile.yieldRate?.goldPerMinute ?? 0 : 0;
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
        label: resource === "GOLD" ? "Live empire income" : `${economyResourceName(args, resource)} production`,
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

export const renderEconomyPanelHtml = (args: EconomyPanelArgs): string =>
  economyRowsFromPanelArgs(args, { slotSources: slotSourcesForResource, slotOccupants: slotOccupantsForResource, coinDetail: economyDetailForResource });
