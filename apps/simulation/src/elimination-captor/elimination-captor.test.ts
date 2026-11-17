import { describe, expect, it } from "vitest";

import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import { topCaptorOf } from "./elimination-captor.js";

const flip = (tileId: string, fromOwner: string | undefined, toOwner: string | undefined, at: number): TerritoryFlip => ({ tileId, x: 0, y: 0, fromOwner, toOwner, at });

describe("topCaptorOf", () => {
  it("names whoever took the most distinct tiles from the victim", () => {
    const flips = [flip("a", "p1", "ai-1", 1), flip("b", "p1", "ai-2", 2), flip("c", "p1", "ai-2", 3), flip("d", "p1", "ai-1", 4), flip("e", "p1", "ai-2", 5)];
    expect(topCaptorOf("p1", flips)).toBe("ai-2");
  });

  it("counts a tile once, for its latest loss", () => {
    const flips = [flip("a", "p1", "ai-1", 1), flip("a", "ai-1", "p1", 2), flip("a", "p1", "ai-2", 3), flip("b", "p1", "ai-1", 4)];
    // a went to ai-2 last, b to ai-1: a tie broken by the most recent capture (b at 4).
    expect(topCaptorOf("p1", flips)).toBe("ai-1");
  });

  it("ignores other players' flips, gains, and land that just went neutral", () => {
    const flips = [flip("a", "p2", "ai-1", 1), flip("b", undefined, "p1", 2), flip("c", "p1", undefined, 3)];
    expect(topCaptorOf("p1", flips)).toBeUndefined();
  });
});
