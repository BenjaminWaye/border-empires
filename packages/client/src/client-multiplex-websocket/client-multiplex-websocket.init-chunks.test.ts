import { encodeInitChunkFrames } from "@border-empires/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InitTransferProgress } from "../client-socket-types.js";
import { createMultiplexWebSocket } from "./client-multiplex-websocket.js";

// Regression: the login overlay used to sit on "Packaging your session for
// delivery. (2s elapsed)" for 10s+ on phones because the INIT arrived as one
// huge frame with no progress. The gateway now chunks it; the multiplex socket
// must reassemble it, report progress, and still deliver INIT before anything
// that arrived after it.

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
  readyState = FakeWebSocket.CONNECTING;

  constructor(readonly url: string) {
    super();
    FakeWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code: 1006 }));
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(data: string): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

const initPayload = JSON.stringify({ type: "INIT", padding: "x".repeat(5000) });

describe("client-multiplex-websocket chunked INIT", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    FakeWebSocket.instances = [];
    vi.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
  });

  const setup = () => {
    const socket = createMultiplexWebSocket("wss://example.com/ws");
    const [control] = FakeWebSocket.instances;
    if (!control) throw new Error("control socket missing");
    control.open();
    const messages: string[] = [];
    const progress: InitTransferProgress[] = [];
    const events: string[] = [];
    socket.addEventListener("message", (event) => {
      messages.push(event.data);
      events.push(`message:${(JSON.parse(event.data) as { type: string }).type}`);
    });
    socket.addEventListener("initprogress", (event) => progress.push(event.detail));
    socket.addEventListener("close", () => events.push("close"));
    return { socket, control, messages, progress, events };
  };

  it("reports download progress per chunk and delivers the reassembled INIT after a paint yield", () => {
    const { control, messages, progress } = setup();
    const frames = encodeInitChunkFrames(initPayload, 1000);

    for (const frame of frames) control.receive(frame);

    expect(progress.map((entry) => entry.phase)).toEqual([...frames.slice(1).map(() => "downloading"), "building"]);
    expect(progress[0]).toMatchObject({ phase: "downloading", receivedChars: 1000, totalChars: initPayload.length, firstFrameChars: 1000 });
    expect(progress.at(-1)).toMatchObject({ phase: "building", receivedChars: initPayload.length, totalChars: initPayload.length });
    expect(messages).toEqual([]);

    vi.runAllTimers();
    expect(messages).toEqual([initPayload]);
  });

  it("holds messages that arrive after the INIT until the INIT has been delivered", () => {
    const { control, messages } = setup();
    for (const frame of encodeInitChunkFrames(initPayload, 1000)) control.receive(frame);
    const followUp = JSON.stringify({ type: "TILE_DELTA_BATCH" });
    control.receive(followUp);

    expect(messages).toEqual([]);
    vi.runAllTimers();
    expect(messages).toEqual([initPayload, followUp]);
  });

  it("delivers a pending INIT before a close that arrived after it", () => {
    const { control, events } = setup();
    for (const frame of encodeInitChunkFrames(initPayload, 1000)) control.receive(frame);
    control.close();

    expect(events).toEqual(["message:INIT", "close"]);
    vi.runAllTimers();
    expect(events).toEqual(["message:INIT", "close"]);
  });

  it("passes ordinary JSON messages straight through", () => {
    const { control, messages, progress } = setup();
    const loginPhase = JSON.stringify({ type: "LOGIN_PHASE", title: "Finishing up...", detail: "Packaging your session for delivery." });
    control.receive(loginPhase);
    expect(messages).toEqual([loginPhase]);
    expect(progress).toEqual([]);
  });
});
