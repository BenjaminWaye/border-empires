import { describe, expect, it } from "vitest";

import { chooseNextOwnedFrontierCommandFromTiles } from "./frontier-command-planner.js";

describe("frontier command planner", () => {
  it("skips barrier tiles when choosing the next expand target", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1" },
        { x: 9, y: 10, terrain: "SEA" },
        { x: 11, y: 10, terrain: "MOUNTAIN" },
        { x: 10, y: 9, terrain: "LAND" },
        { x: 10, y: 11, terrain: "LAND", ownerId: "ai-1" }
      ],
      "ai-1",
      7,
      1_000,
      "ai-runtime"
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 7,
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 9 })
    });
  });

  it("does not choose an attack when the caller cannot afford attack manpower, but can still expand", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1" },
        { x: 9, y: 10, terrain: "LAND", ownerId: "enemy-1" },
        { x: 11, y: 10, terrain: "LAND" }
      ],
      "ai-1",
      8,
      2_000,
      "ai-runtime",
      { canAttack: false, canExpand: true }
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 8,
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
  });

  it("prefers strategic expand targets over plain coastline tiles", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1" },
        { x: 10, y: 9, terrain: "LAND" },
        { x: 9, y: 10, terrain: "SEA" },
        { x: 11, y: 10, terrain: "LAND", resource: "FARM" },
        { x: 12, y: 10, terrain: "LAND" },
        { x: 11, y: 9, terrain: "LAND" },
        { x: 11, y: 11, terrain: "LAND" }
      ],
      "ai-1",
      9,
      2_500,
      "ai-runtime"
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 9,
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
  });
});
