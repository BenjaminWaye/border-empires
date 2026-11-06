// Capture aftermath: what a capture leaves on the ground while the capturing
// troops hold the tile (shared capture-hold.ts). Read by both map renderers
// (client-map-2d-capture-aftermath.ts, client-map-3d-capture-aftermath-fx.ts)
// and the tile menu.
//   - Relay Beacons and Siege Batteries are razed on capture (sim
//     capture-structures.ts), so their wreckage stays as rubble.
//   - A captured fort transfers but is wrecked: it gives no defense until the
//     hold ends and the tile is garrisoned (the sim can't settle a held tile
//     early, runtime-settlement-start.ts), so it shows rubble around its base.
//   - A captured resource smokes, and pays no resource slots until then.
// The rubble and smoke clear when the hold ends.
import { WAR_SCAR_MAX_LEVEL, isCaptureHoldActive, isFortDefending, liveWarScarLevel } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

/** What lies wrecked on the tile: a razed Relay Beacon or siege engine (by variant), or a breached fort. */
export type CaptureRubbleKind = "FORT" | "RELAY_BEACON" | "SIEGE_BATTERY" | "SIEGE_TOWER" | "DREAD_TOWER";
type RazedKind = Exclude<CaptureRubbleKind, "FORT">;

export type CaptureAftermath = {
  /** Wreckage on the ground, at most one entry per kind. */
  rubble: CaptureRubbleKind[];
  /** A captured resource still burning. */
  smoke: boolean;
  /** A captured dock set ablaze on its quay. */
  burningDock: boolean;
  /** Epoch ms the aftermath clears. */
  until: number;
};

type AftermathTile = Pick<Tile, "ownershipState" | "captureHoldUntil" | "fort" | "resource" | "dockId">;

// The server sends no record of a razed structure: the capture delta simply
// drops it. The tile merge notices that drop (noteRazedStructuresOnCapture)
// and keeps the wreck here until the hold ends. Bounded like the capture-hold
// index: expired entries are swept on every write past the threshold and
// ignored on read, so it only ever holds tiles razed within one hold window.
const RAZED_INDEX_SWEEP_AT = 256;
const razedByKey = new Map<string, { kinds: RazedKind[]; until: number }>();

const sweepExpired = (nowEpochMs: number): void => {
  for (const [key, entry] of razedByKey) if (entry.until <= nowEpochMs) razedByKey.delete(key);
};

// A structure keeps its builder's ownerId, so "the tile changed hands" is read
// off the structure rather than the tile: COMBAT_RESULT (and a predicted
// combat outcome) flips the tile's owner before the TILE_DELTA that drops the
// razed structure arrives, so by then the cached tile already has the new owner.
const razedKindsDropped = (existing: Tile, merged: Tile): RazedKind[] => {
  const kinds: RazedKind[] = [];
  const takenFrom = (structureOwnerId: string | undefined): boolean => Boolean(structureOwnerId) && structureOwnerId !== merged.ownerId;
  const beacon = existing.economicStructure;
  if (beacon?.type === "RELAY_BEACON" && beacon.status !== "under_construction" && takenFrom(beacon.ownerId) && merged.economicStructure?.type !== "RELAY_BEACON") kinds.push("RELAY_BEACON");
  const battery = existing.siegeBattery;
  if (battery && battery.status !== "under_construction" && takenFrom(battery.ownerId) && !merged.siegeBattery) kinds.push(battery.variant === "SIEGE_TOWER" || battery.variant === "DREAD_TOWER" ? battery.variant : "SIEGE_BATTERY");
  return kinds;
};

/**
 * Called by the tile merge with the tile before and after an update: when a
 * standing Relay Beacon or Siege Battery the client was watching disappears
 * because the tile was just captured (it is now someone else's, in a live
 * capture hold), remember its wreck until the hold ends. A tile last seen under fog,
 * or one resynced after a reconnect, may have changed hands long ago: that
 * leaves no wreck, so neither does a capture with no hold (e.g. by barbarians).
 */
