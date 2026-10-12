import { describe, expect, it } from "vitest";

import type { Terrain } from "@border-empires/shared";

import { planDockLinks, type DockLinkSite } from "./server-worldgen-dock-links.js";

const hasEdge = (edges: Array<[number, number]>, a: number, b: number): boolean =>
  edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const terrainFrom = (worldWidth: number, worldHeight: number, isLand: (x: number, y: number) => boolean) => ({
  worldWidth,
  worldHeight,
  terrainAt: (x: number, y: number): Terrain => (isLand(x, y) ? "LAND" : "SEA")
});

describe("planDockLinks", () => {
  it("links each dock of a large landmass to the island on its own coast, not round-robin across it", () => {
    // Regression: large landmasses used to hand component edges to their
    // docks round-robin, so a west-coast dock could be linked to an island
    // off the east coast -- a long sail with lots of scrolling.
    const sites: DockLinkSite[] = [
      { componentId: 0, seaX: 5, seaY: 5 }, // continent, west dock
      { componentId: 0, seaX: 20, seaY: 5 }, // continent, east dock
      { componentId: 1, seaX: 2, seaY: 5 }, // west island
      { componentId: 2, seaX: 23, seaY: 5 } // east island
    ];
    const edges = planDockLinks(sites, terrainFrom(40, 12, () => false));
    expect(hasEdge(edges, 0, 2)).toBe(true);
    expect(hasEdge(edges, 1, 3)).toBe(true);
    expect(hasEdge(edges, 0, 3)).toBe(false);
    expect(hasEdge(edges, 1, 2)).toBe(false);
  });

  it("measures nearness by sea path, not straight through a landmass", () => {
    // A land wall at x=10 with a single gap at y=10. Dock 1 sits 4 tiles from
    // dock 0 as the crow flies but 24 by sea; dock 2 is 6 by sea.
    const isLand = (x: number, y: number): boolean => x === 10 && y !== 10;
    const sites: DockLinkSite[] = [
      { componentId: 0, seaX: 8, seaY: 0 },
      { componentId: 1, seaX: 12, seaY: 0 },
      { componentId: 2, seaX: 8, seaY: 6 }
    ];
    const edges = planDockLinks(sites, terrainFrom(30, 21, isLand));
    expect(hasEdge(edges, 0, 2)).toBe(true);
    expect(hasEdge(edges, 0, 1)).toBe(false);
    // Still one connected network.
    expect(hasEdge(edges, 1, 2)).toBe(true);
  });

  it("never links two docks on the same landmass", () => {
    const sites: DockLinkSite[] = [
      { componentId: 0, seaX: 1, seaY: 1 },
      { componentId: 0, seaX: 2, seaY: 1 },
      { componentId: 1, seaX: 15, seaY: 1 }
    ];
    const edges = planDockLinks(sites, terrainFrom(30, 10, () => false));
    expect(hasEdge(edges, 0, 1)).toBe(false);
  });

  it("still links docks whose seas never meet, so no landmass is stranded", () => {
    // A full land wall at x=10 splits the sea into two bodies.
    const isLand = (x: number): boolean => x === 10 || x === 0;
    const sites: DockLinkSite[] = [
      { componentId: 0, seaX: 5, seaY: 3 },
      { componentId: 1, seaX: 15, seaY: 3 }
    ];
    const edges = planDockLinks(sites, terrainFrom(20, 8, (x) => isLand(x)));
    expect(hasEdge(edges, 0, 1)).toBe(true);
  });

  it("is deterministic", () => {
    const sites: DockLinkSite[] = Array.from({ length: 12 }, (_, i) => ({ componentId: i % 5, seaX: (i * 7) % 40, seaY: (i * 3) % 20 }));
    const terrain = terrainFrom(40, 20, () => false);
    expect(planDockLinks(sites, terrain)).toEqual(planDockLinks(sites, terrain));
  });
});
