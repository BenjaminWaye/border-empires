// What the player's scout drone spots while it flies (SCOUT_FINDS, docs/explore-scout-plan.md §13).
// Each message pops over the map as it arrives -- "+1 Town", "+3 Fish" -- so a 2-3 minute flight pays
// out as it goes instead of only at the landing report (player reviews 2026-11-21). The finds are kept
// for the flight, so the landing card's chips can each frame where those finds are.
import { SCOUT_FINDS_MESSAGE_TYPE, type ScoutFind } from "@border-empires/shared";
import { SCOUT_FIND_LABEL, pluralLabel, scoutResourceLabel } from "./client-scout-drone-find-labels.js";

/** How long a pop stays on the map (the 3D layer animates it, client-map-3d-scout-drone-find-pops.ts). */
export const SCOUT_FIND_POP_MS = 2_800;

export type ScoutFindPop = { id: number; x: number; y: number; text: string; at: number };

export type ScoutFindsState = {
  /** The flight's finds so far (cleared when a new flight launches); `launchedAt` is server clock. */
  scoutDroneFinds: { launchedAt: number; all: ScoutFind[] } | undefined;
  /** Pops still on screen, newest last. */
  scoutFindPops: ScoutFindPop[];
  /** The find a report-card chip last framed: the 3D map rings it until the card closes. */
  scoutFindFocus: { x: number; y: number } | undefined;
};

export const createInitialScoutFindsState = (): ScoutFindsState => ({ scoutDroneFinds: undefined, scoutFindPops: [], scoutFindFocus: undefined });

let nextPopId = 1;

const FIND_KINDS: ReadonlySet<string> = new Set(["town", "dock", "waystation", "watchtower", "resource", "empire", "defense"]);

const parseFinds = (value: unknown): ScoutFind[] => {
  if (!Array.isArray(value)) return [];
  const finds: ScoutFind[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.kind !== "string" || !FIND_KINDS.has(raw.kind) || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue;
    finds.push({ kind: raw.kind as ScoutFind["kind"], x: raw.x as number, y: raw.y as number, ...(typeof raw.resource === "string" ? { resource: raw.resource } : {}) });
  }
  return finds;
};

/** The pop for a group of finds of one kind (and resource) from one message. */
export const scoutFindPopText = (kind: ScoutFind["kind"], count: number, resource?: string): string =>
  kind === "resource" && resource ? `+${count} ${scoutResourceLabel(resource)}` : `+${count} ${pluralLabel(SCOUT_FIND_LABEL[kind], count)}`;

/**
 * Applies SCOUT_FINDS: keeps the finds for the flight and queues one pop per kind (per resource) at the
 * first find of that group. True when `msg` was SCOUT_FINDS.
 */
export const handleScoutFindsMessage = (msg: Record<string, unknown>, state: ScoutFindsState, nowMs: number): boolean => {
  if (msg.type !== SCOUT_FINDS_MESSAGE_TYPE) return false;
  const launchedAt = Number.isFinite(msg.launchedAt) ? (msg.launchedAt as number) : undefined;
  const finds = parseFinds(msg.finds);
  if (launchedAt === undefined || finds.length === 0) return true;
  if (state.scoutDroneFinds?.launchedAt !== launchedAt) state.scoutDroneFinds = { launchedAt, all: [] };
  state.scoutDroneFinds.all.push(...finds);
  const groups = new Map<string, { kind: ScoutFind["kind"]; resource?: string; first: ScoutFind; count: number }>();
  for (const find of finds) {
    const key = `${find.kind}:${find.resource ?? ""}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { kind: find.kind, ...(find.resource ? { resource: find.resource } : {}), first: find, count: 1 });
  }
  const live = state.scoutFindPops.filter((pop) => nowMs - pop.at < SCOUT_FIND_POP_MS);
  for (const group of groups.values()) {
    live.push({ id: nextPopId++, x: group.first.x, y: group.first.y, text: scoutFindPopText(group.kind, group.count, group.resource), at: nowMs });
  }
  state.scoutFindPops = live;
  return true;
};

/** Where the flight's finds of one kind (and resource) are, in the order spotted: the card's chips step through them. */
export const scoutFindPlaces = (state: ScoutFindsState, kind: ScoutFind["kind"], resource?: string): Array<{ x: number; y: number }> =>
  (state.scoutDroneFinds?.all ?? []).filter((find) => find.kind === kind && (resource === undefined || find.resource === resource));
