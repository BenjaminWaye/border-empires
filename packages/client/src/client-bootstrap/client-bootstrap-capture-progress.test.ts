import { describe, expect, it, vi } from "vitest";
import type { ClientState } from "../client-state/client-state.js";
import { OFFLINE_COMMAND_TITLE } from "../client-offline-command-guard/client-offline-command-guard.js";
import { createRenderCaptureProgress } from "./client-bootstrap-capture-progress.js";

const makeElement = (): HTMLElement =>
  ({
    style: { display: "" },
    dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10 }),
    textContent: "",
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() }
  }) as unknown as HTMLElement;

const DOM_KEYS = [
  "captureCardEl", "captureWrapEl", "captureCancelBtn", "captureDismissBtn", "captureCloseBtn", "captureReportBugBtn",
  "captureBarEl", "captureTitleEl", "captureTimeEl", "captureTargetEl", "captureGotoBtn"
];

// Playtest 2026-11-28: a "Server updating" card raised just before the
// reconnect overlay appeared stayed stacked under it. The capture-card render
// path must hide it once the overlay is up.
describe("createRenderCaptureProgress", () => {
  it("hides a Server updating card once the reconnect overlay is showing", () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const dom: Record<string, HTMLElement> = Object.fromEntries(DOM_KEYS.map((key) => [key, makeElement()]));
    const state = {
      hasEverInitialized: true,
      connection: "disconnected",
      firstChunkAt: 1,
      disconnectedSince: now - 5_000,
      seasonPending: false,
      needsSeasonJoin: false,
      joinSeasonOverlayOpen: false,
      capture: undefined,
      tiles: new Map(),
      activeBattles: new Map(),
      captureAlert: { title: OFFLINE_COMMAND_TITLE, detail: "Reconnecting…", until: now + 10_000, tone: "warn" }
    } as unknown as ClientState;
    const render = createRenderCaptureProgress(state, dom, {
      keyFor: (x, y) => `${x},${y}`,
      formatCooldownShort: () => "0s",
      showCaptureAlert: vi.fn(),
      pushFeed: vi.fn(),
      finalizePredictedCombat: vi.fn()
    });
    dom.captureCardEl!.style.display = "grid";
    render();
    expect(state.captureAlert).toBeUndefined();
    expect(dom.captureCardEl!.style.display).toBe("none");
    vi.restoreAllMocks();
  });
});
