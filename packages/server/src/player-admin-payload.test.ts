import { describe, expect, it } from "vitest";
import { buildAdminPlayerListPayload, type AdminPlayerListEntry } from "./player-admin-payload.js";

describe("buildAdminPlayerListPayload", () => {
  it("sorts players and preserves raw and effective colors", () => {
    const entries: AdminPlayerListEntry[] = [
      {
        id: "b",
        name: "Zulu",
        isAi: true,
        effectiveTileColor: "#38b000",
        visualStyle: {
          primaryOverlay: "#38b000",
          secondaryTint: "BALANCED",
          borderStyle: "SOFT",
          structureAccent: "NEUTRAL"
        },
        shieldUntil: 0,
        territoryTiles: 4,
        settledTiles: 2,
        frontierTiles: 2
      },
      {
        id: "a",
        name: "Alpha",
        isAi: false,
        rawTileColor: "#ef4444",
        effectiveTileColor: "#ef4444",
        visualStyle: {
          primaryOverlay: "#ef4444",
          secondaryTint: "IRON",
          borderStyle: "HEAVY",
          structureAccent: "IRON"
        },
        shieldUntil: 123,
        territoryTiles: 9,
        settledTiles: 5,
        frontierTiles: 4
      }
    ];
    const payload = buildAdminPlayerListPayload(entries, 1000);

    expect(payload).toEqual({
      ok: true,
      at: 1000,
      players: [
        {
          id: "a",
          name: "Alpha",
          isAi: false,
          rawTileColor: "#ef4444",
          effectiveTileColor: "#ef4444",
          visualStyle: {
            primaryOverlay: "#ef4444",
            secondaryTint: "IRON",
            borderStyle: "HEAVY",
            structureAccent: "IRON"
          },
          shieldUntil: 123,
          territoryTiles: 9,
          settledTiles: 5,
          frontierTiles: 4
        },
        {
          id: "b",
          name: "Zulu",
          isAi: true,
          effectiveTileColor: "#38b000",
          visualStyle: {
            primaryOverlay: "#38b000",
            secondaryTint: "BALANCED",
            borderStyle: "SOFT",
            structureAccent: "NEUTRAL"
          },
          shieldUntil: 0,
          territoryTiles: 4,
          settledTiles: 2,
          frontierTiles: 2
        }
      ]
    });
  });
});
