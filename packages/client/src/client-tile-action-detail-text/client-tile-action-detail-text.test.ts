import { describe, expect, it } from "vitest";
import { buildDetailTextForAction } from "./client-tile-action-detail-text.js";
import type { Tile } from "../client-types.js";

const baseTile = { x: 0, y: 0 } as Tile;

describe("buildDetailTextForAction", () => {
  it("build_observatory mentions the per-Observatory progressive CRYSTAL slot cost", () => {
    const text = buildDetailTextForAction("build_observatory", baseTile);
    expect(text).toContain("CRYSTAL slots");
    expect(text).toContain("1 for your first Observatory, 2 for your second");
  });
});
