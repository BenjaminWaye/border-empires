// The tile panel's fact strip: a few labels and numbers that matter on sight
// for the selected tile (what a building gives and costs, a dock's or town's
// coin, a fight's odds). Everything else stays one click away under
// Details ▾, which shows the full overview inside the panel.

import { tileCoinPerMinute } from "../client-coin-income/client-coin-income.js";
import { townZeroCoinReason } from "../client-town-plot-income/client-town-plot-income.js";
import { structureModifiersFor } from "@border-empires/game-domain";
import { DEPLETED_RECLAMATION_WORKS_NAME, isDepletedReclamationWorks, isRedesignedRelic, NATURAL_WONDER_LABELS, relicOperationalState, RELIC_DEFINITIONS, structureDisplayName } from "@border-empires/shared";
import { resourceSlotProductionHtml } from "../client-tile-menu-view/client-tile-resource-slot-production.js";
import { tileOverviewUpkeepLines } from "../client-tile-upkeep-view.js";
import { displayTownPopulationTierLabel, isTownGrowthPaused, populationPerMinuteLabel, townNextGrowthEtaLabel } from "../client-town-growth/client-town-growth.js";
import { ownTownGrowthRatePending } from "../client-tile-menu-town-economy/client-tile-menu-town-economy.js";
import { upkeepDescriptorFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";
import { refineryGivesFact, type RefineryStatusOf } from "./client-hud-v2-refinery-gives.js";
import type { DormancyField } from "../client-tile-menu-view/client-tile-menu-dormancy-line.js";
import type { SlotResource } from "@border-empires/shared";
import type { Tile, TileMenuView } from "../client-types.js";

export type TileFact = { label: string; value: string; tone?: "good" | "warn" };

/** Which resources a structure on this tile is dormant for lacking (state.dormantStructures); undefined when it isn't. */
export type DormantResourcesFor = (tile: Tile, field: DormancyField) => readonly SlotResource[] | undefined;

const SLOT_RESOURCE_NAME: Record<SlotResource, string> = { FOOD: "Food", TITANIUM: "Titanium", CRYSTAL: "Crystal", UMBRITE: "Umbrite" };

export const MAX_FACTS = 4;
const MAX_GIVES = 2;

export const plainText = (html: string): string =>
  html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/ ([:,.])/g, "$1").trim();

type StructureKey =
  | NonNullable<Tile["economicStructure"]>["type"]
  | NonNullable<NonNullable<Tile["fort"]>["variant"]>
  | "FORT"
  | NonNullable<NonNullable<Tile["siegeBattery"]>["variant"]>
  | "OBSERVATORY";

/** Upkeep that depends on how many you own (free first Relay Beacons, progressive Observatory cost): left to Details. */
const COUNT_DEPENDENT_UPKEEP: ReadonlySet<StructureKey> = new Set<StructureKey>(["RELAY_BEACON", "OBSERVATORY"]);

type StructureSlot = {
  key: StructureKey;
  field: DormancyField;
  status: "under_construction" | "active" | "inactive" | "removing";
  inactiveReason?: "manual" | "upkeep";
  disabledUntil?: number;
  /** Aether Tower only: a Resonance Hijack takeover in progress, and Counterphase suppression. */
  hijackEndsAt?: number;
  suppressedUntil?: number;
  /** A Reclamation Works whose field shipped its last load (isDepletedReclamationWorks). */
  depleted?: true;
};

/** Every building on a tile, economic structures first since they carry the tile's purpose. */
const structuresOn = (tile: Tile): StructureSlot[] => {
  const slots: StructureSlot[] = [];
  const s = tile.economicStructure;
  if (s) slots.push({ key: s.type, field: "economicStructure", status: s.status, ...(isDepletedReclamationWorks(tile) ? { depleted: true as const } : {}), ...(s.inactiveReason ? { inactiveReason: s.inactiveReason } : {}), ...(s.disabledUntil ? { disabledUntil: s.disabledUntil } : {}) });
  if (tile.fort) slots.push({ key: tile.fort.variant ?? "FORT", field: "fort", status: tile.fort.status, ...(tile.fort.disabledUntil ? { disabledUntil: tile.fort.disabledUntil } : {}) });
  if (tile.siegeBattery) slots.push({ key: tile.siegeBattery.variant ?? "SIEGE_BATTERY", field: "siegeBattery", status: tile.siegeBattery.status });
  if (tile.observatory) slots.push({ key: "OBSERVATORY", field: "observatory", status: tile.observatory.status, ...(tile.observatory.hijack ? { hijackEndsAt: tile.observatory.hijack.endsAt } : {}), ...(tile.observatory.suppressedUntil ? { suppressedUntil: tile.observatory.suppressedUntil } : {}) });
  return slots;
};

