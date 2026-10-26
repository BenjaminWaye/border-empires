// Manifest tree for the new HUD: lanes (Economy, Manpower, War, Aether) across
// tiers, laid out like a Civ tech tree. Each card shows its state in the name
// bar and icons for what it unlocks; lanes fold into one summary row.
// Commission goes through the same chooseTech flow as the legacy panel.

import { abilityIconHtml } from "../client-ability-icons/client-ability-icons.js";
import { structureArtIconHtml } from "../client-build-menu-icons/client-build-menu-icons.js";
import { crystalAbilityNameForKey, relatedCrystalAbilitiesForTech } from "../client-crystal-ability-info/client-crystal-ability-info.js";
import { MONUMENT_COMPONENT_KEYS, STRUCTURE_DISPLAY_NAMES } from "../client-map-display.js";
import { relatedStrategicResourcesForTech } from "../client-resource-discovery-info.js";
import { resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import { relatedStructureTypesForTech } from "../client-tech-detail-ui/client-tech-structure-unlocks.js";
import type { TechInfo } from "../client-types.js";

export type ManifestNodeState = "owned" | "available" | "locked";

export type ManifestLaneLayout = {
  branch: string;
  name: string;
  y: number;
  height: number;
  closed: boolean;
  owned: number;
  available: number;
  total: number;
  pips: ManifestNodeState[];
};

export type ManifestLayout = {
  lanes: ManifestLaneLayout[];
  nodes: Map<string, { x: number; y: number }>;
  segments: Array<{ x: number; y: number; w: number; h: number; tone: "owned" | "path" | "locked" }>;
  tiers: number;
  width: number;
  height: number;
};

export const MANIFEST_CARD_W = 240;
const CARD_H = 36;
const COL_GAP = 16;
const LEFT = 120;
const ROW = 42;
const TOP = 34;
const BAND_PAD = 8;
const CLOSED_H = 34;

const LANES: ReadonlyArray<[string, string]> = [["economy", "Economy"], ["manpower", "Manpower"], ["war", "War"], ["aether", "Aether"]];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const CATEGORY_TAG: Record<NonNullable<TechInfo["manifestCategory"]>, string> = {
  AFC_MODULE: "MOD",
  CREW_OFFICE_CONSIGNMENT: "CREW",
  CHARTER_WARRANT: "CHTR",
  DOSSIER: "DOSS"
};
const CATEGORY_NAME: Record<NonNullable<TechInfo["manifestCategory"]>, string> = {
  AFC_MODULE: "AFC Module",
  CREW_OFFICE_CONSIGNMENT: "Crew / Office",
  CHARTER_WARRANT: "Charter",
  DOSSIER: "Dossier"
};

export const romanTier = (tier: number): string => ROMAN[tier - 1] ?? String(tier);

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const manifestNodeState = (tech: TechInfo, owned: ReadonlySet<string>): ManifestNodeState => {
  if (owned.has(tech.id)) return "owned";
  const prereqsMet = (tech.prereqIds ?? []).every((id) => owned.has(id));
  return prereqsMet && tech.requirements.canResearch !== false && !tech.lockedReason ? "available" : "locked";
};

const laneOf = (tech: TechInfo): string => (LANES.some(([b]) => b === tech.branch) ? (tech.branch as string) : "other");

const colX = (tier: number): number => LEFT + (tier - 1) * (MANIFEST_CARD_W + COL_GAP);

/** Lays the tree out: one band per lane, a column per tier, children ordered under their parents. */
export const manifestLayout = (techs: readonly TechInfo[], owned: ReadonlySet<string>, closedLanes: ReadonlySet<string>): ManifestLayout => {
  const byId = new Map(techs.map((t) => [t.id, t]));
  const tiers = Math.max(1, ...techs.map((t) => t.tier));
  const laneDefs = [...LANES, ...(techs.some((t) => laneOf(t) === "other") ? [["other", "Other"] as [string, string]] : [])];
  const nodes = new Map<string, { x: number; y: number }>();
  const lanes: ManifestLaneLayout[] = [];
  let y = TOP;
  for (const [branch, name] of laneDefs) {
    const items = techs.filter((t) => laneOf(t) === branch);
    if (items.length === 0) continue;
    const states = [...items].sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)).map((t) => manifestNodeState(t, owned));
    const summary = {
      owned: states.filter((s) => s === "owned").length,
      available: states.filter((s) => s === "available").length,
      total: items.length,
      pips: states
    };
    const closed = closedLanes.has(branch);
    if (closed) {
      lanes.push({ branch, name, y, height: CLOSED_H, closed, ...summary });
      y += CLOSED_H + 4;
      continue;
    }
    let rows = 0;
    for (let tier = 1; tier <= tiers; tier += 1) {
      const column = items.filter((t) => t.tier === tier);
      const parentY = (t: TechInfo): number => {
        const ys = (t.prereqIds ?? []).map((id) => nodes.get(id)?.y).filter((v): v is number => v !== undefined);
        return ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
      };
      const sameTierParent = (t: TechInfo): string | undefined => (t.prereqIds ?? []).find((id) => byId.get(id)?.tier === tier);
      const ordered = column.filter((t) => !sameTierParent(t)).sort((a, b) => parentY(a) - parentY(b) || a.name.localeCompare(b.name));
      for (const child of column.filter((t) => sameTierParent(t))) {
        const at = ordered.findIndex((t) => t.id === sameTierParent(child));
        ordered.splice(at < 0 ? ordered.length : at + 1, 0, child);
      }
      ordered.forEach((t, i) => nodes.set(t.id, { x: colX(tier), y: y + BAND_PAD + i * ROW }));
      rows = Math.max(rows, ordered.length);
    }
    const height = rows * ROW + BAND_PAD * 2 - 6;
    lanes.push({ branch, name, y, height, closed, ...summary });
    y += height + 4;
  }
  const segments: ManifestLayout["segments"] = [];
  const line = (x: number, yy: number, w: number, h: number, tone: "owned" | "path" | "locked"): void => {
    segments.push({ x: Math.round(x), y: Math.round(yy), w: Math.max(2, Math.round(w)), h: Math.max(2, Math.round(h)), tone });
  };
  for (const tech of techs) {
    const b = nodes.get(tech.id);
    if (!b) continue;
    for (const parentId of tech.prereqIds ?? []) {
      const a = nodes.get(parentId);
      const parent = byId.get(parentId);
      if (!a || !parent) continue;
      const tone = owned.has(parentId) && owned.has(tech.id) ? "owned" : owned.has(parentId) ? "path" : "locked";
      const ay = a.y + CARD_H / 2;
      const by = b.y + CARD_H / 2;
      if (parent.tier === tech.tier) {
        const x = a.x + MANIFEST_CARD_W + 8;
        line(a.x + MANIFEST_CARD_W, ay, 8, 2, tone);
        line(x, Math.min(ay, by), 2, Math.abs(by - ay) + 2, tone);
        line(b.x + MANIFEST_CARD_W, by, 8, 2, tone);
        continue;
      }
      const mx = b.x - 12;
      line(a.x + MANIFEST_CARD_W, ay, mx - (a.x + MANIFEST_CARD_W), 2, tone);
      line(mx, Math.min(ay, by), 2, Math.abs(by - ay) + 2, tone);
      line(mx, by, b.x - mx, 2, tone);
    }
  }
  return { lanes, nodes, segments, tiers, width: colX(tiers) + MANIFEST_CARD_W + 4, height: y + 8 };
};

