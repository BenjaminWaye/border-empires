// Razed wreck: what is left of a Relay Beacon or siege engine destroyed when
// its tile was taken (the sim razes both on capture, capture-structures.ts).
// The wreck lies on the ground for RAZED_WRECK_DURATION_MS whoever owns the
// tile, so everyone who looks there later still sees what was destroyed.
// Presentation only: a wreck changes no rules, and anything built on the tile
// afterwards stands on top of it (the renderers then stop drawing it).

import type { SiegeBatteryVariant } from "../types.js";

export const RAZED_WRECK_DURATION_MS = 24 * 60 * 60 * 1000;

export type RazedWreckKind = "RELAY_BEACON" | SiegeBatteryVariant;
export const RAZED_WRECK_KINDS: readonly RazedWreckKind[] = ["RELAY_BEACON", "SIEGE_BATTERY", "SIEGE_TOWER", "DREAD_TOWER"];

type RazedWreckTile = { razedWreck?: string | undefined; razedWreckUntil?: number | undefined };
type RazableTile = {
  economicStructure?: { type: string; status: string } | undefined;
  siegeBattery?: { status: string; variant?: SiegeBatteryVariant | undefined } | undefined;
} & RazedWreckTile;

export const isRazedWreckKind = (value: unknown): value is RazedWreckKind =>
  typeof value === "string" && (RAZED_WRECK_KINDS as readonly string[]).includes(value);

/** The wreck lying on the tile at `nowMs`, or undefined when it has none or it has cleared. */
export const liveRazedWreck = (tile: RazedWreckTile | undefined, nowMs: number): RazedWreckKind | undefined =>
  isRazedWreckKind(tile?.razedWreck) && typeof tile.razedWreckUntil === "number" && tile.razedWreckUntil > nowMs ? tile.razedWreck : undefined;

/**
 * The wreck fields a tile should carry once it changes hands: a standing
 * (finished) Relay Beacon or siege engine on it is razed and leaves a fresh
 * 24h wreck; otherwise a wreck already lying there stays until it clears.
 * Returns {} when the tile has none.
 */
export const razedWreckFieldsOnCapture = (
  previous: RazableTile | undefined,
  nowMs: number
): { razedWreck?: RazedWreckKind; razedWreckUntil?: number } => {
  const until = nowMs + RAZED_WRECK_DURATION_MS;
  const beacon = previous?.economicStructure;
  if (beacon?.type === "RELAY_BEACON" && beacon.status !== "under_construction") return { razedWreck: "RELAY_BEACON", razedWreckUntil: until };
  const battery = previous?.siegeBattery;
  if (battery && battery.status !== "under_construction") return { razedWreck: battery.variant ?? "SIEGE_BATTERY", razedWreckUntil: until };
  const live = liveRazedWreck(previous, nowMs);
  return live ? { razedWreck: live, razedWreckUntil: previous!.razedWreckUntil! } : {};
};