type ShownStructure = { slot: StructureSlot; dormant: readonly SlotResource[] };

/**
 * The building the fact strip describes. A Fort may share its tile with any building
 * (runtime-structure-command-handlers.ts), so a dormant one wins over the economic structure: it's the one
 * giving nothing, and the map's shortage badge points at it.
 */
const structureToShow = (tile: Tile, dormantResourcesFor?: DormantResourcesFor): ShownStructure | undefined => {
  const shown = structuresOn(tile).map((slot) => ({ slot, dormant: dormantResourcesFor?.(tile, slot.field) ?? [] }));
  return shown.find((s) => s.dormant.length > 0 && s.slot.status === "active") ?? shown[0];
};

const stateFact = (s: StructureSlot, nowMs: number): TileFact => {
  if (s.status === "under_construction") return { label: "State", value: "Building" };
  if (s.status === "removing") return { label: "State", value: "Removing", tone: "warn" };
  if (s.disabledUntil && s.disabledUntil > nowMs) return { label: "State", value: "Recovering", tone: "warn" };
  if (s.hijackEndsAt && s.hijackEndsAt > nowMs) return { label: "State", value: `Being hijacked · ${Math.ceil((s.hijackEndsAt - nowMs) / 60_000)} min`, tone: "warn" };
  if (s.suppressedUntil && s.suppressedUntil > nowMs) return { label: "State", value: "Suppressed", tone: "warn" };
  if (s.status === "inactive") return { label: "State", value: s.inactiveReason === "upkeep" ? "Off · no upkeep" : "Off", tone: "warn" };
  return { label: "State", value: "Active", tone: "good" };
};

const capitalized = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const structureFacts = (s: StructureSlot, mine: boolean, nowMs: number, dormant: readonly SlotResource[] = [], refinery?: () => ReturnType<RefineryStatusOf>): TileFact[] => {
  // A depleted Works gives nothing and costs nothing; the same for its owner and anyone else.
  if (s.depleted) return [{ label: "Building", value: DEPLETED_RECLAMATION_WORKS_NAME }, s.status === "removing" ? stateFact(s, nowMs) : { label: "State", value: "Depleted · no salvage left", tone: "warn" }];
  const facts: TileFact[] = [];
  const name = structureDisplayName(s.key);
  if (name && plainText(name) !== "") facts.push({ label: "Building", value: name });
  // Dormant (no free upkeep slot) still reports status "active" on the wire; it gives nothing until a slot
  // frees up. A more pressing state (Recovering, hijacked, suppressed) keeps the State line; Gives still says none.
  const isDormant = dormant.length > 0 && s.status === "active";
  const state = stateFact(s, nowMs);
  facts.push(isDormant && state.value === "Active" ? { label: "State", value: `Dormant · no ${dormant.map((r) => SLOT_RESOURCE_NAME[r]).join(" / ")} slot`, tone: "warn" } : state);
  const modifiers = structureModifiersFor(s.key).slice(0, MAX_GIVES);
  const gives = isDormant
    ? modifiers.length > 0 ? [`No ${[...new Set(modifiers.map((m) => capitalized(m.statLabel)))].join(" / ")} bonus`] : []
    : modifiers.map((m) => `${capitalized(m.statLabel)} ${m.valueText}`);
  // A refinery says what it yields now; the catalog only knows its per-tile rate.
  const refineryGives = !isDormant && s.field === "economicStructure" ? refineryGivesFact(s.key, mine, s.status, refinery?.()) : undefined;
  if (refineryGives) facts.push(refineryGives);
  else if (gives.length > 0) facts.push({ label: "Gives", value: gives.join(" · "), ...(isDormant ? { tone: "warn" as const } : {}) });
  if (mine && !COUNT_DEPENDENT_UPKEEP.has(s.key)) {
    const upkeep = upkeepDescriptorFor(s.key);
    if (upkeep.length > 0) facts.push({ label: "Upkeep", value: upkeep.join(" · ") });
  }
  return facts;
};

/**
 * The building standing on a tile, as facts (name, state, what it gives, upkeep) -- for the town screen's
 * selected support tile. A building going up or being removed is left to the screen's work cards, which
 * already show it with its progress.
 */
