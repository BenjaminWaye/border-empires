// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { createInitialState } from "../client-state/client-state.js";
import { authDebugCopyPayload, authDebugHtml, authDebugSnapshot, bindAuthDebugCopyButton, type AuthDebugState } from "./client-hud-debug.js";

const buildAuthDebugState = (zoom: number): AuthDebugState => {
  const state = createInitialState();
  state.zoom = zoom;
  return state;
};

describe("authDebugSnapshot zoom reporting", () => {
  it("reports the current zoom and the min/max zoom range so an optimal mobile zoom can be tuned from settings", () => {
    const state = buildAuthDebugState(44);
    const snapshot = authDebugSnapshot(state, "wss://example.test/ws", undefined);

    expect(snapshot.zoomLabel).toBe("44");
    expect(snapshot.zoomRangeLabel).toBe(`${MIN_ZOOM}–${MAX_ZOOM}`);
  });

  it("rounds a fractional zoom (e.g. mid-pinch) to a whole number for display", () => {
    const state = buildAuthDebugState(63.7);
    const snapshot = authDebugSnapshot(state, "wss://example.test/ws", undefined);

    expect(snapshot.zoomLabel).toBe("64");
  });

  it("renders a live-updatable zoom readout element in the debug card", () => {
    const state = buildAuthDebugState(22);
    const html = authDebugHtml(authDebugSnapshot(state, "wss://example.test/ws", undefined));

    expect(html).toContain('<span data-zoom-readout>22</span>');
    expect(html).toContain(`range ${MIN_ZOOM}–${MAX_ZOOM}`);
  });

  it("includes the zoom line in the copyable debug payload", () => {
    const state = buildAuthDebugState(80);
    const snapshot = authDebugSnapshot(state, "wss://example.test/ws", undefined);
    const payload = decodeURIComponent(authDebugCopyPayload(state, snapshot));

    expect(payload).toContain(`Zoom 80 (range ${MIN_ZOOM}–${MAX_ZOOM})`);
  });
});

describe("authDebugHtml merged card", () => {
  it("renders one card with both connection-status and account debug fields, and a single Copy button", () => {
    const state = buildAuthDebugState(30);
    state.activeBackend = "gateway";
    state.bridgeDebugMode = "rewrite-gateway";
    state.bridgeDebugServerBuildSha = "deadbeef";
    const html = authDebugHtml(authDebugSnapshot(state, "wss://example.test/ws", undefined));

    // One card, one Copy button — not two separate cards each with their own.
    expect((html.match(/class="bridge-debug-status"/g) ?? []).length).toBe(1);
    expect((html.match(/data-copy-auth-debug/g) ?? []).length).toBe(1);
    expect(html).toContain("<strong>Backend</strong> gateway");
    expect(html).toContain("<strong>Bridge</strong> rewrite-gateway");
    expect(html).toContain("<strong>Server build</strong>");
    expect(html).toContain("<strong>UID</strong>");
    expect(html).toContain("<strong>Render FPS</strong>");
  });
});

describe("bindAuthDebugCopyButton", () => {
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  const mount = (state: AuthDebugState, pushFeed: ReturnType<typeof vi.fn>, onCopied: ReturnType<typeof vi.fn>) => {
    const root = document.createElement("div");
    root.innerHTML = authDebugHtml(authDebugSnapshot(state, "wss://example.test/ws", undefined));
    bindAuthDebugCopyButton(root, { state, wsUrl: "wss://example.test/ws", firebaseAuth: undefined, pushFeed, onCopied });
    return root;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies the full combined debug payload to the clipboard and reports success", async () => {
    const state = buildAuthDebugState(50);
    state.activeBackend = "gateway";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const pushFeed = vi.fn();
    const onCopied = vi.fn();
    const root = mount(state, pushFeed, onCopied);
    const button = root.querySelector<HTMLButtonElement>("[data-copy-auth-debug]")!;

    button.click();
    await flush();

    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedText = writeText.mock.calls[0]![0] as string;
    expect(copiedText).toContain("Backend gateway");
    expect(copiedText).toContain("Zoom 50");
    expect(pushFeed).toHaveBeenCalledWith("Debug info copied.", "info", "success");
    expect(onCopied).toHaveBeenCalledTimes(1);
  });

  it("reports failure (but still hands control back) when the clipboard write rejects", async () => {
    const state = buildAuthDebugState(50);
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const pushFeed = vi.fn();
    const onCopied = vi.fn();
    const root = mount(state, pushFeed, onCopied);
    const button = root.querySelector<HTMLButtonElement>("[data-copy-auth-debug]")!;

    button.click();
    await flush();

    expect(pushFeed).toHaveBeenCalledWith("Could not copy debug info.", "error", "warn");
    expect(onCopied).toHaveBeenCalledTimes(1);
  });
});
