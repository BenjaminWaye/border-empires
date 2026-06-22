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
    expect(html).toContain("Your kingdom is squished into a tight blob");
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
    expect(html).toContain('<span>Tiles you own</span><strong>4</strong>');
  });
});
