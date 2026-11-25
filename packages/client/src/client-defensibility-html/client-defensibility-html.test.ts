// @vitest-environment happy-dom
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
      settledE: 8,
      showWeakDefensibility: false,
      empireIntegrityEnabled: false,
      keyFor,
      wrapX: (x) => x,
      wrapY: (y) => y,
      terrainAt: (x, y) => tiles.get(keyFor(x, y))?.terrain ?? "LAND"
    });

    expect(html).not.toContain("Very Exposed");
    expect(html).toContain("Where does the % come from?");
    expect(html).toContain("Great shape: no more open sides than the most compact empire your size.");
    expect(html).toContain('<span>A perfect blob your size would have</span><strong>8</strong>');
    expect(html).toContain('<span>You score 100% if you stay at or below</span><strong>10</strong>');
    expect(html).toContain('<span>You actually have</span><strong class="is-positive">8</strong>');
  });

  // Owner rule (Playtest Run 4 follow-up): all owned land counts toward the shape, plus its garrisoned share.
  it("scores all owned land, shows the garrisoned share, and changes copy below 100%", () => {
    const tiles = new Map<string, Tile>();
    const settled: Tile[] = [
      { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
      { x: 11, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
      { x: 10, y: 11, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" },
      { x: 11, y: 11, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" }
    ];
    for (const tile of settled) tiles.set(keyFor(tile.x, tile.y), tile);

    const html = renderDefensibilityPanelHtml({
      tiles,
      me: "me",
      defensibilityPct: 86,
      settledT: 2,
      settledE: 30,
      showWeakDefensibility: false,
      empireIntegrityEnabled: false,
      keyFor,
      wrapX: (x) => x,
      wrapY: (y) => y,
      terrainAt: (x, y) => tiles.get(keyFor(x, y))?.terrain ?? "LAND"
    });

    expect(html).toContain("Too many sides of your land face open ground.");
    expect(html).not.toContain("Too little garrisoned</span><strong class=\"is-negative\"");
    expect(html).toContain('<span>A perfect blob your size would have</span><strong>8</strong>');
    expect(html).toContain('<span>You actually have</span><strong class="is-negative">30</strong>');
    expect(html).toContain('<span>Your land</span><strong>4</strong>');
    expect(html).toContain('<span>Garrisoned</span><strong>2 · 50%</strong>');
    expect(html).toContain("All your land counts, garrisoned or not.");
    expect(html).not.toContain("to avoid the penalty");
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
    expect(html).toContain("Great shape: no more open sides than the most compact empire your size.");
    expect(html).not.toContain("New empires keep");
  });

  // Owner call 2026-11-24: the new-empire floor and its line are gone.
  it("never mentions a new-empire floor, and names the penalty for too little garrisoned", () => {
    const tiles = new Map<string, Tile>();
    for (let x = 0; x < 20; x += 1) tiles.set(keyFor(x, 0), { x, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" });
    const html = renderDefensibilityPanelHtml({
      tiles, me: "me", defensibilityPct: 55, settledT: 0, settledE: 42, showWeakDefensibility: false, empireIntegrityEnabled: false,
      keyFor, wrapX: (x) => x, wrapY: (y) => y, terrainAt: () => "LAND"
    });
    expect(html).not.toContain("New empires keep");
    expect(html).toContain("Only 0% of your land is garrisoned: −30% until you garrison 10%.");
    expect(html).toContain("Garrison at least 10% of your land to avoid the penalty.");
  });

  it("lists each weak tile with its reason and a go-to button while the highlight is on", () => {
    const tiles = new Map<string, Tile>([[keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }]]);
    const args = {
      tiles,
      me: "me",
      defensibilityPct: 50,
      settledT: 1,
      settledE: 4,
      empireIntegrityEnabled: false,
      keyFor,
      wrapX: (x: number) => x,
      wrapY: (y: number) => y,
      terrainAt: () => "LAND" as const
    };
    expect(renderDefensibilityPanelHtml({ ...args, showWeakDefensibility: false })).not.toContain("data-weak-def-focus");
    const html = renderDefensibilityPanelHtml({ ...args, showWeakDefensibility: true });
    expect(html).toContain('data-weak-def-focus="5,5"');
    expect(html).toContain("4 open sides: north, east, south and west (unexplored land)");
  });

  // Playtest 2026-11-18: the hero card read "half blank": a body-size score with an empty right half.
  it("leads with the score and fills the hero with its income effect", () => {
    const tiles = new Map<string, Tile>([["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }]]);
    const args = { tiles, me: "me", defensibilityPct: 100, settledT: 1, settledE: 4, showWeakDefensibility: false, keyFor, wrapX: (x: number) => x, wrapY: (y: number) => y, terrainAt: () => "LAND" as const };
    const host = document.createElement("div");
    host.innerHTML = renderDefensibilityPanelHtml({ ...args, empireIntegrityEnabled: true });
    const head = host.querySelector(".defense-hero-head")!;
    expect(head.querySelector(".defense-score")?.textContent).toBe("100%");
    expect(head.querySelector(".defense-rating")?.textContent).toMatch(/^\+\d+% income$/);
    host.innerHTML = renderDefensibilityPanelHtml({ ...args, empireIntegrityEnabled: false });
    expect(host.querySelector(".defense-hero-head .defense-rating")).toBeNull();
  });
});
