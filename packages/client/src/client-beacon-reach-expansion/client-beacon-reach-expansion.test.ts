import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import {
  BEACON_EXPANSION_GROW_MS,
  BEACON_EXPANSION_HOLD_MS,
  beaconExpansionElapsedMs,
  beaconExpansionOutline,
  beaconExpansionTileFill,
  beaconNewReachLabel,
  beaconReachExpansion,
  resetBeaconExpansionClockForTests
} from "./client-beacon-reach-expansion.js";

const wrapX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

const stateWithTown = () => {
  const state = createInitialState();
  state.me = "me";
  const town: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", townType: "FARMING", townPopulationTier: "TOWN" };
  state.tiles.set(tileKey(10, 10), town);
  return state;
};

// Owner, First-15 round 1: show the reach a beacon adds growing out from where it would go, instead of a flat square.
describe("beacon placement: reach growing from the beacon", () => {
  it("lists only ground the beacon would newly bring into reach, each with its ring from the beacon", () => {
    const state = stateWithTown();
    const far = beaconReachExpansion(state, 40, 40);
    expect(far.tiles).toHaveLength(11 * 11);
    const near = beaconReachExpansion(state, 13, 10);
    expect(near.tiles.length).toBeLessThan(11 * 11);
    expect(near.keys.has(tileKey(10, 10))).toBe(false); // already in the town's reach
    expect(near.tiles.find((tile) => tile.key === tileKey(18, 10))?.ring).toBe(5);
  });

  it("fills ring by ring from the beacon out, holds, then plays again", () => {
    expect(beaconExpansionTileFill(0, 0)).toBe(0);
    expect(beaconExpansionTileFill(1, BEACON_EXPANSION_GROW_MS / 2)).toBeGreaterThan(0);
    expect(beaconExpansionTileFill(5, BEACON_EXPANSION_GROW_MS / 2)).toBe(0); // the edge waits for the wave
    expect(beaconExpansionTileFill(5, BEACON_EXPANSION_GROW_MS)).toBe(1);
    expect(beaconExpansionTileFill(5, BEACON_EXPANSION_GROW_MS + BEACON_EXPANSION_HOLD_MS - 1)).toBe(1);
    expect(beaconExpansionTileFill(5, BEACON_EXPANSION_GROW_MS + BEACON_EXPANSION_HOLD_MS)).toBe(0); // the next cycle starts
  });

  it("shows it all at once when the viewer asks for less motion", () => {
    expect(beaconExpansionTileFill(5, 0, true)).toBe(1);
  });

  it("restarts the growth when the beacon moves to another tile", () => {
    resetBeaconExpansionClockForTests();
    expect(beaconExpansionElapsedMs(5, 5, 1_000)).toBe(0);
    expect(beaconExpansionElapsedMs(5, 5, 1_400)).toBe(400);
    expect(beaconExpansionElapsedMs(6, 5, 1_500)).toBe(0);
  });

  it("outlines the outer edge of the new reach only", () => {
    const expansion = beaconReachExpansion(stateWithTown(), 40, 40);
    // An 11 x 11 square has 44 outer edges and none inside.
    expect(beaconExpansionOutline(expansion, tileKey, wrapX, wrapY)).toHaveLength(44);
  });

  it("says how many tiles the beacon brings into reach", () => {
    expect(beaconNewReachLabel(23)).toBe("+23 tiles into reach");
    expect(beaconNewReachLabel(1)).toBe("+1 tile into reach");
    expect(beaconNewReachLabel(0)).toBe("no new reach");
  });
});
