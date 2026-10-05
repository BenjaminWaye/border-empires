import { describe, expect, it, vi } from "vitest";

import { isSeasonRolloverEvent, scheduleSeasonRolloverResync } from "./season-rollover-resync.js";

const fakeSocket = (readyState = 1) => ({ readyState, OPEN: 1, close: vi.fn() });

describe("isSeasonRolloverEvent", () => {
  it("matches the simulation's rollover notice, which carries no player id", () => {
    expect(isSeasonRolloverEvent({ eventType: "PLAYER_MESSAGE", playerId: "", payload: { type: "SEASON_ROLLOVER", seasonId: "season-34" } })).toBe(true);
  });

  it("ignores other player messages and per-player events", () => {
    expect(isSeasonRolloverEvent({ eventType: "PLAYER_MESSAGE", playerId: "", payload: { type: "SOMETHING_ELSE" } })).toBe(false);
    expect(isSeasonRolloverEvent({ eventType: "PLAYER_MESSAGE", playerId: "player-1", payload: { type: "SEASON_ROLLOVER" } })).toBe(false);
    expect(isSeasonRolloverEvent({ eventType: "COMMAND_ACCEPTED", playerId: "", payload: { type: "SEASON_ROLLOVER" } })).toBe(false);
  });
});

describe("scheduleSeasonRolloverResync", () => {
  it("closes each open socket with the rollover code at a random point inside the spread window", () => {
    const first = fakeSocket();
    const second = fakeSocket();
    const delays: number[] = [];
    const tasks: Array<() => void> = [];
    const randoms = [0.25, 0.75];

    const scheduled = scheduleSeasonRolloverResync([[first], [second]], {
      spreadMs: 1_000,
      random: () => randoms.shift() ?? 0,
      setTimer: (task, delayMs) => {
        tasks.push(task);
        delays.push(delayMs);
      }
    });

    expect(scheduled).toBe(2);
    expect(delays).toEqual([250, 750]);
    expect(first.close).not.toHaveBeenCalled();
    tasks.forEach((task) => task());
    expect(first.close).toHaveBeenCalledWith(4009, "season_rollover");
    expect(second.close).toHaveBeenCalledWith(4009, "season_rollover");
  });

  it("closes all of one player's sockets together, because the gateway keeps the player's cached snapshot until the last one closes", () => {
    const control = fakeSocket();
    const bulk = fakeSocket();
    const otherPlayer = fakeSocket();
    const delays: number[] = [];
    const tasks: Array<() => void> = [];

    scheduleSeasonRolloverResync([[control, bulk], [otherPlayer]], { setTimer: (task, delayMs) => { tasks.push(task); delays.push(delayMs); } });

    expect(tasks).toHaveLength(2);
    tasks[0]?.();
    expect(control.close).toHaveBeenCalledTimes(1);
    expect(bulk.close).toHaveBeenCalledTimes(1);
    expect(otherPlayer.close).not.toHaveBeenCalled();
  });

  it("skips sockets that are not open, including ones that close before their turn", () => {
    const closed = fakeSocket(3);
    const dropsEarly = fakeSocket();
    const tasks: Array<() => void> = [];

    const scheduled = scheduleSeasonRolloverResync([[closed], [dropsEarly]], { setTimer: (task) => void tasks.push(task) });
    dropsEarly.readyState = 3;
    tasks.forEach((task) => task());

    expect(scheduled).toBe(1);
    expect(closed.close).not.toHaveBeenCalled();
    expect(dropsEarly.close).not.toHaveBeenCalled();
  });
});
