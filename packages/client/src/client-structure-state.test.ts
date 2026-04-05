import { describe, expect, it } from "vitest";

import { tileHasAnyStructure, tileHasPendingStructureWork } from "./client-structure-state.js";

describe("client structure state helpers", () => {
  it("treats any placed structure as occupying the tile", () => {
    expect(tileHasAnyStructure({ economicStructure: { status: "active" } })).toBe(true);
    expect(tileHasAnyStructure({})).toBe(false);
  });

  it("detects active construction and removal work across structure kinds", () => {
    expect(tileHasPendingStructureWork({ observatory: { status: "under_construction" } })).toBe(true);
    expect(tileHasPendingStructureWork({ fort: { status: "removing" } })).toBe(true);
    expect(tileHasPendingStructureWork({ siegeOutpost: { status: "active" } })).toBe(false);
  });
});
