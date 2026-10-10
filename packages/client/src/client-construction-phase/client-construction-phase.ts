import {
  FORT_TIER_LADDER,
  MANPOWER_COST_MS_PER_POINT,
  MANPOWER_COST_REMOVAL_MS_PER_POINT,
  RELAY_BEACON_FIRST_TIER_COUNT,
  SIEGE_TIER_LADDER,
  economicStructureBuildDurationMs,
  siegeOutpostBuildDurationMs,
  structureBuildDurationMs,
  structureBuildDurationMsForManpowerCost,
  structureBuildManpowerCost,
  type EconomicStructureType
} from "@border-empires/shared";
import type { Tile } from "../client-types.js";

// docs/construction-animation-plan.md. Structures took 1h to many hours to
// build when this was designed (now 1s per manpower point -- minutes), so
// construction is shown as discrete phases (pieces appear bottom-up,
// one height band per phase) with a parts-crate stack that is consumed within
// each phase, rather than a smooth rise that would look frozen at that scale.
// Everything is a pure function of (tile record, now): nothing is stored per
// site, so a rebuild or reconnect can never leave the visuals out of sync.
export const CONSTRUCTION_PHASES = 4;
export const CONSTRUCTION_CRATES_PER_PHASE = 4;
export const CONSTRUCTION_STEPS = CONSTRUCTION_PHASES * CONSTRUCTION_CRATES_PER_PHASE;

// Pinprick figures are only visible in numbers: the settle swarm runs 2 to 18, so a crew of 4 to 12.
const MANPOWER_PER_CREW_FIGURE = 12.5;
const CREW_MIN = 4;
export const CREW_MAX = 12;

export type ConstructionDirection = "build" | "remove";

export type AfcOffset = { readonly dx: number; readonly dy: number };

export type ConstructionSite = {
  // World tile coordinates: stable seeds for per-site animation timing (scene
  // coordinates shift whenever the renderer re-anchors on a rebuild).
  readonly x: number;
  readonly y: number;
  // Tile offset (wrap-aware) from this site to its owner's home AFC, where the fabricated
  // parts come from. Undefined when that AFC is not known: no delivery pod is shown then.
  readonly afcOffset: AfcOffset | undefined;
  readonly direction: ConstructionDirection;
  // Which structure record this is. Only "economicStructure" goes through the
  // shared 3D piece builder (and so gets phase-gated pieces); the others keep
  // their dedicated overlays and only get the ambient crew/crates.
  readonly field: "fort" | "observatory" | "siegeOutpost" | "economicStructure";
  readonly structureType: string;
  readonly ownerId: string;
  // 0..1 share of the construction window that has elapsed.
  readonly fraction: number;
  // How many of the CONSTRUCTION_PHASES height bands of the finished
  // structure are standing right now (1..CONSTRUCTION_PHASES). Building adds a
  // band per phase; removal takes them away top-down.
  readonly visibleBands: number;
  // Index of the current phase (0..CONSTRUCTION_PHASES-1), in the direction of
  // travel. Changes exactly when a delivery pod should arrive.
  readonly phase: number;
  // The construction window, so per-frame animation (crates, crew) can
  // recompute its state from the clock without a terrain rebuild.
  readonly startedAtMs: number;
  readonly completesAtMs: number;
  readonly crew: number;
  // Past completesAt but still not completed server-side, or paused by an attack
  // on the tile: the crew freezes.
  readonly stalled: boolean;
  // Set while an attack on the tile has paused the build: everything above is
  // frozen at this instant, so per-frame readers must use it instead of the clock.
  readonly pausedAtMs?: number | undefined;
  // Wall-clock time the next *phase* boundary passes, or undefined once the
  // window has elapsed. Only phase changes alter what the 3D renderer lays
  // out (gated pieces, scaffold height), so only they force a rebuild.
  readonly nextPhaseAtMs: number | undefined;
};