export const noteRazedStructuresOnCapture = (existing: Tile | undefined, merged: Tile, tileKey: string, nowEpochMs: number = Date.now()): void => {
  if (!existing || existing.fogged || !merged.ownerId) return;
  if (!isCaptureHoldActive(merged, nowEpochMs)) return;
  const kinds = razedKindsDropped(existing, merged);
  if (kinds.length === 0) return;
  razedByKey.set(tileKey, { kinds, until: merged.captureHoldUntil! });
  if (razedByKey.size > RAZED_INDEX_SWEEP_AT) sweepExpired(nowEpochMs);
};

/** A captured fort that can't defend yet: it stands, but wrecked, while the capturing troops hold the tile. */
export const isFortWreckedByCapture = (tile: AftermathTile | undefined, nowEpochMs: number = Date.now()): boolean =>
  Boolean(tile?.fort && isFortDefending(tile.fort) && isCaptureHoldActive(tile, nowEpochMs));

/** What this tile's capture left behind right now, or undefined when nothing. */
export const captureAftermathForTile = (tile: AftermathTile | undefined, tileKey: string, nowEpochMs: number = Date.now()): CaptureAftermath | undefined => {
  const rubble: CaptureRubbleKind[] = [];
  let until = 0;
  const razed = razedByKey.get(tileKey);
  if (razed && razed.until > nowEpochMs) {
    rubble.push(...razed.kinds);
    until = razed.until;
  }
  const held = isCaptureHoldActive(tile, nowEpochMs);
  if (held && isFortWreckedByCapture(tile, nowEpochMs)) rubble.push("FORT");
  const smoke = held && Boolean(tile?.resource);
  const burningDock = held && Boolean(tile?.dockId);
  if (held) until = Math.max(until, tile!.captureHoldUntil!);
  return rubble.length > 0 || smoke || burningDock ? { rubble, smoke, burningDock, until } : undefined;
};

const RUBBLE_MENU_LABELS: Record<RazedKind, string> = { RELAY_BEACON: "Relay Beacon", SIEGE_BATTERY: "Siege Battery", SIEGE_TOWER: "Siege Tower", DREAD_TOWER: "Dread Tower" };

/** Tile-menu line for battle scars (shared war-scars.ts), or undefined when the ground has none. */
export const warScarMenuLine = (tile: Pick<Tile, "warScarLevel" | "warScarUntil">, nowEpochMs: number = Date.now()): string | undefined => {
  const level = liveWarScarLevel(tile, nowEpochMs);
  if (level <= 0) return undefined;
  const hours = Math.max(1, Math.ceil((tile.warScarUntil! - nowEpochMs) / 3_600_000));
  return `Battle-scarred ground (${level}/${WAR_SCAR_MAX_LEVEL}). Each battle here deepens the scars; they fade in ${hours}h without more fighting.`;
};

/** Tile-menu lines explaining the aftermath, battle scars included. */
export const captureAftermathMenuLines = (tile: Tile, tileKey: string, nowEpochMs: number = Date.now()): string[] => {
  const scarLine = warScarMenuLine(tile, nowEpochMs);
  const lines: string[] = scarLine ? [scarLine] : [];
  const aftermath = captureAftermathForTile(tile, tileKey, nowEpochMs);
  if (!aftermath) return lines;
  for (const kind of aftermath.rubble) {
    if (kind === "FORT") lines.push("Fort wrecked in the capture. It gives no defense until the capturing troops finish holding this tile and it is garrisoned.");
    else lines.push(`${RUBBLE_MENU_LABELS[kind]} destroyed in the capture.`);
  }
  if (aftermath.burningDock) lines.push("Dock set ablaze in the capture. It pays no gold until the capturing troops finish holding it and it is garrisoned.");
  if (aftermath.smoke) lines.push("Resource captured. Its resource slots only count once the capturing troops finish holding this tile and it is garrisoned.");
  return lines;
};

/** Test-only: forget every remembered wreck. */
export const resetCaptureAftermathIndex = (): void => razedByKey.clear();
