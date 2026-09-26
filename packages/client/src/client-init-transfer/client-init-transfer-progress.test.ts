import { describe, expect, it } from "vitest";
import type { InitTransferProgress, RealtimeSocket, RealtimeSocketEventMap } from "../client-socket-types.js";
import { bindInitTransferProgress } from "./client-init-transfer-progress.js";

// Regression: an in-place reconnect never dispatches "close", so a finished
// transfer used to linger in state and flash "Building your map..." at 100%
// during the next login.

const createSocket = () => {
  const target = new EventTarget();
  const socket = {
    addEventListener: <K extends keyof RealtimeSocketEventMap>(type: K, listener: (event: RealtimeSocketEventMap[K]) => void) =>
      target.addEventListener(type, listener as EventListener),
    removeEventListener: () => {}
  } as unknown as RealtimeSocket;
  return { socket, target };
};

const progress = (phase: InitTransferProgress["phase"]): InitTransferProgress => ({
  phase,
  receivedChars: 10,
  totalChars: 10,
  startedAt: 0,
  firstFrameChars: 5
});

describe("bindInitTransferProgress", () => {
  it("mirrors progress into state and re-renders", () => {
    const { socket, target } = createSocket();
    const state = { authSessionReady: false, initTransfer: null as InitTransferProgress | null };
    let renders = 0;
    bindInitTransferProgress(socket, state, () => (renders += 1));
    target.dispatchEvent(new CustomEvent("initprogress", { detail: progress("downloading") }));
    expect(state.initTransfer?.phase).toBe("downloading");
    expect(renders).toBe(1);
  });

  it("clears a finished transfer when the INIT message is delivered", () => {
    const { socket, target } = createSocket();
    const state = { authSessionReady: false, initTransfer: null as InitTransferProgress | null };
    bindInitTransferProgress(socket, state, () => {});
    target.dispatchEvent(new CustomEvent("initprogress", { detail: progress("downloading") }));
    target.dispatchEvent(new MessageEvent("message", { data: "{}" }));
    expect(state.initTransfer?.phase).toBe("downloading");
    target.dispatchEvent(new CustomEvent("initprogress", { detail: progress("building") }));
    target.dispatchEvent(new MessageEvent("message", { data: '{"type":"INIT"}' }));
    expect(state.initTransfer).toBeNull();
  });

  it("clears stale progress when a new connection opens", () => {
    const { socket, target } = createSocket();
    const state = { authSessionReady: false, initTransfer: progress("downloading") as InitTransferProgress | null };
    bindInitTransferProgress(socket, state, () => {});
    target.dispatchEvent(new Event("open"));
    expect(state.initTransfer).toBeNull();
  });
});
