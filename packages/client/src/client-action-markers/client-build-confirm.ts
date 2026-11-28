// "Hydrogarden started" on the tile once the server's tile update shows the
// structure a player just ordered (first-15 playtest r1, pt-worldbuilder: "Build
// Hydrogarden… closed with no confirmation"). The order is remembered here when
// it is sent and confirmed when TILE_DELTA_BATCH carries the structure. The
// client's own optimistic structure (optimisticPending "structure_build", kept
// through unrelated tile updates by the optimistic merge) never confirms: only
// the server's tile does. A rejection never shows it; the entry just expires.
import type { Tile } from "../client-types.js";
import { showActionMarker } from "./client-action-markers.js";

/** How long a sent build waits for the server's tile update before it is forgotten. */
export const BUILD_CONFIRM_WAIT_MS = 60_000;

type PendingBuild = { structureType: string; name: string; hadStructure: boolean; until: number };
const pending = new Map<string, PendingBuild>();

const structureOn = (tile: Tile | undefined, structureType: string): { status?: string } | undefined => {
  if (!tile) return undefined;
  if (structureType === "FORT" || structureType === "PALISADE") return tile.fort;
  if (structureType === "OBSERVATORY") return tile.observatory;
  if (structureType === "SIEGE_BATTERY") return tile.siegeBattery;
  return tile.economicStructure?.type === structureType ? tile.economicStructure : undefined;
};

/** "Hydrogarden at (3, 4)" -> "Hydrogarden". */
const structureName = (label: string): string => label.replace(/ at \(-?\d+, -?\d+\)$/, "");

/** Remembers a build the player just sent; `tile` is the tile as it was when sent. */
export const expectBuildConfirmation = (tileKey: string, structureType: string, label: string, tile: Tile | undefined, nowMs = Date.now()): void => {
  pending.set(tileKey, { structureType, name: structureName(label), hadStructure: Boolean(structureOn(tile, structureType)), until: nowMs + BUILD_CONFIRM_WAIT_MS });
};

/**
 * After a tile update: confirms each pending build whose tile now shows the structure, owned by `me`.
 * An upgrade (a fort already stood there) confirms only once the new one is under construction.
 */
export const confirmBuildsFromTiles = (tileKeys: Iterable<string>, tileAt: (key: string) => Tile | undefined, me: string, nowMs = Date.now()): void => {
  if (pending.size === 0) return;
  for (const key of tileKeys) {
    const build = pending.get(key);
    if (!build) continue;
    if (build.until < nowMs) { pending.delete(key); continue; }
    const tile = tileAt(key);
    if (tile?.optimisticPending === "structure_build") continue;
    const structure = structureOn(tile, build.structureType);
    if (!structure || tile?.ownerId !== me || (build.hadStructure && structure.status !== "under_construction")) continue;
    pending.delete(key);
    if (!tile) continue;
    showActionMarker(tile.x, tile.y, structure.status === "under_construction" ? `${build.name} started` : `${build.name} built`, nowMs);
  }
  for (const [key, build] of pending) if (build.until < nowMs) pending.delete(key);
};

/** Test helper. */
export const resetBuildConfirmations = (): void => pending.clear();
