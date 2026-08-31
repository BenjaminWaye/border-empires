import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { previewSettledCapturePlunder } from "./runtime-combat-support.js";

function makePlayer(id: string, points: number): DomainPlayer {
  return { id, isAi: false, points, manpower: 0, techIds: new Set(), allies: new Set() };
}

function makeFoodTile(): DomainTileState {
  return { x: 9, y: 270, terrain: "FOREST", resource: "FOOD", ownershipState: "SETTLED" };
}

describe("previewSettledCapturePlunder", () => {
  it("does not fabricate strategic-resource plunder when capturing a FARM/FISH tile", () => {
    const plunder = previewSettledCapturePlunder({
      defender: makePlayer("player-defender", 100),
      defenderTileCountBeforeCapture: 5,
      target: makeFoodTile()
    });

    expect(plunder.strategic).toEqual({});
  });

  it("still computes gold plunder as a share of the defender's points", () => {
    const plunder = previewSettledCapturePlunder({
      defender: makePlayer("player-defender", 100),
      defenderTileCountBeforeCapture: 5,
      target: makeFoodTile()
    });

    expect(plunder.gold).toBe(20);
    expect(plunder.strategic).toEqual({});
  });

  it("barbarian captures use the fixed gold cap and never populate strategic", () => {
    const plunder = previewSettledCapturePlunder({
      defender: makePlayer("barbarian-1", 9999),
      defenderTileCountBeforeCapture: 1,
      target: makeFoodTile()
    });

    expect(plunder.gold).toBe(10);
    expect(plunder.strategic).toEqual({});
  });
});
