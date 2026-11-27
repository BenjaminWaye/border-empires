import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createRevealMapStreamer } from "./reveal-map-stream.js";
import { createRevealMapChunkCache } from "../reveal-map-chunk-cache/reveal-map-chunk-cache.js";

const setup = (options: { payloadGate?: Promise<void>; maxHeldPayloads?: number } = {}) => {
  const socket = new WebSocket(null, undefined, {});
  Object.defineProperty(socket, "readyState", { value: WebSocket.OPEN, configurable: true });
  const activeSockets = new Set<WebSocket>();
  const send = vi.fn();
  const onComplete = vi.fn();
  const onActiveStreams = vi.fn();
  const cache = createRevealMapChunkCache({ jsonSafeTileDeltaBatch: (tiles) => tiles.map((tile) => ({ ...tile })) });
  const payload = cache.getOrCreate({ playerId: "p1", tiles: [{ x: 0, y: 0, terrain: "LAND" }] });
  const record = vi.fn();
  const streamer = createRevealMapStreamer({ activeSockets, payloadSet: async () => { await options.payloadGate; return payload; },
    send, onComplete, onActiveStreams, onChunk: vi.fn(), sleep: async () => {}, record,
    ...(options.maxHeldPayloads ? { maxHeldPayloads: options.maxHeldPayloads } : {}) });
  return { stream: streamer.stream, sendOrHold: streamer.sendOrHold, socket, activeSockets, send, onComplete, onActiveStreams, payload, record };
};

describe("map overview streaming", () => {
  it("refreshes viewport detail only after the last overview chunk", async () => {
    const { stream, socket, send, onComplete, activeSockets, payload } = setup();
    await stream(socket, "p1", () => true);
    expect(send.mock.calls.map((call) => call[1])).toEqual([payload.begin, ...payload.chunks, payload.end]);
    expect(onComplete).toHaveBeenCalledWith(socket);
    expect(onComplete.mock.invocationCallOrder[0]).toBeGreaterThan(send.mock.invocationCallOrder.at(-1)!);
    expect(activeSockets.size).toBe(0);
  });

  it("stops and releases stream capacity when the socket closes", async () => {
    const { stream, socket, send, onComplete, activeSockets, onActiveStreams } = setup();
    Object.defineProperty(socket, "readyState", { value: WebSocket.CLOSED });
    await stream(socket, "p1", () => true);
    expect(send).not.toHaveBeenCalled(); // nothing is sent into a closed socket
    expect(onComplete).not.toHaveBeenCalled();
    expect(activeSockets.size).toBe(0);
    expect(onActiveStreams).toHaveBeenLastCalledWith(0);
  });

  it("holds live deltas during the stream and replays them, in order, after the last chunk", async () => {
    let openGate!: () => void;
    const payloadGate = new Promise<void>((resolve) => { openGate = resolve; });
    const { stream, sendOrHold, socket, send, payload } = setup({ payloadGate });
    const before = { type: "TILE_DELTA_BATCH", commandId: "before" };
    const during1 = { type: "TILE_DELTA_BATCH", commandId: "during-1" };
    const during2 = { type: "TILE_DELTA_BATCH", commandId: "during-2" };
    const after = { type: "TILE_DELTA_BATCH", commandId: "after" };

    sendOrHold(socket, before);
    const streaming = stream(socket, "p1", () => true);
    sendOrHold(socket, during1); // the full-world export is still being built
    sendOrHold(socket, during2);
    expect(send.mock.calls.map((call) => call[1])).toEqual([before]);
    openGate();
    await streaming;
    sendOrHold(socket, after);

    expect(send.mock.calls.map((call) => call[1])).toEqual([before, payload.begin, ...payload.chunks, payload.end, during1, during2, after]);
  });

  // Held deltas are a spectator's unfiltered copy: delivering them to a socket
  // that never got the revealed map would reveal parts of a fogged view.
  it("drops held deltas when the export fails", async () => {
    const { stream, sendOrHold, socket, send, activeSockets } = setup({ payloadGate: Promise.reject(new Error("simulation timed out")) });
    const streaming = stream(socket, "p1", () => true);
    sendOrHold(socket, { type: "TILE_DELTA_BATCH", commandId: "held" });
    await expect(streaming).rejects.toThrow("simulation timed out");
    expect(send).not.toHaveBeenCalled();
    expect(activeSockets.size).toBe(0);
  });

  it("stops before the next send, and drops what it held, once the reveal is no longer wanted", async () => {
    let wanted = true;
    let openGate!: () => void;
    const payloadGate = new Promise<void>((resolve) => { openGate = resolve; });
    const { stream, sendOrHold, socket, send, onComplete, payload } = setup({ payloadGate });
    const streaming = stream(socket, "p1", () => wanted);
    sendOrHold(socket, { type: "TILE_DELTA_BATCH", commandId: "held" });
    wanted = false; // fog restored while the export was still being built
    openGate();
    await streaming;
    expect(send.mock.calls.map((call) => call[1])).not.toContain(payload.begin);
    expect(send).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("refuses a second stream on a socket that is already streaming", async () => {
    let openGate!: () => void;
    const payloadGate = new Promise<void>((resolve) => { openGate = resolve; });
    const { stream, socket, activeSockets } = setup({ payloadGate });
    const first = stream(socket, "p1", () => true);
    await expect(stream(socket, "p1", () => true)).rejects.toThrow("already streaming");
    expect(activeSockets.has(socket)).toBe(true); // the first stream still owns it
    openGate();
    await first;
    expect(activeSockets.size).toBe(0);
  });

  it("stops holding once the cap is reached instead of growing without bound", async () => {
    let openGate!: () => void;
    const payloadGate = new Promise<void>((resolve) => { openGate = resolve; });
    const { stream, sendOrHold, socket, send, record } = setup({ payloadGate, maxHeldPayloads: 2 });
    const streaming = stream(socket, "p1", () => true);
    const deltas = [1, 2, 3].map((index) => ({ type: "TILE_DELTA_BATCH", commandId: `d${index}` }));
    for (const delta of deltas) sendOrHold(socket, delta);
    expect(send.mock.calls.map((call) => call[1])).toEqual(deltas);
    expect(record).toHaveBeenCalledWith("gateway_reveal_map_held_overflow", { heldPayloads: 2 });
    openGate();
    await streaming;
  });
});
