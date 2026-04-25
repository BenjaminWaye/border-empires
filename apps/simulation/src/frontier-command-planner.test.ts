import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";

import { buildDockLinksByDockTileKey } from "./dock-network.js";
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

  it("chooses diagonal frontier attacks that runtime validation already allows", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 24, y: 245, terrain: "LAND", ownerId: "ai-1" },
        { x: 23, y: 246, terrain: "LAND", ownerId: "enemy-1", dockId: "dock-1" }
      ],
      "ai-1",
      10,
      3_000,
      "ai-runtime"
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "ATTACK",
      clientSeq: 10,
      payloadJson: JSON.stringify({ fromX: 24, fromY: 245, toX: 23, toY: 246 })
    });
  });

  it("wraps frontier expansion across world edges", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 0, y: 0, terrain: "LAND", ownerId: "ai-1" },
        { x: WORLD_WIDTH - 1, y: 0, terrain: "LAND", resource: "FARM" }
      ],
      "ai-1",
      11,
      4_000,
      "ai-runtime"
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 11,
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: WORLD_WIDTH - 1, toY: 0 })
    });
  });

  it("targets linked dock destinations when island starts have no local land frontier", () => {
    const dockLinksByDockTileKey = buildDockLinksByDockTileKey([
      { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
      { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
    ]);
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", dockId: "dock-a" },
        { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" },
        { x: 51, y: 50, terrain: "LAND", resource: "FARM" }
      ],
      "ai-1",
      12,
      5_000,
      "ai-runtime",
      { dockLinksByDockTileKey }
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 12,
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
    });
  });
});
