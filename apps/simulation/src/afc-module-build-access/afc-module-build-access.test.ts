import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { hasAbilityAccess } from "./afc-module-build-access.js";

// A captured module casts for its captor only while they hold its AFC.
const afc = (overrides: Partial<DomainTileState> = {}, afcOwner = "me", status: "active" | "inactive" = "active"): DomainTileState => ({
  x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  afc: { ownerId: afcOwner, status, activatedAt: 0, modules: ["terrain-engineering"], houseModules: [], capturedModuleHouses: { "terrain-engineering": "rival" } },
  ...overrides
} as DomainTileState);
const actor = (techIds: string[] = []) => ({ id: "me", techIds: new Set(techIds) });
const access = (tile: DomainTileState, techIds: string[] = [], keys?: string[]) =>
  hasAbilityAccess({ tiles: new Map([["1,1", tile]]), ...(keys ? { ownedAfcTileKeys: () => keys } : {}) }, actor(techIds), "create_mountain");

describe("hasAbilityAccess", () => {
  it("accepts research alone or an installed captured copy", () => {
    expect(access(afc({ afc: undefined }), ["terrain-engineering"])).toBe(true);
    expect(access(afc())).toBe(true);
    expect(access(afc(), [], ["1,1"])).toBe(true);
  });

  it("loses access when the AFC is retaken, not settled or inactive", () => {
    expect(access(afc({ ownerId: "rival" }, "rival"))).toBe(false);
    expect(access(afc({ ownershipState: "FRONTIER" }))).toBe(false);
    expect(access(afc({}, "me", "inactive"))).toBe(false);
    expect(access(afc(), [], [])).toBe(false);
  });

  it("does not grant a different module's ability", () => {
    const tiles = new Map([["1,1", afc()]]);
    expect(hasAbilityAccess({ tiles }, actor(), "aether_emp")).toBe(false);
  });
});