// Crates currently stacked beside the site (1..CONSTRUCTION_CRATES_PER_PHASE).
// Building: a pod delivers a full stack at each phase start and the crew uses
// it up. Removal: the crew packs parts, so the stack grows. Pure in the clock
// so the crate layer can call it every frame.
export const constructionCratesAt = (direction: ConstructionDirection, startedAtMs: number, completesAtMs: number, nowMs: number): number => {
  const fraction = Math.max(0, Math.min(1, (nowMs - startedAtMs) / Math.max(1, completesAtMs - startedAtMs)));
  const stepsDone = Math.min(CONSTRUCTION_STEPS - 1, Math.floor(fraction * CONSTRUCTION_STEPS));
  const stepInPhase = stepsDone % CONSTRUCTION_CRATES_PER_PHASE;
  return direction === "build" ? CONSTRUCTION_CRATES_PER_PHASE - stepInPhase : stepInPhase + 1;
};

export const crewSizeForManpower = (manpower: number): number =>
  Math.max(CREW_MIN, Math.min(CREW_MAX, Math.round(manpower / MANPOWER_PER_CREW_FIGURE)));

type ConstructionRecord = {
  readonly field: ConstructionSite["field"];
  readonly structureType: string;
  readonly ownerId: string;
  readonly status: "under_construction" | "removing";
  readonly completesAt: number;
  readonly startedAt: number | undefined;
  readonly manpower: number;
  // Duration estimate for records that predate `startedAt` (builds already in
  // flight when it shipped). Exact for the common case; wrong only for tier
  // upgrades / speed effects, and only until those builds finish.
  readonly estimatedDurationMs: number;
};

// The shared cost/tier tables only know the structure types this client build
// knows. A newer server can send a type or variant it does not: that must
// degrade to a generic site (default crew and duration), never throw, because
// this runs every frame in 2D and on every 3D rebuild.
const FALLBACK_MANPOWER = 0;
const FALLBACK_DURATION_MS = 300_000;
const safely = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

// Only used when a record has no startedAt. The owned count is unknown here, and a Relay
// Beacon's count-0 duration is 0 (the first five are instant), which would hide a real,
// slower build entirely; a beacon that is genuinely under construction is a paid-tier one.
const estimatedEconomicDurationMs = (type: EconomicStructureType): number =>
  type === "RELAY_BEACON" ? economicStructureBuildDurationMs(type, RELAY_BEACON_FIRST_TIER_COUNT) : structureBuildDurationMs(type);

const inFlight = (status: string | undefined): status is "under_construction" | "removing" =>
  status === "under_construction" || status === "removing";

// `only` restricts the lookup to one structure slot: a tile can carry several
// (e.g. a fort being built beside an active economic structure), and a renderer
// drawing one structure must not pick up another's in-flight record.
// A removal runs at MANPOWER_COST_REMOVAL_MS_PER_POINT instead of the build rate.
const recordForTile = (tile: Tile, only: ConstructionSite["field"] | undefined): ConstructionRecord | undefined => {
  const record = buildRecordForTile(tile, only);
  if (record?.status !== "removing") return record;
  return { ...record, estimatedDurationMs: Math.round((record.estimatedDurationMs * MANPOWER_COST_REMOVAL_MS_PER_POINT) / MANPOWER_COST_MS_PER_POINT) };
};

