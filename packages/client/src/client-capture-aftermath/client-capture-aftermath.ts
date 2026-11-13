// Capture aftermath: what a capture leaves on the ground while the capturing
// troops hold the tile (shared capture-hold.ts). Read by both map renderers
// (client-map-2d-capture-aftermath.ts, client-map-3d-capture-aftermath-fx.ts)
// and the tile menu.
//   - Relay Beacons and Siege Batteries are razed on capture (sim
//     capture-structures.ts); their wreck lies on the tile for 24h (shared
//     razed-wreck.ts), outlasting the hold.
//   - A captured fort transfers but is wrecked: it gives no defense until the
//     hold ends and the tile is garrisoned (the sim can't settle a held tile
//     early, runtime-settlement-start.ts), so it shows rubble around its base.
//   - A captured resource smokes, and pays no resource slots until then.
// The fort rubble and smoke clear when the hold ends.
import { WAR_SCAR_MAX_LEVEL, isCaptureHoldActive, isFortDefending, liveRazedWreck, liveWarScarLevel } from "@border-empires/shared";
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

type AftermathTile = Pick<Tile, "ownershipState" | "captureHoldUntil" | "fort" | "resource" | "dockId" | "razedWreck" | "razedWreckUntil" | "economicStructure" | "siegeBattery">;

/**
 * The wreck of a Relay Beacon or siege engine razed in a capture (shared
 * razed-wreck.ts): the sim stamps it on the tile for 24h, whoever owns it
 * since. Anything built on the tile afterwards stands on the wreck, so it is
 * no longer drawn.
 */
const razedWreckOnTile = (tile: AftermathTile | undefined, nowEpochMs: number): RazedKind | undefined =>
  tile?.economicStructure || tile?.siegeBattery ? undefined : liveRazedWreck(tile, nowEpochMs);

/** A captured fort that can't defend yet: it stands, but wrecked, while the capturing troops hold the tile. */
export const isFortWreckedByCapture = (tile: AftermathTile | undefined, nowEpochMs: number = Date.now()): boolean =>
  Boolean(tile?.fort && isFortDefending(tile.fort) && isCaptureHoldActive(tile, nowEpochMs));

/** What this tile's capture left behind right now, or undefined when nothing. */
export const captureAftermathForTile = (tile: AftermathTile | undefined, nowEpochMs: number = Date.now()): CaptureAftermath | undefined => {
  const rubble: CaptureRubbleKind[] = [];
  let until = 0;
  const razed = razedWreckOnTile(tile, nowEpochMs);
  if (razed) {
    rubble.push(razed);
    until = tile!.razedWreckUntil!;
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
export const captureAftermathMenuLines = (tile: Tile, nowEpochMs: number = Date.now()): string[] => {
  const scarLine = warScarMenuLine(tile, nowEpochMs);
  const lines: string[] = scarLine ? [scarLine] : [];
  const aftermath = captureAftermathForTile(tile, nowEpochMs);
  if (!aftermath) return lines;
  for (const kind of aftermath.rubble) {
    if (kind === "FORT") lines.push("Fort wrecked in the capture. It gives no defense until the capturing troops finish holding this tile and it is garrisoned.");
    else lines.push(`${RUBBLE_MENU_LABELS[kind]} destroyed here.`);
  }
  if (aftermath.burningDock) lines.push("Dock set ablaze in the capture. It pays no gold until the capturing troops finish holding it and it is garrisoned.");
  if (aftermath.smoke) lines.push("Resource captured. Its resource slots only count once the capturing troops finish holding this tile and it is garrisoned.");
  return lines;
};
