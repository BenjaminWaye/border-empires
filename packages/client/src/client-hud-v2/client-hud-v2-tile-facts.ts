// The tile panel's fact strip: a few labels and numbers that matter on sight
// for the selected tile (what a building gives and costs, a dock's or town's
// coin, a fight's odds). Everything else stays one click away under
// Details ▾, which shows the full overview inside the panel.

import { structureModifiersFor, type ModifierStructureType } from "@border-empires/game-domain";
import { isRedesignedRelic, NATURAL_WONDER_LABELS, relicOperationalState, RELIC_DEFINITIONS, structureDisplayName, type SlotStructureType, type StructureDisplayKey } from "@border-empires/shared";
import { resourceSlotProductionHtml } from "../client-tile-menu-view/client-tile-resource-slot-production.js";
import { tileOverviewUpkeepLines } from "../client-tile-upkeep-view.js";
import { displayTownPopulationTierLabel, isTownGrowthPaused, populationPerMinuteLabel, townNextGrowthEtaLabel } from "../client-town-growth/client-town-growth.js";
import { ownTownGrowthRatePending } from "../client-tile-menu-town-economy/client-tile-menu-town-economy.js";
import { upkeepDescriptorFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";
import type { Tile, TileMenuView } from "../client-types.js";

export type TileFact = { label: string; value: string; tone?: "good" | "warn" };

const MAX_FACTS = 4;
const MAX_GIVES = 2;

export const plainText = (html: string): string =>
  html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/ ([:,.])/g, "$1").trim();

type StructureSlot = {
  key: string;
  status: "under_construction" | "active" | "inactive" | "removing";
  inactiveReason?: "manual" | "upkeep";
  disabledUntil?: number;
};

/** The building on a tile, if any; economic structures first since they carry the tile's purpose. */
const structureOn = (tile: Tile): StructureSlot | undefined => {
  const s = tile.economicStructure;
  if (s) return { key: s.type, status: s.status, ...(s.inactiveReason ? { inactiveReason: s.inactiveReason } : {}), ...(s.disabledUntil ? { disabledUntil: s.disabledUntil } : {}) };
  if (tile.fort) return { key: tile.fort.variant ?? "FORT", status: tile.fort.status, ...(tile.fort.disabledUntil ? { disabledUntil: tile.fort.disabledUntil } : {}) };
  if (tile.siegeBattery) return { key: tile.siegeBattery.variant ?? "SIEGE_BATTERY", status: tile.siegeBattery.status };
  if (tile.observatory) return { key: "OBSERVATORY", status: tile.observatory.status };
  return undefined;
};

const stateFact = (s: StructureSlot, nowMs: number): TileFact => {
  if (s.status === "under_construction") return { label: "State", value: "Building" };
  if (s.status === "removing") return { label: "State", value: "Removing", tone: "warn" };
  if (s.disabledUntil && s.disabledUntil > nowMs) return { label: "State", value: "Recovering", tone: "warn" };
  if (s.status === "inactive") return { label: "State", value: s.inactiveReason === "upkeep" ? "Off · no upkeep" : "Off", tone: "warn" };
  return { label: "State", value: "Active", tone: "good" };
};

const structureFacts = (s: StructureSlot, mine: boolean, nowMs: number): TileFact[] => {
  const facts: TileFact[] = [];
  const name = structureDisplayName(s.key as StructureDisplayKey);
  if (name && plainText(name) !== "") facts.push({ label: "Building", value: name });
  facts.push(stateFact(s, nowMs));
  const gives = structureModifiersFor(s.key as ModifierStructureType).slice(0, MAX_GIVES).map((m) => `${m.statLabel.charAt(0).toUpperCase()}${m.statLabel.slice(1)} ${m.valueText}`);
  if (gives.length > 0) facts.push({ label: "Gives", value: gives.join(" · ") });
  if (mine) {
    const upkeep = upkeepDescriptorFor(s.key as SlotStructureType);
    if (upkeep.length > 0) facts.push({ label: "Upkeep", value: upkeep.join(" · ") });
  }
  return facts;
};

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
  if (tile.ownershipState === "SETTLED") facts.push({ label: "Coin", value: coinPerDay(tile.yieldRate?.goldPerMinute ?? 0) });
  if (typeof town.isFed === "boolean") facts.push(town.isFed ? { label: "Food", value: "Fed", tone: "good" } : { label: "Food", value: "Unfed", tone: "warn" });
  const growth = mine && tile.ownershipState === "SETTLED" ? townGrowth(town, nowMs) : undefined;
  if (growth) facts.push(growth.paused ? { label: "Growth", value: "Paused", tone: "warn" } : { label: "Growth", value: growth.rate });
  return facts;
};

const dockFacts = (tile: Tile): TileFact[] => {
  if (!tile.dockId || tile.ownershipState !== "SETTLED" || !tile.dock) return [];
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
      state === "active" && mine ? { label: "State", value: "Active", tone: "good" } : state === "depleted" ? { label: "State", value: "Depleted", tone: "warn" } : { label: "State", value: mine ? "Garrison to activate" : "Dormant" },
      ...(gives ? [{ label: "Gives", value: gives }] : [])
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
  nowMs: number = Date.now()
): TileFact[] => {
  const waystation = waystationFacts(view);
  if (waystation.length > 0) return waystation.slice(0, MAX_FACTS);
  if (!tile) return fightFacts(view).slice(0, MAX_FACTS);
  const mine = Boolean(me) && tile.ownerId === me;
  const structure = structureOn(tile);
  // On someone else's tile the fight comes first; the cap then trims what their building gives.
  const facts = [
    ...wonderFacts(tile, mine),
    ...(!mine ? fightFacts(view) : []),
    ...(structure ? structureFacts(structure, mine, nowMs) : []),
    ...townFacts(tile, mine, nowMs),
    ...dockFacts(tile),
    ...(!structure && !tile.town && !tile.naturalWonder ? landFacts(tile, mine) : [])
  ];
  return facts.slice(0, MAX_FACTS);
};