type Unlock = { icon: string; label: string; kind: "structure" | "ability" | "resource" };

export const manifestUnlocks = (tech: TechInfo): Unlock[] => {
  const out: Unlock[] = [];
  for (const type of relatedStructureTypesForTech(tech)) {
    if (MONUMENT_COMPONENT_KEYS.has(type)) continue;
    out.push({ kind: "structure", label: STRUCTURE_DISPLAY_NAMES[type] ?? type, icon: structureArtIconHtml(type, "v2m-ico-img") ?? `<span class="v2m-ico-txt">${esc((STRUCTURE_DISPLAY_NAMES[type] ?? type).slice(0, 2))}</span>` });
  }
  for (const key of relatedCrystalAbilitiesForTech(tech)) out.push({ kind: "ability", label: crystalAbilityNameForKey(key), icon: abilityIconHtml(key, "v2m-ico-img") });
  for (const resource of relatedStrategicResourcesForTech(tech)) {
    out.push({ kind: "resource", label: `Reveal ${resource.charAt(0)}${resource.slice(1).toLowerCase()}`, icon: resourceIconHtml(resource) });
  }
  return out;
};

const shortName = (name: string): string => name.replace(/ (Module|Consignment|Dossier)$/, "");

export type ManifestInput = {
  techs: readonly TechInfo[];
  owned: ReadonlySet<string>;
  selectedId: string;
  closedLanes: ReadonlySet<string>;
  gold: number;
  /** Highest AFC upgrade tier the owned Manifests open. */
  afcTier: number;
};