export const builtStructureFacts = (tile: Tile, mine: boolean, nowMs: number = Date.now(), dormantResourcesFor?: DormantResourcesFor, refineryStatusOf?: RefineryStatusOf): TileFact[] =>
  // A fort shares its tile with any building, so describe every standing structure, not just one.
  structuresOn(tile)
    .filter((slot) => slot.status !== "under_construction" && slot.status !== "removing")
    .flatMap((slot) => structureFacts(slot, mine, nowMs, dormantResourcesFor?.(tile, slot.field) ?? [], () => refineryStatusOf?.(tile)));

const coinPerDay = (goldPerMinute: number): string => `${(goldPerMinute * 1440).toFixed(1)}/day`;

export type TownGrowth = { rate: string; eta: string; paused: boolean };

/** Your town's growth rate and when it reaches the next tier; undefined while the rate hasn't arrived. */
export const townGrowth = (town: NonNullable<Tile["town"]>, nowMs: number = Date.now()): TownGrowth | undefined => {
  if (ownTownGrowthRatePending(town)) return undefined;
  const paused = isTownGrowthPaused(town, { explainUnfed: true, nowMs });
  return { rate: paused ? "Paused" : populationPerMinuteLabel(town.populationGrowthPerMinute ?? 0), eta: townNextGrowthEtaLabel(town, { explainUnfed: true, nowMs }), paused };
};

const townFacts = (tile: Tile, mine: boolean, nowMs: number): TileFact[] => {
  const town = tile.town;
  if (!town) return [];
  const facts: TileFact[] = [{ label: "Town", value: displayTownPopulationTierLabel(town.populationTier) }];
  // Only your own towns carry their yield; a rival's would read 0.0/day.
  if (mine && tile.ownershipState === "SETTLED") {
    const goldPerMinute = tileCoinPerMinute(tile);
    // A town earning nothing says why (unfed, no plots garrisoned, sabotaged) instead of a bare 0.0/day.
    const why = goldPerMinute < 0.0001 ? townZeroCoinReason(tile, nowMs) : undefined;
    facts.push(why ? { label: "Coin", value: `${coinPerDay(goldPerMinute)} · ${why}`, tone: "warn" } : { label: "Coin", value: coinPerDay(goldPerMinute) });
  }
  if (typeof town.isFed === "boolean") facts.push(town.isFed ? { label: "Food", value: "Fed", tone: "good" } : { label: "Food", value: "Unfed", tone: "warn" });
  const growth = mine && tile.ownershipState === "SETTLED" ? townGrowth(town, nowMs) : undefined;
  if (growth) facts.push(growth.paused ? { label: "Growth", value: "Paused", tone: "warn" } : { label: "Growth", value: growth.rate });
  return facts;
};

const dockFacts = (tile: Tile, mine: boolean): TileFact[] => {
  if (!mine || !tile.dockId || tile.ownershipState !== "SETTLED" || !tile.dock) return [];
  const linked = tile.dock.connectedDockCount;
  return [
    { label: "Dock", value: coinPerDay(tile.dock.goldPerMinute) },
    linked > 0 ? { label: "Linked", value: `${linked} dock${linked === 1 ? "" : "s"}` } : { label: "Linked", value: "None", tone: "warn" }
  ];
};

const landFacts = (tile: Tile, mine: boolean): TileFact[] => {
  if (tile.ownershipState !== "SETTLED") return [];
  const facts: TileFact[] = [];
  const production = plainText(resourceSlotProductionHtml(tile) ?? "");
  if (production) facts.push({ label: "Produces", value: production });
  if (mine) {
    const upkeep = tileOverviewUpkeepLines(tile).filter((l) => l.kind !== "section").map((l) => plainText(l.html))[0];
    if (upkeep) facts.push({ label: "Upkeep", value: upkeep });
  }
  return facts;
};

const CAPTURE_LINE = /Capturing requires (\d[\d,]*) mustered manpower/;

/** Odds from the attack preview and the muster a fortified tile demands (both from the overview the menu built). */
const fightFacts = (view: Pick<TileMenuView, "combatBreakdown" | "overviewLines">): TileFact[] => {
  const facts: TileFact[] = [];
  if (view.combatBreakdown) {
    const pct = Math.round(view.combatBreakdown.winChance * 100);
    facts.push({ label: "Odds", value: `${pct}%`, ...(pct >= 50 ? { tone: "good" as const } : { tone: "warn" as const }) });
  }
  for (const line of view.overviewLines) {
    const hit = CAPTURE_LINE.exec(plainText(line.html));
    if (hit) {
      facts.push({ label: "Needs", value: `${hit[1]} manpower` });
      break;
    }
  }
  return facts;
};

