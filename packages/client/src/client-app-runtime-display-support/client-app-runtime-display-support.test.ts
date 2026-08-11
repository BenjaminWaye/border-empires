import { beforeEach, describe, expect, it } from "vitest";

import { RELAY_BEACON_FREE_FOOD_SLOT_COUNT, WORLD_HEIGHT, WORLD_WIDTH, landBiomeAt, setWorldSeed, terrainAt } from "@border-empires/shared";

import type { Tile } from "../client-types.js";

import { createClientRuntimeDisplaySupport } from "./client-app-runtime-display-support.js";
import { createInitialState } from "../client-state/client-state.js";

const formatCooldownShort = (remainingMs: number): string => `${remainingMs}ms`;
const prettyToken = (value: string): string => value;

const createSubject = (tiles?: Tile[]) => {
  const state = createInitialState();
  state.me = "me";
  for (const tile of tiles ?? []) state.tiles.set(`${tile.x},${tile.y}`, tile);
  return createClientRuntimeDisplaySupport({
    state,
    formatCooldownShort,
    prettyToken
  });
};

const relayBeaconTile = (x: number, y: number): Tile =>
  createTile({ x, y, ownerId: "me", economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" } });


const createTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  ...overrides
});

const findNonLandTile = (): { x: number; y: number } => {
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAt(x, y) !== "LAND") return { x, y };
    }
  }
  throw new Error("expected at least one non-land tile in world");
};

const findSandLandTile = (): { x: number; y: number } => {
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAt(x, y) === "LAND" && landBiomeAt(x, y) === "SAND") return { x, y };
    }
  }
  throw new Error("expected at least one sand land tile in world");
};

describe("client runtime display support", () => {
  beforeEach(() => {
    setWorldSeed(42);
  });

  it("does not mislabel land as sand when biome lookup is unavailable", () => {
    const { terrainLabel } = createSubject();
    const sample = findNonLandTile();

    expect(terrainLabel(sample.x, sample.y, "LAND")).toBe("GRASS");
  });

  it("still labels real sand biome land as sand", () => {
    const { terrainLabel } = createSubject();
    const sample = findSandLandTile();

    expect(terrainLabel(sample.x, sample.y, "LAND")).toBe("SAND");
  });

  it("prefers the server-provided runtime biome for visible land tiles", () => {
    const { terrainLabel } = createSubject([createTile({ x: 9, y: 9, landBiome: "SAND", regionType: "CRYSTAL_WASTES" })]);

    expect(terrainLabel(9, 9, "LAND")).toBe("SAND");
  });

  it("does not upgrade inferred deep-forest region tiles into forest labels", () => {
    const { terrainLabel } = createSubject([createTile({ x: 11, y: 11, landBiome: "GRASS", regionType: "DEEP_FOREST" })]);

    expect(terrainLabel(11, 11, "LAND")).toBe("GRASS");
  });

  describe("structureCostText for RELAY_BEACON", () => {
    it("omits the FOOD slot line entirely while the player owns fewer than RELAY_BEACON_FREE_FOOD_SLOT_COUNT outposts", () => {
      const tiles = Array.from({ length: RELAY_BEACON_FREE_FOOD_SLOT_COUNT - 1 }, (_, i) => relayBeaconTile(i, 0));
      const { structureCostText } = createSubject(tiles);

      expect(structureCostText("RELAY_BEACON")).not.toContain("FOOD slot");
    });

    it("shows the FOOD slot line once the player already owns RELAY_BEACON_FREE_FOOD_SLOT_COUNT outposts", () => {
      const tiles = Array.from({ length: RELAY_BEACON_FREE_FOOD_SLOT_COUNT }, (_, i) => relayBeaconTile(i, 0));
      const { structureCostText } = createSubject(tiles);

      expect(structureCostText("RELAY_BEACON")).toContain("1 FOOD slot");
    });

    it("omits the FOOD slot line with zero owned outposts (the common case a fresh player sees)", () => {
      const { structureCostText } = createSubject();

      expect(structureCostText("RELAY_BEACON")).not.toContain("FOOD slot");
    });
  });
});
