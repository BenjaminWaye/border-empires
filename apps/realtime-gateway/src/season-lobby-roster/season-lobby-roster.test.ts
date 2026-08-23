import { describe, expect, it } from "vitest";

import { createSeasonLobbyRoster } from "./season-lobby-roster.js";

describe("season lobby roster", () => {
  it("checks a new player in and reports the roster grew", () => {
    const roster = createSeasonLobbyRoster();
    const changed = roster.checkIn("p1", "Alice", "US");
    expect(changed).toBe(true);
    expect(roster.size()).toBe(1);
    expect(roster.entries()).toEqual([{ playerId: "p1", name: "Alice", countryFlag: "US" }]);
  });

  it("omits countryFlag when not set", () => {
    const roster = createSeasonLobbyRoster();
    roster.checkIn("p1", "Alice");
    expect(roster.entries()).toEqual([{ playerId: "p1", name: "Alice" }]);
  });

  it("is idempotent for a repeat check-in with unchanged data", () => {
    const roster = createSeasonLobbyRoster();
    roster.checkIn("p1", "Alice", "US");
    const changed = roster.checkIn("p1", "Alice", "US");
    expect(changed).toBe(false);
    expect(roster.size()).toBe(1);
  });

  it("reports a change when the name or flag updates", () => {
    const roster = createSeasonLobbyRoster();
    roster.checkIn("p1", "Alice");
    expect(roster.checkIn("p1", "Alice", "US")).toBe(true);
    expect(roster.checkIn("p1", "Alicia", "US")).toBe(true);
  });

  it("has/remove track membership", () => {
    const roster = createSeasonLobbyRoster();
    roster.checkIn("p1", "Alice");
    expect(roster.has("p1")).toBe(true);
    roster.remove("p1");
    expect(roster.has("p1")).toBe(false);
    expect(roster.size()).toBe(0);
  });

  it("reset clears everyone", () => {
    const roster = createSeasonLobbyRoster();
    roster.checkIn("p1", "Alice");
    roster.checkIn("p2", "Bob");
    roster.reset();
    expect(roster.size()).toBe(0);
    expect(roster.entries()).toEqual([]);
  });

  it("dedupes multiple distinct players", () => {
    const roster = createSeasonLobbyRoster();
    roster.checkIn("p1", "Alice");
    roster.checkIn("p2", "Bob");
    roster.checkIn("p1", "Alice");
    expect(roster.size()).toBe(2);
  });
});
