import { describe, expect, it } from "vitest";

import { bind, createState, FakeWebSocket } from "./client-network-test-harness.js";

// Regression: the client kept the last REACH_UPDATE revision across reconnects,
// while a restarted simulation numbered its pushes from 1 again. A tab left open
// through a deploy dropped every new border as stale, so the reach border froze
// while tiles kept updating. Every INIT must let the next REACH_UPDATE through.
const sendInit = (ws: FakeWebSocket, playerId: string): void => {
  ws.emit("message", {
    data: JSON.stringify({
      type: "INIT",
      player: { id: playerId, name: playerId, points: 5, level: 1, stamina: 0, homeTile: { x: 40, y: 40 } },
      config: { season: { seasonId: "season-34", worldSeed: 12345 } },
      recovery: { nextClientSeq: 1, pendingCommands: [] }
    })
  });
};

const sendReach = (ws: FakeWebSocket, tileKeys: string[], revision: number): void => {
  ws.emit("message", { data: JSON.stringify({ type: "REACH_UPDATE", tileKeys, revision }) });
};

describe("INIT resets the accepted reach revision", () => {
  it("applies a restarted simulation's lower-numbered border after a same-player reconnect", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);
    sendInit(ws, "player-1");
    sendReach(ws, ["1,1"], 340);

    sendInit(ws, "player-1");
    expect(state.serverReach).toEqual(new Set(["1,1"])); // last border stays drawn until the new one lands
    sendReach(ws, ["1,1", "2,2"], 2);

    expect(state.serverReach).toEqual(new Set(["1,1", "2,2"]));
  });

  it("drops the previous player's border when a different player logs in on the same tab", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);
    sendInit(ws, "player-1");
    sendReach(ws, ["1,1"], 5);

    sendInit(ws, "player-2");

    expect(state.serverReach).toBeUndefined();
    expect(state.serverReachRevision).toBe(0);
  });
});
