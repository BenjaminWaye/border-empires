// Pure helpers for GET /admin/tile (register-admin-tile-route.ts): which
// FetchTileDetail calls cover a square, how to merge their 3x3 results, and
// how to describe each tile and what a given player sees of it.
//
// FetchTileDetail returns the 3x3 area around (cx, cy). Its x/y are proto
// uint32, so every centre must already be wrapped into the world before the
// call -- a negative centre would be re-encoded as a huge unsigned value and
// the sim would wrap it to an unrelated column.
import { TILE_OVERLAY_WIRE_FIELDS, type PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

export type WireTile = PlayerSubscriptionSnapshot["tiles"][number];
export type TileVisibility = "full" | "redacted" | "none";

export const ADMIN_TILE_MAX_RADIUS = 6;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/** Torus distance along one axis. */
const axisDistance = (a: number, b: number, size: number): number => {
  const d = Math.abs(wrap(a, size) - wrap(b, size));
  return Math.min(d, size - d);
};

/**
 * Wrapped centres of 3x3 blocks covering the (2r+1)^2 square around (x, y).
 * Blocks start at the square's first column/row (centre x - r + 1) and step by
 * 3, so every radius 0..6 is covered with ceil((2r+1)/3) blocks per axis; the
 * last block may overhang, and filterToSquare drops the overhang.
 */
export const blockCentres = (x: number, y: number, radius: number, width: number, height: number): Array<{ x: number; y: number }> => {
  const perAxis = Math.ceil((2 * radius + 1) / 3);
  const centres: Array<{ x: number; y: number }> = [];
  for (let j = 0; j < perAxis; j += 1) {
    for (let i = 0; i < perAxis; i += 1) {
      centres.push({ x: wrap(x - radius + 1 + 3 * i, width), y: wrap(y - radius + 1 + 3 * j, height) });
    }
  }
  return centres;
};

export const isInSquare = (tile: { x: number; y: number }, x: number, y: number, radius: number, width: number, height: number): boolean =>
  axisDistance(tile.x, x, width) <= radius && axisDistance(tile.y, y, height) <= radius;

export const tileKey = (x: number, y: number): string => `${x},${y}`;

const OVERLAY_FIELDS: readonly string[] = TILE_OVERLAY_WIRE_FIELDS.map((field) => field.camel);
const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

/** A tile with every *Json wire field (overlays and townJson) parsed into an object under its plain name. */
export const describeTile = (tile: WireTile): Record<string, unknown> => {
  const described: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(tile)) {
    if (value === undefined) continue;
    if (field.endsWith("Json") && typeof value === "string") described[field.slice(0, -"Json".length)] = parseJson(value);
    else described[field] = value;
  }
  return described;
};

/**
 * How much of `full` the player's own filtered copy carries. The sim's player
 * filter can return a tile but strip it (a lock-target stub without
 * structures, an unresearched resource hidden), so "returned" alone isn't
 * "visible".
 */
export const classifyVisibility = (full: WireTile, seen: WireTile | undefined): { visibility: TileVisibility; hiddenFields: string[] } => {
  if (!seen) return { visibility: "none", hiddenFields: [] };
  const fullRecord = full as Record<string, unknown>;
  const seenRecord = seen as Record<string, unknown>;
  const hiddenFields = ["resource", "townJson", ...OVERLAY_FIELDS].filter((field) => fullRecord[field] !== undefined && seenRecord[field] === undefined);
  return { visibility: hiddenFields.length > 0 ? "redacted" : "full", hiddenFields };
};

const economicStructureType = (tile: WireTile): string | undefined => {
  const parsed = tile.economicStructureJson ? parseJson(tile.economicStructureJson) : undefined;
  return parsed && typeof parsed === "object" && typeof (parsed as { type?: unknown }).type === "string" ? (parsed as { type: string }).type : undefined;
};

/**
 * One grid character per tile, highest precedence first: T town, A AFC,
 * F fort, O observatory (Aether Tower), S siege battery, B relay beacon,
 * E other economic structure, * any other overlay; else terrain: ~ sea,
 * c coastal sea, ^ mountain, . land.
 */
export const tileGridChar = (tile: WireTile): string => {
  if (tile.townJson || tile.townType) return "T";
  if (tile.afcJson) return "A";
  if (tile.fortJson) return "F";
  if (tile.observatoryJson) return "O";
  if (tile.siegeBatteryJson) return "S";
  if (tile.economicStructureJson) return economicStructureType(tile) === "RELAY_BEACON" ? "B" : "E";
  if (OVERLAY_FIELDS.some((field) => (tile as Record<string, unknown>)[field] !== undefined)) return "*";
  if (tile.terrain === "SEA") return "~";
  if (tile.terrain === "COASTAL_SEA") return "c";
  if (tile.terrain === "MOUNTAIN") return "^";
  return ".";
};

export const VISIBILITY_GRID_CHAR: Readonly<Record<TileVisibility, string>> = { full: "#", redacted: "r", none: "-" };

/** Rows north to south, columns west to east, each prefixed with its y; `?` for a tile the sim didn't return. */
export const renderGrid = (
  x: number,
  y: number,
  radius: number,
  width: number,
  height: number,
  charAt: (wx: number, wy: number) => string | undefined
): string[] => {
  const rows: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    const wy = wrap(y + dy, height);
    let row = "";
    for (let dx = -radius; dx <= radius; dx += 1) row += charAt(wrap(x + dx, width), wy) ?? "?";
    rows.push(`${String(wy).padStart(3)} ${row}`);
  }
  return rows;
};