/** The current price: every Manifest costs the same at any moment. */
export const nextManifestCost = (techs: readonly TechInfo[], owned: ReadonlySet<string>): number | undefined =>
  techs.find((t) => !owned.has(t.id))?.requirements.gold;

export const manifestHeadRightHtml = (input: Pick<ManifestInput, "techs" | "owned">): string => {
  const cost = nextManifestCost(input.techs, input.owned);
  const count = input.techs.filter((t) => input.owned.has(t.id)).length;
  return `<span class="v2s-meta">${cost !== undefined ? `Next <b>${cost.toLocaleString("en-US")} Coin</b> · ` : ""}${count} / ${input.techs.length}</span>`;
};

const nodeHtml = (tech: TechInfo, pos: { x: number; y: number }, input: ManifestInput): string => {
  const state = manifestNodeState(tech, input.owned);
  const unlocks = manifestUnlocks(tech);
  const icons = unlocks.slice(0, 3).map((u) => `<span class="v2m-ico v2m-ico-${u.kind}" title="${esc(u.label)}">${u.icon}</span>`).join("");
  const more = unlocks.length > 3 ? `<span class="v2m-ico v2m-ico-more">+${unlocks.length - 3}</span>` : "";
  const selected = tech.id === input.selectedId ? " v2m-node-sel" : "";
  const tag = tech.manifestCategory ? CATEGORY_TAG[tech.manifestCategory] : "";
  const stateLabel = state === "owned" ? "commissioned" : state;
  return `<button type="button" class="v2m-node v2m-node-${state}${selected}" style="left:${pos.x}px;top:${pos.y}px" data-v2-manifest-select="${esc(tech.id)}" aria-pressed="${tech.id === input.selectedId}" aria-label="${esc(tech.name)}, ${stateLabel}" title="${esc(tech.name)}">
    <span class="v2m-tag">${tag}</span><span class="v2m-name">${esc(shortName(tech.name))}</span><span class="v2m-icos">${icons}${more}${state === "owned" ? '<span class="v2m-check">✓</span>' : ""}</span>
  </button>`;
};

const laneHtml = (lane: ManifestLaneLayout, width: number): string => {
  const band = `<div class="v2m-band${lane.closed ? " v2m-band-closed" : ""}" style="top:${lane.y}px;height:${lane.height}px;width:${width}px" aria-hidden="true"></div>`;
  const toggle = `<button type="button" class="v2m-lane" style="top:${lane.y + 5}px" data-v2-manifest-lane="${esc(lane.branch)}" aria-expanded="${!lane.closed}"><span class="v2m-chev">${lane.closed ? "▸" : "▾"}</span>${esc(lane.name)}</button>`;
  const summary = lane.closed
    ? `<div class="v2m-lane-sum" style="top:${lane.y + 5}px"><span><b class="v2m-own">${lane.owned}</b> / ${lane.total} commissioned</span><span><b class="v2m-avail">${lane.available}</b> available</span><span class="v2m-pips">${lane.pips.map((p) => `<i class="v2m-pip-${p}"></i>`).join("")}</span></div>`
    : "";
  return band + toggle + summary;
};

