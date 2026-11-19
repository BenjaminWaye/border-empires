// Where the guide asks the player to send their scout drone, and whether the
// drone can go. Explore is the game's way into the unknown: tapping
// unexplored ground offers only Explore (client-unexplored-tile-menu.ts), the
// drone is free, flies from the AFC and reports towns, food and rivals
// (docs/explore-scout-plan.md). So when the guide has nothing in sight to
// point at, it asks for a drone flight before a Relay Beacon.
//
// The target is a tile the player has never seen (state.discoveredTiles, the
// same test tileVisibilityStateAt uses for "unexplored"), so tapping it opens
// the Explore menu. It is the nearest unexplored tile to home pushed further out
// along the same line, so the flight crosses new ground instead of stopping one
// tile past what the player already sees.

import { tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ScoutDroneFlight } from "@border-empires/shared";

/** "ready": the drone can launch. "out": it is in the air. "none": no AFC to launch from (lost, awaiting a replacement). */
export type GuideScoutStatus = "ready" | "out" | "none";

/**
 * Rings searched around home for unexplored ground, and the farthest the target
 * goes: a drone flies at most 15 tiles past the player's own land and reach
 * (SCOUT_DRONE_MAX_RANGE_TILES), so a target further out is never reached and
 * would stay marked.
 */
export const GUIDE_EXPLORE_SEARCH_RADIUS = 16;
/** Flights the guide asks for before its town and food steps fall back to a Relay Beacon, so a target the drone can't reach (a rival border, open sea) can't loop forever. */
export const GUIDE_EXPLORE_MAX_FLIGHTS = 3;
/** How far past the nearest unexplored tile the target sits, so one flight uncovers a useful strip. */
export const GUIDE_EXPLORE_OVERSHOOT = 8;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export const guideScoutStatus = (flight: ScoutDroneFlight | undefined, hasAfc: boolean, nowMs: number): GuideScoutStatus => {
  if (flight && flight.landsAt > nowMs) return "out";
  return hasAfc ? "ready" : "none";
};

/** Nearest unexplored tile to home, ring by ring (ties broken by scan order, so it is stable). */
const nearestUnexplored = (isDiscovered: (x: number, y: number) => boolean, home: { x: number; y: number }): { dx: number; dy: number } | undefined => {
  for (let r = 1; r <= GUIDE_EXPLORE_SEARCH_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isDiscovered(wrap(home.x + dx, WORLD_WIDTH), wrap(home.y + dy, WORLD_HEIGHT))) return { dx, dy };
      }
    }
  }
  return undefined;
};

/**
 * The tile to Explore toward, or undefined when everything within
 * GUIDE_EXPLORE_SEARCH_RADIUS of home has been seen. The pushed-out tile is
 * used only while it is itself unexplored; otherwise the nearest one.
 */
export const guideExploreTarget = (discovered: ReadonlySet<string>, home: { x: number; y: number } | undefined): { x: number; y: number } | undefined => {
  if (!home) return undefined;
  const isDiscovered = (x: number, y: number): boolean => discovered.has(tileKey(x, y));
  const nearest = nearestUnexplored(isDiscovered, home);
  if (!nearest) return undefined;
  const distance = Math.max(Math.abs(nearest.dx), Math.abs(nearest.dy));
  const scale = Math.min(distance + GUIDE_EXPLORE_OVERSHOOT, GUIDE_EXPLORE_SEARCH_RADIUS) / distance;
  const far = { x: wrap(home.x + Math.round(nearest.dx * scale), WORLD_WIDTH), y: wrap(home.y + Math.round(nearest.dy * scale), WORLD_HEIGHT) };
  if (!isDiscovered(far.x, far.y)) return far;
  return { x: wrap(home.x + nearest.dx, WORLD_WIDTH), y: wrap(home.y + nearest.dy, WORLD_HEIGHT) };
};
