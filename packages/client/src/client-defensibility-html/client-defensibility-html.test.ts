import { describe, expect, it } from "vitest";

import { renderDefensibilityPanelHtml } from "./client-defensibility-html.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("renderDefensibilityPanelHtml", () => {
  it("explains the weighted 100% defensibility calculation without a conflicting exposure badge", () => {
    const tiles = new Map<string, Tile>();
    const settled: Tile[] = [
      { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
      { x: 11, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
      { x: 10, y: 11, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
      { x: 11, y: 11, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }
    ];
    for (const tile of settled) tiles.set(keyFor(tile.x, tile.y), tile);

    const html = renderDefensibilityPanelHtml({
      tiles,
      me: "me",
      defensibilityPct: 100,
      settledT: 4,
      settledE: 4,
      showWeakDefensibility: false,
      empireIntegrityEnabled: false,
      keyFor,
      wrapX: (x) => x,
      wrapY: (y) => y,
      terrainAt: (x, y) => tiles.get(keyFor(x, y))?.terrain ?? "LAND"
    });

    expect(html).not.toContain("Very Exposed");
    expect(html).toContain("Where does the % come from?");
    expect(html).toContain("Great shape! For 4 garrisoned tiles, you have no more open sides than the most compact empire your size");
    expect(html).toContain('<span>A perfect blob your size would have</span><strong>8</strong>');
    expect(html).toContain('<span>You score 100% if you stay at or below</span><strong>10</strong>');
    expect(html).toContain('<span>You actually have</span><strong class="is-positive">4</strong>');
  });

  it("uses authoritative settled totals for the score explanation and changes copy below 100%", () => {
    const tiles = new Map<string, Tile>();
    const settled: Tile[] = [
      { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
      { x: 11, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
      { x: 10, y: 11, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
      { x: 11, y: 11, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }
    ];
    for (const tile of settled) tiles.set(keyFor(tile.x, tile.y), tile);

    const html = renderDefensibilityPanelHtml({
      tiles,
      me: "me",
      defensibilityPct: 86,
      settledT: 20,
      settledE: 30,
      showWeakDefensibility: false,
      empireIntegrityEnabled: false,
      keyFor,
      wrapX: (x) => x,
      wrapY: (y) => y,
      terrainAt: (x, y) => tiles.get(keyFor(x, y))?.terrain ?? "LAND"
    });

    expect(html).toContain("too many sides facing open ground");
    expect(html).not.toContain("How 100% is calculated");
    expect(html).toContain('<span>A perfect blob your size would have</span><strong>18</strong>');
    expect(html).toContain('<span>You score 100% if you stay at or below</span><strong>22.5</strong>');
    expect(html).toContain('<span>You actually have</span><strong class="is-negative">30</strong>');
    expect(html).toContain('<span>Garrisoned tiles</span><strong>20</strong>');
    expect(html).toContain("Only garrisoned tiles count.");
  });

  // Playtest 2026-11-12 (pt-optimiser): 100% "tight blob" with 1 garrisoned
  // tile and 4 open sides read as a contradiction. 4 is the minimum for one
  // tile, so 100% is right; the copy now says it is relative to size.
  it("explains a one-tile 100% as compact for its size, not a tight blob", () => {
    const tiles = new Map<string, Tile>([[keyFor(10, 10), { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }]]);
    const html = renderDefensibilityPanelHtml({
      tiles, me: "me", defensibilityPct: 100, settledT: 1, settledE: 4, showWeakDefensibility: false, empireIntegrityEnabled: true,
      keyFor, wrapX: (x) => x, wrapY: (y) => y, terrainAt: () => "LAND"
    });
    expect(html).not.toContain("tight blob");
    expect(html).toContain("For 1 garrisoned tile, you have no more open sides than the most compact empire your size");
    expect(html).not.toContain("New empires keep");
  });

  it("says when the new-empire grace floor is holding the score up", () => {
    const tiles = new Map<string, Tile>();
    const html = renderDefensibilityPanelHtml({
      tiles, me: "me", defensibilityPct: 90, settledT: 20, settledE: 80, showWeakDefensibility: false, empireIntegrityEnabled: false,
      keyFor, wrapX: (x) => x, wrapY: (y) => y, terrainAt: () => "LAND"
    });
    expect(html).toContain("New empires keep at least 90% until 50 garrisoned tiles.");
  });
});
