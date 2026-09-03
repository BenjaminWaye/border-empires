/**
 * Observatory CRYSTAL-slot demand cases. Kept out of resource-slot-view.test.ts,
 * which is at its 500-line budget (AGENTS.md).
 */
import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { resourceSlotDemandForPlayer } from "./resource-slot-view.js";

type PartialTile = Partial<DomainTileState> & Record<string, unknown>;

describe("resourceSlotDemandForPlayer — Aether Towers", () => {
  it("a manually disabled Aether Tower stops paying CRYSTAL and frees the progressive rank behind it", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { x: 0, y: 0, observatory: { ownerId: "p1", status: "inactive", activatedAt: 1_000 } } as PartialTile as DomainTileState,
        { x: 1, y: 0, observatory: { ownerId: "p1", status: "active", activatedAt: 2_000 } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    // The disabled tower contributes nothing, so the remaining tower is the
    // 1st paid copy (1 CRYSTAL) rather than the 2nd (2 CRYSTAL).
    expect(totals.CRYSTAL).toBe(1);
  });

  it("still charges the progressive ladder for towers that are switched on", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { x: 0, y: 0, observatory: { ownerId: "p1", status: "active", activatedAt: 1_000 } } as PartialTile as DomainTileState,
        { x: 1, y: 0, observatory: { ownerId: "p1", status: "active", activatedAt: 2_000 } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.CRYSTAL).toBe(3);
  });
});
