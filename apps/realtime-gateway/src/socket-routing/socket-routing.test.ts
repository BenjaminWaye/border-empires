import { describe, expect, it } from "vitest";

import { selectSocketsForEvent, selectSocketsForTileDeltaBatchByPlayer } from "./socket-routing.js";

type FakeSocket = {
  id: string;
  readyState: number;
  readonly OPEN: number;
};

const createSocket = (id: string, readyState = 1): FakeSocket => ({
  id,
  readyState,
  OPEN: 1
});

describe("socket routing", () => {
  it("falls back to an open bulk socket when the only control socket is stale", () => {
    const closedControl = createSocket("control-stale", 3);
    const openBulk = createSocket("bulk-open");
    const sockets = new Set([closedControl, openBulk]);
    const sessions = new Map([
      [closedControl, { playerId: "player-1", channel: "control" as const }],
      [openBulk, { playerId: "player-1", channel: "bulk" as const }]
    ]);

    expect(selectSocketsForEvent(sockets, "COMMAND_ACCEPTED", (socket) => sessions.get(socket))).toEqual([openBulk]);
  });

  it("keeps bulk tile deltas on the healthy bulk socket for each player", () => {
    const closedControl = createSocket("control-stale", 3);
    const openBulk = createSocket("bulk-open");
    const otherControl = createSocket("other-control");
    const sockets = new Set([closedControl, openBulk, otherControl]);
    const sessions = new Map([
      [closedControl, { playerId: "player-1", channel: "control" as const }],
      [openBulk, { playerId: "player-1", channel: "bulk" as const }],
      [otherControl, { playerId: "player-2", channel: "control" as const }]
    ]);

    expect(selectSocketsForTileDeltaBatchByPlayer(sockets, (socket) => sessions.get(socket))).toEqual([openBulk, otherControl]);
  });
});
