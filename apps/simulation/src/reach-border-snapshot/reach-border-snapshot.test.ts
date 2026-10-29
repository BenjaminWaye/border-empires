import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { applyReachBorderChanges, decodeReachBorder, diffReachBorder, encodeReachBorder } from "./reach-border-snapshot.js";

describe("reach border snapshot codec", () => {
  it("round-trips a border, including wrapped edges and multiple owners", () => {
    const border = new Map([
      ["0,0", "elin"],
      [`${WORLD_WIDTH - 1},0`, "elin"],
      ["10,7", "me"],
      ["11,7", "me"],
      ["12,7", "me"],
      [`10,${WORLD_HEIGHT - 1}`, "me"]
    ]);

    expect(decodeReachBorder(encodeReachBorder(border))).toEqual(border);
  });

  it("delta-encodes contiguous runs as 1s so a row of border costs ~2 bytes a tile", () => {
    const border = new Map<string, string>();
    for (let x = 100; x < 110; x += 1) border.set(`${x},20`, "me");

    const [entry] = encodeReachBorder(border);

    expect(entry?.tiles.slice(1)).toEqual(new Array(9).fill(1));
  });

  it("skips malformed and off-world keys instead of writing garbage indices", () => {
    expect(encodeReachBorder(new Map([["not-a-key", "me"], ["-1,3", "me"], [`${WORLD_WIDTH},0`, "me"]]))).toEqual([]);
  });

  it("diffs only the given keys and reports vacated tiles as null", () => {
    const oldBorder = new Map([["1,1", "me"], ["2,1", "me"], ["9,9", "me"]]);
    const newBorder = new Map([["1,1", "elin"], ["9,9", "elin"]]);

    expect(diffReachBorder(oldBorder, newBorder, ["1,1", "2,1", "3,1"])).toEqual([
      { tileKey: "1,1", ownerId: "elin" },
      { tileKey: "2,1", ownerId: null }
    ]);
  });

  it("applies a diff back onto a border", () => {
    const border = new Map([["1,1", "me"], ["2,1", "me"]]);
    applyReachBorderChanges(border, [{ tileKey: "1,1", ownerId: "elin" }, { tileKey: "2,1", ownerId: null }]);

    expect(border).toEqual(new Map([["1,1", "elin"]]));
  });
});
