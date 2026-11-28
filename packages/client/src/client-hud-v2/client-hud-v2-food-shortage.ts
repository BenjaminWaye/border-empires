// "Short 5 FOOD" in the tracker's Next step section (playtest 2026-11-19: the predator persona had 8 FOOD
// used against 3 produced, Fortify stayed blocked, one Farm Plot only moved him from -6 to -5, and he gave
// up). One clickable header while FOOD demand is above supply; it unfolds into the fixes, cheapest first:
//   1. garrison grain or fish you already hold as a frontier claim;
//   2. expand to the nearest known grain or fish inside your reach (where you can garrison it);
//   3. outside your reach, a Relay Beacon toward it (owner call 2026-11-20), placement starting nearest it;
//   4. with no food known nearby, send the scout drone from your AFC;
//   5. queue Farm Plots in the closest town with free plots (150 MP, +1 FOOD each).
// Guidance only: rows 1, 2 and 4 focus a tile whose own menu has the action; row 3 opens the normal beacon
// placement; row 5 queues through the normal build path (client-hud-v2-food-plots.ts), which waits for a
// Dev slot and is checked again by the server.
import {
  AGRICULTURE_FISH_FOOD_SLOT_BONUS,
  BASE_SLOTS_BY_TILE_RESOURCE,
  FARM_PLOT_FOOD_SLOT_SUPPLY,
  FARM_PLOT_UPGRADE_TECH_ID,
  structureCostDefinition
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { freeSlotsOf } from "../client-tile-action-logic/client-resource-slot-reason.js";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import { hasFreeResourceSlotsForRelayBeacon } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { relayBeaconManpowerCostForState } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import { hasRelayBeaconBuildTile } from "../client-relay-beacon-site/client-relay-beacon-site.js";
import { structureManpowerCostForState } from "../client-structure-manpower-cost/client-structure-manpower-cost.js";
import { townIdentityForTile } from "../client-town-identity.js";
import { townBuildPlots } from "./client-hud-v2-town-plots.js";
import "./client-hud-v2-food-fix.css";

/** Known grain or fish further than this from home doesn't count as "nearby": the drone row shows instead. */
export const FOOD_NEARBY_TILES = 15;

type Site = { x: number; y: number };
type FoodSite = Site & { resource: "FARM" | "FISH" };

export type FoodScan = {
  /** Nearest grain or fish you own but haven't garrisoned, and how many such tiles there are. */
  garrison?: FoodSite & { count: number };
  /** Nearest unowned grain or fish within FOOD_NEARBY_TILES of home and inside your reach. */
  expand?: FoodSite & { distance: number };
  /** Nearest unowned grain or fish within FOOD_NEARBY_TILES of home but outside your reach: a beacon brings it in. */
  outside?: FoodSite & { distance: number };
  /** Your active AFC nearest home: its menu sends the scout drone. */
  afc?: Site;
  /** Closest town of yours with free plots a Farm Plot can take. */
  plotTown?: Site & { name?: string; free: number };
};

export type FoodShortage = FoodScan & {
  /** FOOD demand minus supply, > 0. */
  short: number;
  /** Manpower per Farm Plot for this player. */
  plotCost: number;
  /**
   * Farm Plots one tap queues: the free plots, capped by the manpower on hand. 0 when one plot is out of reach:
   * the tile action is disabled below its manpower cost, so nothing could be queued.
   */
  plotsToQueue: number;
  /** Hyperfeed Seedstock commissioned: a Farm Plot upgrades to a Hydrogarden Plot, and grain takes a Hydrogarden. */
  hyperfeed: boolean;
  /** A Relay Beacon can be placed now: its MP in hand, a tile passes the build rule and a FOOD slot is free when it needs one. */
  beaconReady: boolean;
};

const isFood = (resource: string | undefined): resource is FoodSite["resource"] => resource === "FARM" || resource === "FISH";

const inProgressKeys = (state: Pick<ClientState, "developmentQueue" | "settleProgressByTile" | "autoSettleTargets">): Set<string> =>
  new Set([...state.developmentQueue.map((entry) => entry.tileKey), ...state.settleProgressByTile.keys(), ...state.autoSettleTargets]);

/** Free plots in this town that a Farm Plot can take: open and not a resource tile (those take their own building). */
export const freeFarmPlotCount = (state: Pick<ClientState, "tiles" | "me" | "developmentQueue" | "settleProgressByTile" | "autoSettleTargets">, town: Tile): number => {
  const plots = townBuildPlots(state.tiles, town, state.me, inProgressKeys(state)) ?? [];
  return plots.filter((plot) => plot.state === "open" && !state.tiles.get(plot.key)?.resource).length;
};

/** One pass over the known tiles; the candidate nearest home wins. */
export const scanFoodSources = (state: ClientState): FoodScan => {
  const me = state.me;
  if (!me) return {};
  const home = state.homeTile;
  const distance = (t: Site): number => (home ? Math.abs(t.x - home.x) + Math.abs(t.y - home.y) : 0);
  const nearer = <T extends Site>(best: T | undefined, next: T): T => (!best || distance(next) < distance(best) ? next : best);
  const busy = inProgressKeys(state);
  let garrison: Tile | undefined;
  let garrisonCount = 0;
  let expand: Tile | undefined;
  let outside: Tile | undefined;
  const reach = resolveMyReachCached(state);
  let afc: Tile | undefined;
  const towns: Tile[] = [];
  for (const tile of state.tiles.values()) {
    if (tile.fogged) continue;
    if (isFood(tile.resource)) {
      if (tile.ownerId === me && tile.ownershipState === "FRONTIER" && !busy.has(`${tile.x},${tile.y}`) && tile.optimisticPending !== "settle") {
        garrisonCount += 1;
        garrison = nearer(garrison, tile);
      } else if (!tile.ownerId && distance(tile) <= FOOD_NEARBY_TILES) {
        if (reach.has(`${tile.x},${tile.y}`)) expand = nearer(expand, tile);
        else outside = nearer(outside, tile);
      }
    }
    if (tile.afc?.ownerId === me && tile.afc.status === "active") afc = nearer(afc, tile);
    if (tile.ownerId === me && tile.ownershipState === "SETTLED" && tile.town && tile.town.populationTier !== "SETTLEMENT") towns.push(tile);
  }
  let plotTown: FoodScan["plotTown"];
  for (const town of towns.sort((a, b) => distance(a) - distance(b))) {
    const free = freeFarmPlotCount(state, town);
    if (free <= 0) continue;
    const name = townIdentityForTile(town)?.name;
    plotTown = { x: town.x, y: town.y, free, ...(name ? { name } : {}) };
    break;
  }
  const food = (t: Tile): FoodSite => ({ x: t.x, y: t.y, resource: t.resource as FoodSite["resource"] });
  return {
    ...(garrison ? { garrison: { ...food(garrison), count: garrisonCount } } : {}),
    ...(expand ? { expand: { ...food(expand), distance: distance(expand) } } : {}),
    ...(outside ? { outside: { ...food(outside), distance: distance(outside) } } : {}),
    ...(afc ? { afc: { x: afc.x, y: afc.y } } : {}),
    ...(plotTown ? { plotTown } : {})
  };
};

/** FOOD demand minus supply; 0 or less when nothing is short. */
export const foodShortBy = (state: Pick<ClientState, "resourceSlots">): number => -freeSlotsOf(state.resourceSlots, "FOOD");

/** The shortage with its fixes, or undefined when FOOD supply covers demand. `scan` is the cached tile scan. */
export const foodShortageForState = (state: ClientState, scan: FoodScan | undefined): FoodShortage | undefined => {
  const short = foodShortBy(state);
  if (short <= 0) return undefined;
  const plotCost = Math.ceil(structureManpowerCostForState(state, "FARM_PLOT", structureCostDefinition("FARM_PLOT").manpowerCost ?? 0));
  const free = scan?.plotTown?.free ?? 0;
  const affordable = plotCost > 0 ? Math.floor(Math.max(0, state.manpower) / plotCost) : free;
  return {
    ...(scan ?? {}),
    short,
    plotCost,
    plotsToQueue: Math.min(free, affordable),
    hyperfeed: state.techIds.includes(FARM_PLOT_UPGRADE_TECH_ID),
    // Only checked when a beacon row could show (the build-tile check walks every tile).
    beaconReady: Boolean(scan?.outside) && state.manpower >= relayBeaconManpowerCostForState(state) &&
      hasFreeResourceSlotsForRelayBeacon(state) && hasRelayBeaconBuildTile(state.tiles, state.me)
  };
};

export type FoodStep = {
  title: string;
  sub: string;
  focus?: Site;
  /** Queue Farm Plots in the town at this tile. */
  plots?: Site & { count: number };
  /** Start Relay Beacon placement on your land nearest this tile. */
  beacon?: Site;
};

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
const FOOD_NAME = { FARM: "grain", FISH: "fish" } as const;
const FOOD_TITLE = { FARM: "Grain", FISH: "Fish" } as const;
/** What the tile gives once garrisoned: Hyperfeed (the "agriculture" tech) adds a flat +1 to every fish tile. */
const foodYield = (resource: FoodSite["resource"], hyperfeed: boolean): number =>
  (BASE_SLOTS_BY_TILE_RESOURCE[resource]?.baseSlots ?? 0) + (resource === "FISH" && hyperfeed ? AGRICULTURE_FISH_FOOD_SLOT_BONUS : 0);
const HYDROGARDEN_YIELD = FARM_PLOT_FOOD_SLOT_SUPPLY.HYDROGARDEN_PLOT ?? 0;

const yieldText = (resource: FoodSite["resource"], hyperfeed: boolean): string =>
  `+${foodYield(resource, hyperfeed)} FOOD${resource === "FARM" && hyperfeed ? ` · ${HYDROGARDEN_YIELD} with Hydrogarden` : ""}`;

/** The fixes, cheapest first. */
export const foodShortageSteps = (food: FoodShortage): FoodStep[] => {
  const steps: FoodStep[] = [];
  const { garrison, expand, outside, afc, plotTown } = food;
  if (garrison) {
    const more = garrison.count > 1 ? ` · ${garrison.count} in reach` : "";
    steps.push({ title: `Garrison ${FOOD_NAME[garrison.resource]}`, sub: `${yieldText(garrison.resource, food.hyperfeed)}${more}`, focus: { x: garrison.x, y: garrison.y } });
  }
  if (expand) {
    steps.push({ title: `Expand to ${FOOD_NAME[expand.resource]}`, sub: `${yieldText(expand.resource, food.hyperfeed)} · then garrison`, focus: { x: expand.x, y: expand.y } });
  }
  if (outside && !expand) {
    const out = `${yieldText(outside.resource, food.hyperfeed)} · ${plural(outside.distance, "tile")} out`;
    // No beacon can go down (short of its MP, no build tile, or no FOOD slot for it): show where the food is, with nothing to start.
    steps.push(food.beaconReady
      ? { title: `Relay Beacon to ${FOOD_NAME[outside.resource]}`, sub: `${out} · outside reach`, beacon: { x: outside.x, y: outside.y } }
      : { title: `${FOOD_TITLE[outside.resource]} outside reach`, sub: `${out} · needs a Relay Beacon`, focus: { x: outside.x, y: outside.y } });
  }
  if (!garrison && !expand && !outside && afc) steps.push({ title: "Scout for food", sub: "No grain or fish nearby · drone from AFC", focus: afc });
  if (plotTown) {
    const n = food.plotsToQueue;
    const each = food.hyperfeed ? `+1 FOOD each, ${HYDROGARDEN_YIELD} upgraded` : "+1 FOOD each";
    // Not even one plot's manpower: say what it costs, with nothing to tap (the build would be refused).
    if (n <= 0) {
      steps.push({ title: `Farm Plots (${plural(plotTown.free, "plot")} free)`, sub: `Need ${food.plotCost} MP · ${each}` });
      return steps;
    }
    steps.push({
      title: `Build ${plural(n, "Farm Plot")} (${plural(plotTown.free, "plot")} free)`,
      sub: `${food.plotCost} MP · ${each}${plotTown.name ? ` · ${plotTown.name}` : ""}`,
      plots: { x: plotTown.x, y: plotTown.y, count: n }
    });
  }
  return steps;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The data attributes that make a food step act on tap; "" when it only informs. */
export const foodStepActionAttrs = (step: FoodStep): string =>
  step.plots
    ? ` data-hud-v2-food-plots="${step.plots.x},${step.plots.y}" data-hud-v2-food-plots-count="${step.plots.count}"`
    : step.beacon ? ` data-hud-v2-beacon="RELAY_BEACON" data-hud-v2-beacon-x="${step.beacon.x}" data-hud-v2-beacon-y="${step.beacon.y}"`
    : step.focus ? ` data-hud-v2-focus-x="${step.focus.x}" data-hud-v2-focus-y="${step.focus.y}"` : "";

const stepHtml = (step: FoodStep): string => {
  const attr = foodStepActionAttrs(step);
  const tag = attr ? "button" : "div";
  const type = attr ? ` type="button"` : "";
  return `<${tag}${type} class="hud-v2-tracker-row hud-v2-next-step hud-v2-food-step"${attr}><span class="hud-v2-tracker-title">${esc(step.title)}</span><span class="hud-v2-tracker-sub">${esc(step.sub)}</span></${tag}>`;
};

/**
 * The one-tap fix a red FOOD warning offers (owner, first-15 playtest 2026-11-28: "Garrison a farm" or "Build a
 * farm plot"): grain or fish you hold but haven't garrisoned, else unclaimed grain or fish in reach, else Farm
 * Plots you can afford now (as many as the shortage, at most). Beacons and scouting stay in the unfolded list.
 */
export type FoodFix = { kind: "garrison" | "expand" | "plots"; x: number; y: number; count: number; label: string };

export const primaryFoodFix = (food: FoodShortage | undefined): FoodFix | undefined => {
  if (!food) return undefined;
  if (food.garrison) return { kind: "garrison", x: food.garrison.x, y: food.garrison.y, count: 1, label: `Garrison ${FOOD_NAME[food.garrison.resource]}` };
  if (food.expand) return { kind: "expand", x: food.expand.x, y: food.expand.y, count: 1, label: `Expand to ${FOOD_NAME[food.expand.resource]}` };
  const count = Math.min(food.short, food.plotsToQueue);
  if (food.plotTown && count > 0) return { kind: "plots", x: food.plotTown.x, y: food.plotTown.y, count, label: `Build ${plural(count, "Farm Plot")}` };
  return undefined;
};

/** The fix's button: every warning that offers it uses this one, handled by the HUD (data-hud-v2-food-fix). */
export const foodFixButtonHtml = (label: string, className = ""): string =>
  `<button type="button" class="hud-v2-food-fix${className ? ` ${className}` : ""}" data-hud-v2-food-fix>${esc(label)} ›</button>`;

/** The header ("Short 5 FOOD") with its one-tap fix beside it, and under it every fix while it is unfolded. */
export const foodShortageHtml = (food: FoodShortage, open: boolean): string => {
  const toggle = `<button type="button" class="hud-v2-tracker-row hud-v2-next-step hud-v2-food-short" data-hud-v2-food-toggle aria-expanded="${open}"><span class="hud-v2-tracker-title"><span aria-hidden="true">${open ? "▾" : "▸"}</span> Short ${food.short} FOOD</span></button>`;
  const fix = primaryFoodFix(food);
  const head = fix ? `<div class="hud-v2-food-short-row">${toggle}${foodFixButtonHtml(fix.label)}</div>` : toggle;
  return open ? head + foodShortageSteps(food).map(stepHtml).join("") : head;
};
