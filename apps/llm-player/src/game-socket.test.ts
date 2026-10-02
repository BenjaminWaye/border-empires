import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import type { AddressInfo } from "node:net";
import { GameSession } from "./game-socket.js";
import { sleep } from "./sleep.js";

// A real local WebSocket server standing in for the gateway, so the actual
// GameSession wire path (AUTH -> INIT, then the messages it reacts to) is
// exercised rather than only the pure helpers around it.
type FakeGateway = { url: string; received: Array<Record<string, unknown>>; send: (payload: unknown) => void; close: () => Promise<void> };

const INIT_MESSAGE = {
  type: "INIT",
  player: { id: "me", name: "Bot", gold: 50, manpower: 100, manpowerCap: 150, manpowerRegenPerMinute: 0.2 },
  initialState: {
    tiles: [{ x: 0, y: 0, ownerId: "me", ownershipState: "SETTLED" }],
    player: { techIds: ["agriculture"], autoSettlementQueue: [], eventLog: [] }
  }
};

const startFakeGateway = async (): Promise<FakeGateway> => {
  const server = new WebSocketServer({ port: 0 });
  const received: Array<Record<string, unknown>> = [];
  let client: ServerSocket | undefined;
  server.on("connection", (socket) => {
    client = socket;
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      received.push(message);
      if (message.type === "AUTH") socket.send(JSON.stringify(INIT_MESSAGE));
    });
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    received,
    send: (payload) => client?.send(JSON.stringify(payload)),
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
};

let gateway: FakeGateway | undefined;
let session: GameSession | undefined;

afterEach(async () => {
  session?.close();
  session = undefined;
  await gateway?.close();
  gateway = undefined;
});

const connect = async (): Promise<GameSession> => {
  gateway = await startFakeGateway();
  session = await GameSession.connect(gateway.url, "token");
  return session;
};

describe("GameSession wire handling", () => {
  it("reads tech and slot state from INIT", async () => {
    const game = await connect();
    expect(game.currentState().techIds).toEqual(["agriculture"]);
  });

  it("captures a rejection ERROR carrying a server-generated commandId", async () => {
    const game = await connect();
    await game.sendFireAndForget({ type: "CHOOSE_TECH", techId: "mining" });
    gateway?.send({ type: "ERROR", commandId: "server-cmd-1", code: "TECH_INVALID", message: "requirements not met" });
    await sleep(50);
    expect(game.drainUnmatchedErrors()).toEqual([
      expect.objectContaining({ code: "TECH_INVALID", message: "requirements not met" })
    ]);
    expect(game.drainUnmatchedErrors()).toEqual([]);
  });

  it("does not capture a gateway-level ERROR with no commandId (e.g. a rate limit)", async () => {
    const game = await connect();
    gateway?.send({ type: "ERROR", code: "COMMAND_RATE_LIMITED", message: "slow down" });
    await sleep(50);
    expect(game.drainUnmatchedErrors()).toEqual([]);
  });

  it("records the server commandId and dedupes a repeated rejection", async () => {
    const game = await connect();
    gateway?.send({ type: "ERROR", commandId: "server-cmd-9", code: "BUILD_INVALID", message: "x" });
    gateway?.send({ type: "ERROR", commandId: "server-cmd-9", code: "BUILD_INVALID", message: "x" });
    await sleep(50);
    expect(game.drainUnmatchedErrors()).toEqual([expect.objectContaining({ commandId: "server-cmd-9", code: "BUILD_INVALID" })]);
  });

  it("does not treat a matched sendAction ERROR as unmatched", async () => {
    const game = await connect();
    const result = game.sendAction({ type: "SETTLE", x: 0, y: 0 });
    await sleep(50);
    const sent = gateway?.received.find((message) => message.type === "SETTLE");
    gateway?.send({ type: "ERROR", commandId: sent?.commandId, code: "SETTLE_INVALID", message: "nope" });
    await expect(result).resolves.toEqual({ outcome: "error", code: "SETTLE_INVALID", message: "nope" });
    expect(game.drainUnmatchedErrors()).toEqual([]);
  });

  it("ignores a late ERROR for one of its own already-timed-out command ids", async () => {
    const game = await connect();
    gateway?.send({ type: "ERROR", commandId: "llm-player-123-abc", code: "LATE", message: "" });
    await sleep(50);
    expect(game.drainUnmatchedErrors()).toEqual([]);
  });

  it("ignores non-ERROR messages that merely lack a pending commandId", async () => {
    const game = await connect();
    gateway?.send({ type: "ACTION_ACCEPTED", commandId: "someone-else" });
    await sleep(50);
    expect(game.drainUnmatchedErrors()).toEqual([]);
  });

  it("refreshes techIds from TECH_UPDATE and tiles from TILE_DELTA_BATCH", async () => {
    const game = await connect();
    gateway?.send({ type: "TECH_UPDATE", techIds: ["agriculture", "mining"] });
    gateway?.send({ type: "TILE_DELTA_BATCH", tiles: [{ x: 0, y: 0, economicStructureJson: JSON.stringify({ type: "WOODEN_FORT" }) }] });
    await sleep(50);
    const state = game.currentState();
    expect(state.techIds).toEqual(["agriculture", "mining"]);
    expect(state.tiles.find((tile) => tile.x === 0 && tile.y === 0)?.economicStructureJson).toContain("WOODEN_FORT");
  });

  it("bounds how many unmatched errors it retains", async () => {
    const game = await connect();
    for (let i = 0; i < 40; i += 1) gateway?.send({ type: "ERROR", commandId: `srv-${i}`, code: `E${i}`, message: "" });
    await sleep(150);
    const drained = game.drainUnmatchedErrors();
    expect(drained.length).toBe(20);
    expect(drained.at(-1)?.code).toBe("E39");
  });
});
