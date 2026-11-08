import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createRevealMapStreamer } from "./reveal-map-stream.js";
import { createRevealMapChunkCache } from "../reveal-map-chunk-cache/reveal-map-chunk-cache.js";

const setup = () => {
  const socket = new WebSocket(null, undefined, {});
  Object.defineProperty(socket, "readyState", { value: WebSocket.OPEN, configurable: true });
  const activeSockets = new Set<WebSocket>();
  const send = vi.fn();
  const onComplete = vi.fn();
  const onActiveStreams = vi.fn();
  const cache = createRevealMapChunkCache({ jsonSafeTileDeltaBatch: (tiles) => tiles.map((tile) => ({ ...tile })) });
  const payload = cache.getOrCreate({ playerId: "p1", tiles: [{ x: 0, y: 0, terrain: "LAND" }] });
  const stream = createRevealMapStreamer({ activeSockets, payloadSet: async () => payload,
    send, onComplete, onActiveStreams, onChunk: vi.fn(), sleep: async () => {}, record: vi.fn() });
  return { stream, socket, activeSockets, send, onComplete, onActiveStreams, payload };
};

describe("map overview streaming", () => {
  it("refreshes viewport detail only after the last overview chunk", async () => {
    const { stream, socket, send, onComplete, activeSockets, payload } = setup();
    await stream(socket, "p1");
    expect(send.mock.calls.map((call) => call[1])).toEqual([payload.begin, ...payload.chunks, payload.end]);
    expect(onComplete).toHaveBeenCalledWith(socket);
    expect(onComplete.mock.invocationCallOrder[0]).toBeGreaterThan(send.mock.invocationCallOrder.at(-1)!);
    expect(activeSockets.size).toBe(0);
  });

  it("stops and releases stream capacity when the socket closes", async () => {
    const { stream, socket, send, onComplete, activeSockets, onActiveStreams } = setup();
    Object.defineProperty(socket, "readyState", { value: WebSocket.CLOSED });
    await stream(socket, "p1");
    expect(send).toHaveBeenCalledTimes(1); // begin is queued; no chunks or end are sent
    expect(onComplete).not.toHaveBeenCalled();
    expect(activeSockets.size).toBe(0);
    expect(onActiveStreams).toHaveBeenLastCalledWith(0);
  });
});
