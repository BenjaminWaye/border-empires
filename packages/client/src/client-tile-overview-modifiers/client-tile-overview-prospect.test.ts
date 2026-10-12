import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { tileFeatureLeadLines } from "./client-tile-overview-modifiers.js";

const deps = { me: "me", prettyToken: (v: string) => v, structureInfoButtonHtml: (type: string) => type, techCatalog: [] };
const tile = (overrides: Partial<Tile> = {}): Tile => ({ x: 1, y: 1, terrain: "LAND", ...overrides }) as Tile;

// Players had no way to tell what a clue tile meant: the tile menu never
// mentioned it, so the faint map tint was the only hint.
describe("tileFeatureLeadLines prospect clue", () => {
  it("explains a clue tile in plain words", () => {
    const html = tileFeatureLeadLines(tile({ prospectSignature: "FERROUS_DUST" }), "unclaimed", deps).map((line) => line.html);
    expect(html).toContain("Ferrous dust: Titanium deposits are likely within a few tiles.");
  });

  it("adds nothing for a tile without a clue", () => {
    expect(tileFeatureLeadLines(tile(), "unclaimed", deps)).toEqual([]);
  });
});
