import { AFC_MODULE_BAY_COUNT, AFC_MODULE_CALL_DOWN_MS } from "@border-empires/shared";
import type { TechInfo } from "../client-tech-info-types.js";
import type { Tile } from "../client-types.js";

/** Azimuth of bay k, shared with the 3D socket ring
 * (client-map-3d-fabrication-complex.ts) so bay k in the Modules tab is the
 * same arm socket as on the map. Scene +z is map south, i.e. screen-down. */
export const afcBayAngleRadians = (bayIndex: number): number => (bayIndex * Math.PI * 2) / AFC_MODULE_BAY_COUNT;

export type AfcModuleFamily = "economy" | "manpower" | "war" | "aether" | "other";

export type AfcBayView = {
  index: number;
  leftPercent: number;
  topPercent: number;
  state: "empty" | "docked" | "captured" | "incoming";
  techId?: string;
  name?: string;
  shortName?: string;
  family?: AfcModuleFamily;
  description?: string;
  /** "Lands in 45s" for an incoming module. */
  remainingLabel?: string;
};

export type AfcCallDownCandidate = {
  techId: string;
  name: string;
  family: AfcModuleFamily;
  whereLabel: string;
  actionId: `redeploy_afc_module:${string}`;
};

export type AfcModuleBaysView = {
  bays: AfcBayView[];
  /** Docked beyond the 8 bays (captured copies from before the cap). */
  overflow: AfcBayView[];
  usedCount: number;
  incomingCount: number;
  isOwner: boolean;
  dormant: boolean;
  candidates: AfcCallDownCandidate[];
  callDownLabel: string;
};

const FAMILY_BY_BRANCH: Readonly<Record<string, AfcModuleFamily>> = { economy: "economy", manpower: "manpower", war: "war", aether: "aether" };
export const AFC_MODULE_FAMILY_LABELS: Readonly<Record<AfcModuleFamily, string>> = {
  economy: "Economy",
  manpower: "Manpower",
  war: "War",
  aether: "Aether",
  other: "Module"
};

const BAY_RING_RADIUS_PERCENT = 38;

const formatSeconds = (ms: number): string => {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ""}`;
};

// "Titanium Forge Module" -> "TF"; "Hive Mind Module II" -> "HMII", so the
// numbered Hive Mind modules stay distinguishable on their bay buttons.
const shortNameFor = (name: string): string => {
  const words = name.replace(/\bModule\b/gi, "").split(/[\s-]+/).filter(Boolean);
  const numeral = words.find((word) => /^[IVX]+$/.test(word)) ?? "";
  return words.filter((word) => word !== numeral).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") + numeral;
};

const describe = (tech: TechInfo | undefined): string => (tech?.description ?? "").replace(/^AFC module:\s*/i, "");

const moduleFields = (techId: string, techById: ReadonlyMap<string, TechInfo>): Pick<AfcBayView, "techId" | "name" | "shortName" | "family" | "description"> => {
  const tech = techById.get(techId);
  const name = tech?.name ?? techId;
  return { techId, name, shortName: shortNameFor(name), family: FAMILY_BY_BRANCH[tech?.branch ?? ""] ?? "other", description: describe(tech) };
};

const bayPosition = (index: number): Pick<AfcBayView, "index" | "leftPercent" | "topPercent"> => {
  const angle = afcBayAngleRadians(index);
  return {
    index,
    leftPercent: Math.round((50 + Math.cos(angle) * BAY_RING_RADIUS_PERCENT) * 100) / 100,
    topPercent: Math.round((50 + Math.sin(angle) * BAY_RING_RADIUS_PERCENT) * 100) / 100
  };
};

export type AfcModuleBaysState = { me: string; techIds: readonly string[]; techCatalog: readonly TechInfo[]; tiles: ReadonlyMap<string, Tile> };

const whereIsModule = (state: AfcModuleBaysState, techId: string): string => {
  for (const tile of state.tiles.values()) {
    const afc = tile.afc;
    if (!afc || afc.ownerId !== state.me || tile.ownerId !== state.me) continue;
    if (afc.houseModules?.includes(techId)) return `Docked at the AFC at (${tile.x}, ${tile.y}) — moves here`;
    if (afc.incomingModules?.some((entry) => entry.techId === techId)) return `On its way to the AFC at (${tile.x}, ${tile.y}) — redirects here`;
  }
  return "Not docked — what it unlocks is inactive";
};

/** Everything the Modules tab draws for one AFC tile. Bays fill in `modules`
 * order, the order the 3D overlay docks them into sockets, then incoming. */
export const afcModuleBaysView = (state: AfcModuleBaysState, tile: Tile, nowMs: number = Date.now()): AfcModuleBaysView | undefined => {
  const afc = tile.afc;
  if (!afc) return undefined;
  const techById = new Map(state.techCatalog.map((tech) => [tech.id, tech]));
  const houseLeft = [...(afc.houseModules ?? [])];
  const docked = (afc.modules ?? []).map((techId): AfcBayView => {
    const houseIndex = houseLeft.indexOf(techId);
    if (houseIndex >= 0) houseLeft.splice(houseIndex, 1);
    return { ...bayPosition(0), state: houseIndex >= 0 ? "docked" : "captured", ...moduleFields(techId, techById) };
  });
  const incoming = (afc.incomingModules ?? []).map(
    (entry): AfcBayView => ({ ...bayPosition(0), state: "incoming", ...moduleFields(entry.techId, techById), remainingLabel: `Lands in ${formatSeconds(entry.arrivesAt - nowMs)}` })
  );
  const filled = [...docked, ...incoming];
  const bays = Array.from({ length: AFC_MODULE_BAY_COUNT }, (_, index): AfcBayView => {
    const occupant = filled[index];
    return occupant ? { ...occupant, ...bayPosition(index) } : { ...bayPosition(index), state: "empty" };
  });
  const overflow = filled.slice(AFC_MODULE_BAY_COUNT).map((bay, i) => ({ ...bay, index: AFC_MODULE_BAY_COUNT + i }));
  const isOwner = afc.ownerId === state.me && tile.ownerId === state.me;
  const here = new Set([...(afc.modules ?? []), ...(afc.incomingModules ?? []).map((entry) => entry.techId)]);
  const candidates: AfcCallDownCandidate[] =
    isOwner && afc.status === "active"
      ? state.techCatalog
          .filter((tech) => tech.manifestCategory === "AFC_MODULE" && state.techIds.includes(tech.id) && !here.has(tech.id))
          .map((tech) => ({
            techId: tech.id,
            name: tech.name,
            family: FAMILY_BY_BRANCH[tech.branch ?? ""] ?? "other",
            whereLabel: whereIsModule(state, tech.id),
            actionId: `redeploy_afc_module:${tech.id}` as const
          }))
      : [];
  return {
    bays,
    overflow,
    usedCount: Math.min(AFC_MODULE_BAY_COUNT, filled.length),
    incomingCount: incoming.length,
    isOwner,
    dormant: afc.status === "inactive",
    candidates,
    callDownLabel: `Lands in ${formatSeconds(AFC_MODULE_CALL_DOWN_MS)}`
  };
};
