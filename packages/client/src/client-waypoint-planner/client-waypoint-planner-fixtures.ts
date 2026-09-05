// Shared fixtures for the planWaypoint suites, split out of
// client-waypoint-planner.test.ts so the dock-routing cases can live in their
// own file without duplicating the world/deps builders.
import { FRONTIER_CLAIM_MS } from "@border-empires/shared";

import type { WaypointPlannerDeps } from "./client-waypoint-planner.js";
import type { ActiveTruceView, DockPair, Tile } from "../client-types.js";

export const keyFor = (x: number, y: number): string => `${x},${y}`;

export const tile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

// Uses the real client domain types (not the narrower, portable
// WaypointPlannerDeps["state"] shape) since these tests exercise
// full ActiveTruceView/DockPair/Tile fixtures -- still structurally
// assignable wherever WaypointPlannerDeps["state"] is expected.
export type StateShape = {
  me: string | undefined;
  tiles: Map<string, Tile>;
  dockPairs: DockPair[];
  allies: string[];
  activeTruces: ActiveTruceView[];
};

export const stateWith = (tiles: Tile[], me = "me", overrides: Partial<StateShape> = {}): StateShape => ({
  me,
  tiles: new Map(tiles.map((t) => [keyFor(t.x, t.y), t])),
  dockPairs: [],
  allies: [],
  activeTruces: [],
  ...overrides
});

export const baseDeps = (state: StateShape): WaypointPlannerDeps => ({
  state,
  keyFor,
  // Flat durations so cost arithmetic is predictable in tests.
  expandDurationMsAt: () => 1000,
  attackDurationMs: 3000,
  now: 1_000_000
});

// Tiebreak tests assert on path *shape* (turns/overshoot), which only holds
// when the A* heuristic is admissible — i.e. the per-step expand cost is not
// below the heuristic's FRONTIER_CLAIM_MS lower bound (true in production).
export const tiebreakDeps = (state: StateShape): WaypointPlannerDeps => ({
  state,
  keyFor,
  expandDurationMsAt: () => FRONTIER_CLAIM_MS,
  attackDurationMs: 3000,
  now: 1_000_000
});