const sentenceCase = (text: string): string => text.replace(/^the /i, "").replace(/^./, (c) => c.toUpperCase());

/** A natural wonder's name, for the panel title (the tile itself only knows its terrain). */
export const wonderName = (tile: Tile | undefined): string | undefined => {
  const wonder = tile?.naturalWonder;
  if (!wonder) return undefined;
  return isRedesignedRelic(wonder) ? RELIC_DEFINITIONS[wonder.type].name : sentenceCase(NATURAL_WONDER_LABELS[wonder.type].name);
};

/** What a wonder gives and whether it is working; the long description stays in Details. */
const wonderFacts = (tile: Tile, mine: boolean): TileFact[] => {
  const wonder = tile.naturalWonder;
  if (!wonder) return [];
  const garrisoned = Boolean(tile.ownerId && tile.ownershipState === "SETTLED");
  if (isRedesignedRelic(wonder)) {
    const state = relicOperationalState(wonder, garrisoned);
    const gives = RELIC_DEFINITIONS[wonder.type].benefit.split(/[;.]/)[0]?.trim() ?? "";
    return [
      { label: "Relic", value: RELIC_DEFINITIONS[wonder.type].name },
      state === "depleted" ? { label: "State", value: "Depleted", tone: "warn" }
        : state === "active" ? (mine ? { label: "State", value: "Active", tone: "good" } : { label: "State", value: "Held" })
        : { label: "State", value: mine ? "Garrison to activate" : "Dormant" },
      // What a relic does stays hidden until a garrison brings it online.
      ...(gives && state === "active" ? [{ label: "Gives", value: gives }] : [])
    ];
  }
  const { name, boon } = NATURAL_WONDER_LABELS[wonder.type];
  return [
    { label: "Wonder", value: sentenceCase(name) },
    mine && garrisoned ? { label: "State", value: "Active", tone: "good" } : { label: "State", value: mine ? "Garrison to activate" : tile.ownerId ? "Held" : "Unclaimed" },
    { label: "Gives", value: boon }
  ];
};

/** Waystation section of the overview: what it granted, or that it is dormant. */
export const waystationFacts = (view: Pick<TileMenuView, "overviewLines">): TileFact[] => {
  const start = view.overviewLines.findIndex((l) => l.kind === "section" && plainText(l.html) === "Waystation");
  if (start < 0) return [];
  const facts: TileFact[] = [];
  for (const line of view.overviewLines.slice(start + 1)) {
    if (line.kind === "section") break;
    const text = plainText(line.html);
    if (line.kind !== "effect" || !text || text.startsWith("Activated by")) continue;
    const split = text.indexOf(": ");
    const label = split > 0 ? text.slice(0, split) : "";
    const value = split > 0 ? text.slice(split + 2) : text;
    facts.push({ label: label === "" || label === "Status" ? "Waystation" : label, value });
  }
  if (facts.length === 1 && facts[0]?.value === "Dormant") facts.push({ label: "When claimed", value: "One random bonus" });
  return facts;
};

export const tileFactsFor = (
  tile: Tile | undefined,
  view: Pick<TileMenuView, "combatBreakdown" | "overviewLines">,
  me: string,
  nowMs: number = Date.now(),
  dormantResourcesFor?: DormantResourcesFor,
  refineryStatusOf?: RefineryStatusOf
): TileFact[] => {
  const waystation = waystationFacts(view);
  if (waystation.length > 0) return waystation.slice(0, MAX_FACTS);
  if (!tile) return fightFacts(view).slice(0, MAX_FACTS);
  const mine = Boolean(me) && tile.ownerId === me;
  const structure = structureToShow(tile, dormantResourcesFor);
  // On someone else's tile the fight comes first; the cap then trims what their building gives.
  const facts = [
    ...wonderFacts(tile, mine),
    ...(!mine ? fightFacts(view) : []),
    ...(structure ? structureFacts(structure.slot, mine, nowMs, structure.dormant, () => refineryStatusOf?.(tile)) : []),
    ...townFacts(tile, mine, nowMs),
    ...dockFacts(tile, mine),
    ...(!structure && !tile.town && !tile.naturalWonder ? landFacts(tile, mine) : [])
  ];
  return facts.slice(0, MAX_FACTS);
};