const buildRecordForTile = (tile: Tile, only: ConstructionSite["field"] | undefined): ConstructionRecord | undefined => {
  const { fort, observatory, siegeOutpost, economicStructure } = tile;
  const allowed = (field: ConstructionSite["field"]): boolean => only === undefined || only === field;
  if (allowed("fort") && fort && inFlight(fort.status) && typeof fort.completesAt === "number") {
    const variant = fort.variant ?? "FORT";
    const manpower = safely(() => FORT_TIER_LADDER[variant].manpower, FALLBACK_MANPOWER);
    // Build time follows the tier's own manpower cost (as the simulation charges it), not the base Fort's.
    const estimatedDurationMs = safely(() => structureBuildDurationMsForManpowerCost(FORT_TIER_LADDER[variant].manpower), FALLBACK_DURATION_MS);
    return { field: "fort", structureType: variant, ownerId: fort.ownerId, status: fort.status, completesAt: fort.completesAt, startedAt: fort.startedAt, manpower, estimatedDurationMs };
  }
  if (allowed("observatory") && observatory && inFlight(observatory.status) && typeof observatory.completesAt === "number") {
    return { field: "observatory", structureType: "OBSERVATORY", ownerId: observatory.ownerId, status: observatory.status, completesAt: observatory.completesAt, startedAt: observatory.startedAt, manpower: safely(() => structureBuildManpowerCost("OBSERVATORY"), FALLBACK_MANPOWER), estimatedDurationMs: safely(() => structureBuildDurationMs("OBSERVATORY"), FALLBACK_DURATION_MS) };
  }
  if (allowed("siegeOutpost") && siegeOutpost && inFlight(siegeOutpost.status) && typeof siegeOutpost.completesAt === "number") {
    const variant = siegeOutpost.variant ?? "SIEGE_OUTPOST";
    return { field: "siegeOutpost", structureType: variant, ownerId: siegeOutpost.ownerId, status: siegeOutpost.status, completesAt: siegeOutpost.completesAt, startedAt: siegeOutpost.startedAt, manpower: safely(() => SIEGE_TIER_LADDER[variant].manpower, FALLBACK_MANPOWER), estimatedDurationMs: safely(() => siegeOutpostBuildDurationMs(variant), FALLBACK_DURATION_MS) };
  }
  if (allowed("economicStructure") && economicStructure && inFlight(economicStructure.status) && typeof economicStructure.completesAt === "number") {
    const type = economicStructure.type as EconomicStructureType;
    return { field: "economicStructure", structureType: type, ownerId: economicStructure.ownerId, status: economicStructure.status, completesAt: economicStructure.completesAt, startedAt: economicStructure.startedAt, manpower: safely(() => structureBuildManpowerCost(type), FALLBACK_MANPOWER), estimatedDurationMs: safely(() => estimatedEconomicDurationMs(type), FALLBACK_DURATION_MS) };
  }
  return undefined;
};

export const constructionSiteForTile = (tile: Tile, nowMs: number, only?: ConstructionSite["field"]): ConstructionSite | undefined => {
  const record = recordForTile(tile, only);
  if (!record) return undefined;
  const startedAt = record.startedAt ?? record.completesAt - record.estimatedDurationMs;
  // A zero-length window is an instant placement (the first Relay Beacons come
  // down "with the landing party", completesAt === startedAt): nothing to show.
  if (record.completesAt <= startedAt) return undefined;
  const durationMs = record.completesAt - startedAt;
  // A build paused (e.g. under attack) is frozen at the moment it paused.
  const pausedAt = record.status === "under_construction" ? tile[record.field]?.pausedAt : undefined;
  const rawFraction = ((pausedAt ?? nowMs) - startedAt) / durationMs;
  const fraction = Math.max(0, Math.min(1, rawFraction));
  const phase = Math.min(CONSTRUCTION_PHASES - 1, Math.floor(fraction * CONSTRUCTION_PHASES));
  const direction: ConstructionDirection = record.status === "removing" ? "remove" : "build";
  const building = direction === "build";
  return {
    x: tile.x,
    y: tile.y,
    afcOffset: undefined,
    direction,
    field: record.field,
    structureType: record.structureType,
    ownerId: record.ownerId,
    fraction,
    visibleBands: building ? phase + 1 : CONSTRUCTION_PHASES - phase,
    phase,
    startedAtMs: startedAt,
    completesAtMs: record.completesAt,
    crew: crewSizeForManpower(record.manpower),
    stalled: rawFraction >= 1 || pausedAt !== undefined,
    pausedAtMs: pausedAt,
    nextPhaseAtMs: rawFraction >= 1 || pausedAt !== undefined ? undefined : startedAt + ((phase + 1) / CONSTRUCTION_PHASES) * durationMs
  };
};

// The clock the crew wanders on (epoch ms, like the construction window). A stalled build --
// paused under attack, or overdue -- stops it at the moment the build stopped, so the figures
// stay exactly where they were standing rather than jumping somewhere new.
export const constructionCrewClockMs = (site: Pick<ConstructionSite, "stalled" | "pausedAtMs" | "completesAtMs">, epochMs: number): number =>
  site.stalled ? (site.pausedAtMs ?? site.completesAtMs) : epochMs;
