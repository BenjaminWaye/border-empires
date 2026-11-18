import { townFoodSlotDemand } from "../client-town-food-demand/client-town-food-demand.js";
import { economyCommitmentsHtml, type EconomyCommitments } from "./client-economy-commitments.js";
import {
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
import { empireCoinIncome } from "../client-coin-income/client-coin-income.js";
import type { EconomyBreakdown, EconomyBucket, EconomyFocusKey } from "../client-economy-model.js";
import type { Tile } from "../client-types.js";

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
  commitments?: EconomyCommitments;
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
    if (tile.town && resource === "FOOD") add("Town support", townFoodSlotDemand(tile.town));
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
  const rows = [...buckets.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
  return reconcileOccupants(rows, args.resourceSlots.demand[resource]);
};

/** Label of the (negative) line for slots the server waived (e.g. Founding Concession, Treasury State). */
export const SLOT_WAIVER_LABEL = "Waived by upgrades";

// The rows above are counted from the tiles at each structure's base slot
// cost; the server's demand total also applies upgrade waivers this client
// can't see per tile. Show the difference as its own line so the "Used by"
// lines always add up to the demand in the row's headline (playtest: lines
// summed to 8 while the total said 6).
const reconcileOccupants = (rows: EconomyBucket[], demand: number): EconomyBucket[] => {
  if (!Number.isFinite(demand)) return rows;
  const gap = demand - rows.reduce((total, row) => total + row.amountPerMinute, 0);
  if (gap === 0) return rows;
  return [...rows, { label: gap < 0 ? SLOT_WAIVER_LABEL : "Other", amountPerMinute: gap, count: 1 }];
};

export const renderEconomyPanelHtml = (args: EconomyPanelArgs): string =>
  economyRowsFromPanelArgs(args, { slotSources: slotSourcesForResource, slotOccupants: slotOccupantsForResource, coinIncome: empireCoinIncome }) + economyCommitmentsHtml(args);
