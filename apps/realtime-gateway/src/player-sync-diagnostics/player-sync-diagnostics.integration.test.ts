import { once } from "node:events";
import WebSocket from "ws";
import { describe, expect, it } from "vitest";
import { createRealtimeGatewayApp } from "../gateway-app/gateway-app.js";

const waitForType = (socket: WebSocket, type: string): Promise<void> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off("message", listener); reject(new Error(`missing ${type}`)); }, 5000);
  const listener = (data: WebSocket.RawData): void => {
    const message: unknown = JSON.parse(data.toString());
    if (typeof message !== "object" || message === null || !("type" in message) || message.type !== type) return;
    clearTimeout(timer); socket.off("message", listener); resolve();
  };
  socket.on("message", listener);
});

describe("player command diagnostic collection through the real gateway", () => {
  it("joins a socket command to the authenticated HTTP export without exposing admin diagnostics", async () => {
    const app = await createRealtimeGatewayApp({
      logger: false, port: 0, defaultHumanPlayerId: "player-1",
      simulationClient: {
        preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async () => ({ playerId: "player-1", tiles: [] }),
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: (_listener, options) => { options?.onConnect?.(); return () => undefined; }
      }
    });
    let socket: WebSocket | undefined;
    try {
      const started = await app.start();
      socket = new WebSocket(started.wsUrl);
      await once(socket, "open");
      const init = waitForType(socket, "INIT");
      socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
      await init;
      const queued = waitForType(socket, "COMMAND_QUEUED");
      socket.send(JSON.stringify({ type: "EXPAND", commandId: "incident-command", clientSeq: 7, fromX: 1, fromY: 1, toX: 2, toY: 1 }));
      await queued;
      const origin = started.wsUrl.replace(/^ws:/, "http:").replace(/\/ws$/, "");
      const response = await fetch(`${origin}/api/player/sync-diagnostics`, { headers: { authorization: "Bearer player-1" } });
      expect(response.status).toBe(200);
      const body: { recentServerEvents: Array<{ event: string; payload: { commandId: string; stage?: string } }> } = await response.json();
      expect(body.recentServerEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: "gateway_frontier_received", payload: expect.objectContaining({ commandId: "incident-command" }) }),
        expect.objectContaining({ event: "gateway_frontier_stage", payload: expect.objectContaining({ commandId: "incident-command", stage: "persisted" }) }),
        expect.objectContaining({ event: "gateway_frontier_stage", payload: expect.objectContaining({ stage: "simulation-submit-complete" }) })
      ]));
      expect((await fetch(`${origin}/api/player/sync-diagnostics`)).status).toBe(401);
      expect((await fetch(`${origin}/admin/runtime/debug-bundle`, { headers: { authorization: "Bearer player-1" } })).status).toBe(401);
    } finally {
      socket?.terminate();
      await app.close();
    }
  }, 15_000);
});
