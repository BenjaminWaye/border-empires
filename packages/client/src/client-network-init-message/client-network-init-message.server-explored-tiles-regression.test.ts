// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, encodeExploredTilesRuns } from "@border-empires/shared";

import { FakeWebSocket, bind, createState } from "./client-network-test-harness.js";

// Regression: explored land showed as unexplored storm after a restart or
// reconnect whenever the browser's own copy was missing (site data cleared,
// new device, season/player mismatch). INIT now carries the server-held
// memory as player.exploredTiles, and the client must union it into
// discoveredTiles even with nothing in localStorage.

const exploredRuns = (cells: Array<[number, number]>) => {
  const bits = new Uint8Array(Math.ceil((WORLD_WIDTH * WORLD_HEIGHT) / 8));
  for (const [x, y] of cells) {
    const index = y * WORLD_WIDTH + x;
    bits[index >> 3] = (bits[index >> 3] ?? 0) | (1 << (index & 7));
  }
  return encodeExploredTilesRuns(bits, WORLD_WIDTH, WORLD_HEIGHT);
};

const sendInit = (ws: FakeWebSocket, exploredTiles: unknown) =>
  ws.emit("message", {
    data: JSON.stringify({
      type: "INIT",
      player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 10, y: 10 }, exploredTiles },
      config: { season: { seasonId: "rewrite-stress-10ai", worldSeed: 1010 } },
      runtimeIdentity: { fingerprint: "runtime-fp-1", snapshotLabel: "snap-a" },
      initialState: {
        playerId: "player-1",
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
      }
    })
  });

describe("client-network-init-message server explored tiles", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("restores explored tiles from INIT's player.exploredTiles with empty browser storage", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws, exploredRuns([[40, 40], [41, 40], [120, 200]]));

    expect(state.discoveredTiles.has("40,40")).toBe(true);
    expect(state.discoveredTiles.has("41,40")).toBe(true);
    expect(state.discoveredTiles.has("120,200")).toBe(true);
    expect(state.discoveredTiles.has("10,10")).toBe(true);
    expect(state.discoveredTiles.has("42,40")).toBe(false);
  });

  it("ignores a malformed exploredTiles payload", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws, { width: WORLD_WIDTH + 1, height: WORLD_HEIGHT, runs: [0, 5] });

    expect(state.discoveredTiles.has("0,0")).toBe(false);
    expect(state.discoveredTiles.has("10,10")).toBe(true);
  });
});
