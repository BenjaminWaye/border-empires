import { describe, expect, it, vi } from "vitest";

import { BroadcastPayload, preSerializeBroadcast, sendJsonToSocket, unwrapPayloadSource } from "./broadcast-payload.js";

const fakeOpenSocket = () => {
  const send = vi.fn<(data: string) => void>();
  return {
    OPEN: 1,
    readyState: 1,
    send,
    sendMock: send
  };
};

describe("preSerializeBroadcast", () => {
  it("stringifies once and reuses the string for every socket in a fanout", () => {
    const payload = { type: "TILE_DELTA_BATCH", commandId: "cmd-1", tiles: [{ x: 1, y: 2 }] };
    const stringifySpy = vi.spyOn(JSON, "stringify");
    try {
      const broadcast = preSerializeBroadcast(payload);
      const sockets = [fakeOpenSocket(), fakeOpenSocket(), fakeOpenSocket()];
      stringifySpy.mockClear();
      for (const socket of sockets) sendJsonToSocket(socket, broadcast);
      expect(stringifySpy).not.toHaveBeenCalled();
      for (const socket of sockets) {
        expect(socket.sendMock).toHaveBeenCalledTimes(1);
        expect(socket.sendMock.mock.calls[0]?.[0]).toBe(broadcast.serialized);
        expect(JSON.parse(socket.sendMock.mock.calls[0]?.[0] ?? "")).toEqual(payload);
      }
    } finally {
      stringifySpy.mockRestore();
    }
  });

  it("returns the same wrapper when called twice on an already-serialized payload", () => {
    const wrapped = preSerializeBroadcast({ a: 1 });
    expect(preSerializeBroadcast(wrapped)).toBe(wrapped);
  });
});

describe("sendJsonToSocket", () => {
  it("falls back to JSON.stringify for raw object payloads", () => {
    const socket = fakeOpenSocket();
    sendJsonToSocket(socket, { type: "INIT" });
    expect(socket.sendMock).toHaveBeenCalledTimes(1);
    expect(socket.sendMock.mock.calls[0]?.[0]).toBe(JSON.stringify({ type: "INIT" }));
  });

  it("does not send when the socket is not OPEN", () => {
    const socket = { OPEN: 1, readyState: 0, send: vi.fn<(data: string) => void>() };
    sendJsonToSocket(socket, { type: "INIT" });
    expect(socket.send).not.toHaveBeenCalled();
  });
});

describe("unwrapPayloadSource", () => {
  it("returns the original object so telemetry can read commandId/type fields", () => {
    const source = { type: "ACTION_ACCEPTED", commandId: "cmd-7" };
    const wrapped = new BroadcastPayload(JSON.stringify(source), source);
    expect(unwrapPayloadSource(wrapped)).toBe(source);
  });

  it("returns the input untouched when it is already a plain object", () => {
    const source = { type: "ERROR" };
    expect(unwrapPayloadSource(source)).toBe(source);
  });
});
