import { afterEach, describe, expect, it, vi } from "vitest";
import { createMultiplexWebSocket } from "./client-multiplex-websocket.js";

// Node (this file's test environment) has the standard Event/EventTarget
// globals but not the WebSocket-specific CloseEvent, unlike browsers.
if (typeof globalThis.CloseEvent === "undefined") {
  class CloseEventPolyfill extends Event {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
    constructor(type: string, init: CloseEventInit = {}) {
      super(type);
      this.code = init.code ?? 0;
      this.reason = init.reason ?? "";
      this.wasClean = init.wasClean ?? false;
    }
  }
  (globalThis as unknown as { CloseEvent: typeof CloseEventPolyfill }).CloseEvent = CloseEventPolyfill;
}

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly CONNECTING = FakeWebSocket.CONNECTING;
  readonly OPEN = FakeWebSocket.OPEN;
  readonly CLOSING = FakeWebSocket.CLOSING;
  readonly CLOSED = FakeWebSocket.CLOSED;
  readonly sent: string[] = [];
  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;

  constructor(url: string) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.readyState = FakeWebSocket.CLOSED;
    const init: CloseEventInit = {};
    if (code !== undefined) init.code = code;
    if (reason !== undefined) init.reason = reason;
    this.dispatchEvent(new CloseEvent("close", init));
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }
}

describe("client-multiplex-websocket", () => {
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    FakeWebSocket.instances = [];
    vi.restoreAllMocks();
    globalThis.WebSocket = originalWebSocket;
  });

  it("routes control and bulk messages to separate sockets once both sockets are open", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const socket = createMultiplexWebSocket("wss://example.com/ws");
    const [control, bulk] = FakeWebSocket.instances;
    control?.open();
    bulk?.open();

    socket.send(JSON.stringify({ type: "AUTH", token: "abc" }));
    socket.send(JSON.stringify({ type: "ATTACK", fromX: 1, fromY: 1, toX: 2, toY: 2 }));
    socket.send(JSON.stringify({ type: "SUBSCRIBE_CHUNKS", cx: 1, cy: 2, radius: 3 }));
    socket.send(JSON.stringify({ type: "REQUEST_REVEAL_MAP" }));

    expect(control?.url).toContain("channel=control");
    expect(bulk?.url).toContain("channel=bulk");
    expect(control?.sent).toEqual([
      JSON.stringify({ type: "AUTH", token: "abc" }),
      JSON.stringify({ type: "ATTACK", fromX: 1, fromY: 1, toX: 2, toY: 2 })
    ]);
    expect(bulk?.sent).toEqual([
      JSON.stringify({ type: "AUTH", token: "abc" }),
      JSON.stringify({ type: "SUBSCRIBE_CHUNKS", cx: 1, cy: 2, radius: 3 }),
      JSON.stringify({ type: "REQUEST_REVEAL_MAP" })
    ]);
  });

  it("reports open as soon as the control channel is ready", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const socket = createMultiplexWebSocket("wss://example.com/ws");
    const openSpy = vi.fn();
    socket.addEventListener("open", openSpy);

    const [control, bulk] = FakeWebSocket.instances;
    control?.open();
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(socket.OPEN);

    bulk?.open();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the control channel for bulk messages until the bulk socket is ready", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const socket = createMultiplexWebSocket("wss://example.com/ws");
    const [control, bulk] = FakeWebSocket.instances;
    control?.open();

    socket.send(JSON.stringify({ type: "SUBSCRIBE_CHUNKS", cx: 1, cy: 2, radius: 3 }));

    expect(control?.sent).toEqual([JSON.stringify({ type: "SUBSCRIBE_CHUNKS", cx: 1, cy: 2, radius: 3 })]);
    expect(bulk?.sent).toEqual([]);
  });

  it("replays the latest auth payload to the bulk socket when it opens later", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const socket = createMultiplexWebSocket("wss://example.com/ws");
    const [control, bulk] = FakeWebSocket.instances;
    control?.open();

    socket.send(JSON.stringify({ type: "AUTH", token: "abc" }));
    expect(control?.sent).toEqual([JSON.stringify({ type: "AUTH", token: "abc" })]);
    expect(bulk?.sent).toEqual([]);

    bulk?.open();
    expect(bulk?.sent).toEqual([JSON.stringify({ type: "AUTH", token: "abc" })]);
  });

  it("does not try to mirror-close with illegal code 1006", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const socket = createMultiplexWebSocket("wss://example.com/ws");
    const [control, bulk] = FakeWebSocket.instances;
    const controlCloseSpy = vi.spyOn(control!, "close");
    const bulkCloseSpy = vi.spyOn(bulk!, "close");

    control?.open();
    bulk?.open();
    control?.dispatchEvent(new CloseEvent("close", { code: 1006, reason: "abnormal", wasClean: false }));

    expect(controlCloseSpy).toHaveBeenCalledWith();
    expect(bulkCloseSpy).toHaveBeenCalledWith();
    expect(socket.readyState).toBe(socket.CLOSED);
  });

  it("opens a fresh pair of sockets on reconnect() and dispatches a new synthetic open", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const socket = createMultiplexWebSocket("wss://example.com/ws");
    const [firstControl, firstBulk] = FakeWebSocket.instances;
    firstControl?.open();
    firstBulk?.open();

    const openSpy = vi.fn();
    socket.addEventListener("open", openSpy);
    firstControl?.close();
    expect(socket.readyState).toBe(socket.CLOSED);

    socket.reconnect();
    expect(socket.readyState).toBe(socket.CONNECTING);
    expect(FakeWebSocket.instances).toHaveLength(4);
    const [, , secondControl, secondBulk] = FakeWebSocket.instances;
    expect(secondControl).not.toBe(firstControl);
    expect(secondBulk).not.toBe(firstBulk);

    secondControl?.open();
    expect(socket.readyState).toBe(socket.OPEN);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores a belated close from a socket generation reconnect() already superseded", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const socket = createMultiplexWebSocket("wss://example.com/ws");
    const [firstControl, firstBulk] = FakeWebSocket.instances;
    firstControl?.open();
    firstBulk?.open();
    firstControl?.close();

    socket.reconnect();
    const [, , secondControl] = FakeWebSocket.instances;
    secondControl?.open();
    expect(socket.readyState).toBe(socket.OPEN);

    const closeSpy = vi.fn();
    socket.addEventListener("close", closeSpy);
    // A belated close event from the pre-reconnect bulk socket (e.g. a
    // network stack finally reporting the old connection's teardown) must
    // not corrupt the new generation's readyState or fire a spurious close.
    firstBulk?.dispatchEvent(new CloseEvent("close", { code: 1006 }));

    expect(socket.readyState).toBe(socket.OPEN);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("routes messages through the new sockets after reconnect()", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const socket = createMultiplexWebSocket("wss://example.com/ws");
    const [firstControl, firstBulk] = FakeWebSocket.instances;
    firstControl?.open();
    firstBulk?.open();
    firstControl?.close();

    socket.reconnect();
    const [, , secondControl, secondBulk] = FakeWebSocket.instances;
    secondControl?.open();
    secondBulk?.open();

    socket.send(JSON.stringify({ type: "AUTH", token: "fresh" }));
    expect(secondControl?.sent).toEqual([JSON.stringify({ type: "AUTH", token: "fresh" })]);
    expect(firstControl?.sent).toEqual([]);
  });
});