export const manifestTreeHtml = (input: ManifestInput): string => {
  if (input.techs.length === 0) return `<div class="v2s-empty">Loading Manifests…</div>`;
  const layout = manifestLayout(input.techs, input.owned, input.closedLanes);
  const tierHeads = Array.from({ length: layout.tiers }, (_, i) => {
    const tier = i + 1;
    const count = input.techs.filter((t) => t.tier === tier).length;
    const afc = tier <= input.afcTier ? `AFC ${romanTier(tier)} ✓` : `Opens AFC ${romanTier(tier)}`;
    return `<div class="v2m-tier" style="left:${colX(tier)}px;width:${MANIFEST_CARD_W}px"><span class="v2m-tier-n">${romanTier(tier)}</span><span class="v2m-tier-afc${tier <= input.afcTier ? " v2m-tier-open" : ""}">${afc} · ${count}</span></div>`;
  }).join("");
  const lanes = layout.lanes.map((l) => laneHtml(l, layout.width)).join("");
  const segs = layout.segments.map((s) => `<i class="v2m-seg v2m-seg-${s.tone}" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px"></i>`).join("");
  const nodes = input.techs.flatMap((t) => {
    const pos = layout.nodes.get(t.id);
    return pos ? [nodeHtml(t, pos, input)] : [];
  }).join("");
  return `<div class="v2m-tree" style="width:${layout.width}px;height:${layout.height}px">${tierHeads}${lanes}${segs}${nodes}</div>`;
};

export const manifestDetailHtml = (input: ManifestInput): string => {
  const tech = input.techs.find((t) => t.id === input.selectedId) ?? input.techs.find((t) => manifestNodeState(t, input.owned) === "available");
  if (!tech) return "";
  const state = manifestNodeState(tech, input.owned);
  const lane = LANES.find(([b]) => b === tech.branch)?.[1] ?? "Other";
  const meta = `${tech.manifestCategory ? CATEGORY_NAME[tech.manifestCategory] : "Manifest"} · ${lane} · Tier ${romanTier(tech.tier)}`;
  const chips = manifestUnlocks(tech).map((u) => `<span class="v2m-chip"><span class="v2m-ico v2m-ico-${u.kind}">${u.icon}</span>${esc(u.label)}</span>`).join("");
  const byId = new Map(input.techs.map((t) => [t.id, t]));
  const prereqs = tech.prereqIds ?? [];
  const missing = prereqs.some((id) => !input.owned.has(id));
  const req = tech.lockedReason
    ? esc(tech.lockedReason)
    : prereqs.length > 0
      ? `Requires ${prereqs.map((id) => `${esc(shortName(byId.get(id)?.name ?? id))}${input.owned.has(id) ? " ✓" : ""}`).join(" · ")}`
      : "No requirements";
  const cost = tech.requirements.gold;
  const affordable = input.gold >= cost;
  const button = state === "owned"
    ? `<button type="button" class="v2s-btn" disabled>Commissioned</button>`
    : state === "available"
      ? `<button type="button" class="v2s-btn v2s-btn-primary" data-v2-manifest-commission="${esc(tech.id)}"${affordable ? "" : " disabled"} title="${affordable ? "" : `Need ${cost.toLocaleString("en-US")} Coin`}">Commission · ${cost.toLocaleString("en-US")} Coin</button>`
      : `<button type="button" class="v2s-btn" disabled>Locked</button>`;
  return `<div class="v2m-detail-name"><span class="v2m-detail-title">${esc(tech.name)}</span><span class="v2m-detail-meta">${meta}</span></div>
    <div class="v2m-detail-mid"><div class="v2m-chips">${chips}</div><span class="v2m-req${missing || tech.lockedReason ? " v2m-req-missing" : ""}">${req}</span></div>
    ${button}`;
};

export const MANIFEST_LEGEND_HTML = `<div class="v2m-legend"><span><i class="v2m-pip-owned"></i>Commissioned</span><span><i class="v2m-pip-available"></i>Available</span><span><i class="v2m-pip-locked"></i>Locked</span></div>`;
