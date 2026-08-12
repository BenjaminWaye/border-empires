import { describe, expect, it } from "vitest";
import { appendPlayerEventLogEntry, PLAYER_EVENT_LOG_MAX_ENTRIES, type PlayerEventLogEntry } from "./index.js";

describe("appendPlayerEventLogEntry", () => {
  it("appends a new entry to an empty log", () => {
    const player: { eventLog?: PlayerEventLogEntry[] } = {};
    appendPlayerEventLogEntry(player, { type: "TOWN_LOST", text: "Home was captured by Rival.", occurredAt: 1_000 });
    expect(player.eventLog).toHaveLength(1);
    expect(player.eventLog?.[0]).toMatchObject({ type: "TOWN_LOST", text: "Home was captured by Rival.", occurredAt: 1_000 });
    expect(player.eventLog?.[0]?.id).toBeTruthy();
  });

  it("appends in order, most-recent-last", () => {
    const player: { eventLog?: PlayerEventLogEntry[] } = {};
    appendPlayerEventLogEntry(player, { type: "TOWN_LOST", text: "first", occurredAt: 1 });
    appendPlayerEventLogEntry(player, { type: "TOWN_LOST", text: "second", occurredAt: 2 });
    expect(player.eventLog?.map((e) => e.text)).toEqual(["first", "second"]);
  });

  it("caps the log at PLAYER_EVENT_LOG_MAX_ENTRIES, dropping the oldest", () => {
    const player: { eventLog?: PlayerEventLogEntry[] } = {};
    for (let i = 0; i < PLAYER_EVENT_LOG_MAX_ENTRIES + 5; i += 1) {
      appendPlayerEventLogEntry(player, { type: "TOWN_LOST", text: `entry-${i}`, occurredAt: i });
    }
    expect(player.eventLog).toHaveLength(PLAYER_EVENT_LOG_MAX_ENTRIES);
    expect(player.eventLog?.[0]?.text).toBe("entry-5");
    expect(player.eventLog?.at(-1)?.text).toBe(`entry-${PLAYER_EVENT_LOG_MAX_ENTRIES + 4}`);
  });

  it("does not mutate a previously-returned eventLog array reference (immutable update)", () => {
    const player: { eventLog?: PlayerEventLogEntry[] } = { eventLog: [] };
    const before = player.eventLog;
    appendPlayerEventLogEntry(player, { type: "TOWN_LOST", text: "x", occurredAt: 1 });
    expect(player.eventLog).not.toBe(before);
    expect(before).toHaveLength(0);
  });

  it("records the tile coordinates when provided, so the client can offer a Go to tile button", () => {
    const player: { eventLog?: PlayerEventLogEntry[] } = {};
    appendPlayerEventLogEntry(player, { type: "TOWN_LOST", text: "Home was captured by Rival.", occurredAt: 1_000, x: 12, y: 18 });
    expect(player.eventLog?.[0]).toMatchObject({ x: 12, y: 18 });
  });

  it("omits x/y entirely when not provided, rather than storing them as undefined", () => {
    const player: { eventLog?: PlayerEventLogEntry[] } = {};
    appendPlayerEventLogEntry(player, { type: "TOWN_LOST", text: "x", occurredAt: 1 });
    expect(player.eventLog?.[0]).not.toHaveProperty("x");
    expect(player.eventLog?.[0]).not.toHaveProperty("y");
  });
});
