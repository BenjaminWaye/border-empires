import { describe, expect, it } from "vitest";
import { tileHistoryLines } from "./client-tile-history.js";
import type { Tile } from "../client-types.js";

describe("tileHistoryLines", () => {
  it("shows the capture metadata in order for the overview footer", () => {
    const tile = {
      x: 10,
      y: 12,
      terrain: "LAND",
      history: {
        previousOwners: ["red"],
        captureCount: 2,
        lastOwnerId: "red",
        structureHistory: []
      }
    } satisfies Tile;

    const lines = tileHistoryLines(tile, {
      me: "blue",
      playerNameForOwner: (ownerId?: string | null) => (ownerId === "red" ? "Red Empire" : undefined)
    });

    expect(lines).toEqual(["Captured 2 times", "Last held by Red Empire"]);
  });

  it("names a former structure by its player-facing name", () => {
    const formerSiteLine = (lastStructureType: NonNullable<NonNullable<Tile["history"]>["lastStructureType"]>): string | undefined =>
      tileHistoryLines(
        { x: 1, y: 1, terrain: "LAND", history: { previousOwners: [], captureCount: 0, structureHistory: [], lastStructureType } } satisfies Tile,
        { me: "blue", playerNameForOwner: () => undefined }
      ).find((line) => line.startsWith("Former"));

    expect(formerSiteLine("CARAVANARY")).toBe("Former Trade Nexus site");
    expect(formerSiteLine("GRANARY")).toBe("Former Incubation Engine site");
    expect(formerSiteLine("OBSERVATORY")).toBe("Former Aether Tower site");
  });
});
