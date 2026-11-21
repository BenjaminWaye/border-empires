import { describe, expect, it } from "vitest";
import { SCOUT_FIND_POP_MS, createInitialScoutFindsState, handleScoutFindsMessage, scoutFindPlaces } from "./client-scout-drone-finds.js";

// Player reviews 2026-11-21: a 2-3 minute flight showed nothing until it landed. Finds now pop as they come.
describe("SCOUT_FINDS", () => {
  const msg = (launchedAt: number, finds: unknown[]) => ({ type: "SCOUT_FINDS", launchedAt, finds });

  it("pops one label per kind (per resource) at its first find, and keeps every find for the flight", () => {
    const state = createInitialScoutFindsState();
    expect(handleScoutFindsMessage(msg(100, [
      { kind: "town", x: 5, y: 6 },
      { kind: "resource", x: 7, y: 6, resource: "FISH" },
      { kind: "resource", x: 8, y: 6, resource: "FISH" },
      { kind: "dock", x: 9, y: 9 }
    ]), state, 1_000)).toBe(true);
    expect(state.scoutFindPops.map((pop) => `${pop.text}@${pop.x},${pop.y}`)).toEqual(["+1 Town@5,6", "+2 Fish@7,6", "+1 Dock@9,9"]);
    expect(scoutFindPlaces(state, "resource", "FISH")).toEqual([{ kind: "resource", x: 7, y: 6, resource: "FISH" }, { kind: "resource", x: 8, y: 6, resource: "FISH" }]);
  });

  it("starts a new list for a new flight and lets old pops expire", () => {
    const state = createInitialScoutFindsState();
    handleScoutFindsMessage(msg(100, [{ kind: "town", x: 1, y: 1 }]), state, 1_000);
    handleScoutFindsMessage(msg(200, [{ kind: "dock", x: 2, y: 2 }]), state, 1_000 + SCOUT_FIND_POP_MS + 1);
    expect(scoutFindPlaces(state, "town")).toEqual([]);
    expect(scoutFindPlaces(state, "dock")).toHaveLength(1);
    expect(state.scoutFindPops.map((pop) => pop.text)).toEqual(["+1 Dock"]);
  });

  it("ignores malformed finds and other messages", () => {
    const state = createInitialScoutFindsState();
    expect(handleScoutFindsMessage({ type: "SCOUT_DRONE" }, state, 0)).toBe(false);
    handleScoutFindsMessage(msg(100, [{ kind: "castle", x: 1, y: 1 }, { kind: "town", x: "a", y: 1 }]), state, 0);
    expect(state.scoutFindPops).toEqual([]);
  });
});
