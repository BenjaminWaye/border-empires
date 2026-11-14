import { describe, expect, it, vi } from "vitest";

import type { BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import type { Tile } from "../client-types.js";
import { abandonTerritoryConsequences, dispatchSimpleTileCommand } from "./client-abandon-territory-confirm.js";

const town = { x: 3, y: 4, town: { name: "Arccrown Battery" } as NonNullable<Tile["town"]> };

// Playtest 2026-11-13 (pt-achiever): a town left the empire with no record, most likely a mis-tap on
// Abandon Territory in the town screen's text buttons, which sent UNCAPTURE_TILE on the spot.
describe("Abandon Territory", () => {
  it("asks before giving the tile up, and sends only on confirm", () => {
    const send = vi.fn((_payload: { type: string }) => true);
    let sheet: BreakPactSheetOptions | undefined;
    dispatchSimpleTileCommand("abandon_territory", town, send, (options) => { sheet = options; return true; });
    expect(send).not.toHaveBeenCalled();
    expect(sheet?.title).toBe("Abandon Arccrown Battery?");
    sheet?.onConfirm();
    expect(send).toHaveBeenCalledWith({ type: "UNCAPTURE_TILE", x: 3, y: 4 });
  });

  it("sends nothing when the confirm can't be shown", () => {
    const send = vi.fn((_payload: { type: string }) => true);
    dispatchSimpleTileCommand("abandon_territory", town, send, () => false);
    expect(send).not.toHaveBeenCalled();
  });

  it("says a town is lost with it", () => {
    expect(abandonTerritoryConsequences(town)[0]).toContain("Arccrown Battery");
    expect(abandonTerritoryConsequences({}).join(" ")).not.toContain("town");
  });

  it("still sends the mountain commands straight away", () => {
    const send = vi.fn((_payload: { type: string }) => true);
    dispatchSimpleTileCommand("create_mountain", town, send);
    dispatchSimpleTileCommand("remove_mountain", town, send);
    expect(send.mock.calls.map(([payload]) => payload.type)).toEqual(["CREATE_MOUNTAIN", "REMOVE_MOUNTAIN"]);
  });
});
