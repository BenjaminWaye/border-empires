import { describe, expect, it } from "vitest";
import { SCOUT_DRONE_VISION_RADIUS } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { createScoutFindings } from "./scout-drone-findings.js";

describe("createScoutFindings", () => {
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

  it("returns what each step newly found, never the same thing twice", () => {
    const tiles = new Map<string, DomainTileState>([
      ["12,10", { x: 12, y: 10, terrain: "LAND", dockId: "d1" } as DomainTileState],
      ["13,10", { x: 13, y: 10, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED" } as DomainTileState],
      ["14,10", { x: 14, y: 10, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED" } as DomainTileState]
    ]);
    const findings = createScoutFindings(() => tiles, 100, 100);
    const viewer = { id: "me", allies: new Set<string>() } as unknown as DomainPlayer;
    expect(findings.observe(10, 10, viewer)).toEqual([{ kind: "dock", x: 12, y: 10 }, { kind: "empire", x: 13, y: 10 }]);
    expect(findings.observe(11, 10, viewer)).toEqual([]);
  });
});
