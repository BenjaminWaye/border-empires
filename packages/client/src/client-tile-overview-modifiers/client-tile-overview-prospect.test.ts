import { describe, expect, it } from "vitest";
import { setWorldSeed } from "@border-empires/shared";
import type { TechInfo, Tile } from "../client-types.js";
import { isForestTile, isLightGrassScatterTile } from "../client-constants.js";
import { tileFeatureLeadLines } from "./client-tile-overview-modifiers.js";

const deps = { me: "me", prettyToken: (v: string) => v, structureInfoButtonHtml: (type: string) => type, techCatalog: [] };
const tile = (overrides: Partial<Tile> = {}): Tile => ({ x: 1, y: 1, terrain: "LAND", ...overrides }) as Tile;
const BLACKWOOD_LINE = "Blackwood canopy: Umbrite deposits are likely within a few tiles.";

const findTile = (match: (x: number, y: number) => boolean): { x: number; y: number } => {
  setWorldSeed(2024);
  for (let x = 0; x < 200; x += 1) for (let y = 20; y < 220; y += 1) if (match(x, y)) return { x, y };
  throw new Error("no matching tile in sample");
};

// Players had no way to tell what a clue tile meant: the tile menu never
// mentioned it. Now the map shows clues only as props/darkened trees (no
// tint), so the line must also only appear on tiles that visibly show one.
describe("tileFeatureLeadLines prospect clue", () => {
  it("explains a clue tile in plain words", () => {
    const html = tileFeatureLeadLines(tile({ prospectSignature: "FERROUS_DUST" }), "unclaimed", deps).map((line) => line.html);
    expect(html).toContain("Ferrous dust: Titanium deposits are likely within a few tiles.");
  });

  it("adds nothing for a tile without a clue", () => {
    expect(tileFeatureLeadLines(tile(), "unclaimed", deps)).toEqual([]);
  });

  it("stays quiet on a clue tile that shows nothing on the map", () => {
    const open = findTile((x, y) => !isForestTile(x, y) && !isLightGrassScatterTile(x, y));
    const html = tileFeatureLeadLines(tile({ ...open, prospectSignature: "BLACKWOOD_CANOPY", resource: "FARM" }), "unclaimed", deps).map((line) => line.html);
    expect(html).not.toContain(BLACKWOOD_LINE);
  });

  it("explains blackwood only on its forest, where the swirl rises", () => {
    const forest = findTile((x, y) => isForestTile(x, y));
    const open = findTile((x, y) => !isForestTile(x, y));
    const lines = (at: { x: number; y: number }): string[] => tileFeatureLeadLines(tile({ ...at, prospectSignature: "BLACKWOOD_CANOPY" }), "unclaimed", deps).map((line) => line.html);
    expect(lines(forest)).toContain(BLACKWOOD_LINE);
    expect(lines(open)).not.toContain(BLACKWOOD_LINE);
  });

  it("drops the line once the clue's resource is revealed", () => {
    const forest = findTile((x, y) => isForestTile(x, y));
    const catalog = [{ id: "umbrite-survey", effects: { revealResource: "umbrite" } }] as unknown as TechInfo[];
    const html = tileFeatureLeadLines(tile({ ...forest, prospectSignature: "BLACKWOOD_CANOPY" }), "unclaimed", { ...deps, techCatalog: catalog, techIds: ["umbrite-survey"] }).map((line) => line.html);
    expect(html).not.toContain(BLACKWOOD_LINE);
  });
});
