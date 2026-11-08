import { describe, expect, it } from "vitest";
import { enrichSavedSeasonStats } from "./season-stats-merge.js";

describe("enrichSavedSeasonStats", () => {
  const attributed = { x: 1, y: 2, manpowerLost: 100, mostLossesPlayer: { playerId: "p", playerName: "Waypoint", manpowerLost: 75 } };
  it("enriches matching historical tile totals without changing them", () => {
    expect(enrichSavedSeasonStats({ mostDeadlyTile: { x: 1, y: 2, manpowerLost: 100 } }, { mostDeadlyTile: attributed })?.mostDeadlyTile).toEqual(attributed);
  });
  it("rejects attribution from another tile or an incomplete total", () => {
    const old = { mostDeadlyTile: { x: 1, y: 2, manpowerLost: 100 } };
    expect(enrichSavedSeasonStats(old, { mostDeadlyTile: { ...attributed, x: 3 } })).toEqual(old);
    expect(enrichSavedSeasonStats(old, { mostDeadlyTile: { ...attributed, manpowerLost: 50 } })).toEqual(old);
  });
  it("preserves already captured player attribution", () => {
    const captured = { mostDeadlyTile: attributed };
    expect(enrichSavedSeasonStats(captured, { mostDeadlyTile: { ...attributed, mostLossesPlayer: { playerId: "other", playerName: "Other", manpowerLost: 99 } } })).toEqual(captured);
  });
  it("does not replace a captured road with details for a different length", () => {
    const saved = { longestRoad: { tileCount: 3 } };
    const derived = { longestRoad: { tileCount: 4, playerId: "p", playerName: "Waypoint",
      fromCity: { x: 1, y: 2, name: "A" }, toCity: { x: 3, y: 4, name: "B" } } };
    expect(enrichSavedSeasonStats(saved, derived)).toEqual(saved);
  });
  it("fills missing sibling records while preserving already captured values", () => {
    const road = { tileCount: 12 };
    const derived = { longestRoad: { tileCount: 42 }, mostDeadlyTile: attributed };
    expect(enrichSavedSeasonStats({ longestRoad: road }, derived)).toEqual({ longestRoad: road, mostDeadlyTile: attributed });
    expect(enrichSavedSeasonStats({ mostDeadlyTile: attributed }, derived)).toEqual(derived);
  });

});
