import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { SCOUT_DRONE_VISION_RADIUS, SCOUT_FINDING_SITES_MAX_TILES } from "@border-empires/shared";

import { createScoutFindings } from "./scout-drone-findings.js";

const viewer = { id: "me", allies: new Set(["friend"]), techIds: new Set<string>() } as unknown as DomainPlayer;
const land = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ...extra }) as DomainTileState;
const findingsOver = (list: DomainTileState[], width = 100, height = 60) =>
  createScoutFindings(() => new Map(list.map((t) => [`${t.x},${t.y}`, t])), width, height);

describe("scout drone findings sites", () => {
  it("records where each counted find is, grouped like the counts", () => {
    const findings = findingsOver([
      land(10, 10, { town: { type: "MARKET", populationTier: "TOWN" } as DomainTileState["town"] }),
      land(11, 10, { waystation: {} as DomainTileState["waystation"] }),
      land(9, 11, { resource: "FARM" }),
      land(9, 12, { resource: "FARM" }),
      land(12, 9, { ownerId: "barbarian-1" }),
      land(12, 12, { ownerId: "rival" }),
      land(8, 8, { ownerId: "friend", town: { type: "MARKET", populationTier: "TOWN" } as DomainTileState["town"] })
    ]);
    findings.observe(10, 10, viewer);
    const report = findings.counts();
    expect(report.towns).toBe(1);
    expect(report.sites).toEqual({
      towns: [{ x: 10, y: 10 }],
      docks: [],
      waystations: [{ x: 11, y: 10 }],
      watchtowers: [],
      planetaryDefense: [{ x: 12, y: 9 }],
      resources: { FARM: [{ x: 9, y: 11 }, { x: 9, y: 12 }] },
      empires: { rival: [{ x: 12, y: 12 }] }
    });
  });

  it("stores wrapped coordinates and caps each group while the count stays exact", () => {
    const farms = Array.from({ length: 7 }, (_, dy) => Array.from({ length: 7 }, (_, dx) => land((dx + 97) % 100, dy, { resource: "FARM" }))).flat();
    const findings = findingsOver(farms);
    findings.observe(0, 3, viewer);
    const report = findings.counts();
    expect(report.resourceTiles).toBe(49);
    expect(report.sites?.resources.FARM).toHaveLength(SCOUT_FINDING_SITES_MAX_TILES);
    expect(report.sites?.resources.FARM?.[0]).toEqual({ x: 97, y: 0 });
  });
});

describe("createScoutFindings tiles seen", () => {
  // Review 2026-11-21: the report card's "+N Tiles" was a client count of newly discovered tiles, which
  // mixed in other reveals and reset on reload. The server now counts what the drone itself saw.
  it("reports every tile the drone saw, each once, out and home", () => {
    const findings = createScoutFindings(() => new Map<string, DomainTileState>(), 100, 100);
    const viewer = { id: "me", allies: new Set<string>() } as unknown as DomainPlayer;
    findings.observe(10, 10, viewer);
    findings.observe(11, 10, viewer);
    findings.observe(10, 10, viewer);
    const side = 2 * SCOUT_DRONE_VISION_RADIUS + 1;
    expect(findings.counts().tilesSeen).toBe(side * side + side);
  });
});
