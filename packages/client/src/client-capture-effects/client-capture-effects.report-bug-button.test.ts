import { afterEach, describe, expect, it, vi } from "vitest";
import { showCaptureAlert, showCaptureTimeoutAlert } from "../client-alerts/client-alerts.js";
import type { ClientState } from "../client-state/client-state.js";
import { renderCaptureProgress } from "./client-capture-effects.js";

// The capture popup's "Report bug" button (formerly "Download debug log")
// must only appear on timeout alerts -- ordinary warnings/errors such as
// "Insufficient coin" or "Action blocked" are expected outcomes and used to
// show the debug-download button too.
const makeElement = (): HTMLElement =>
  ({
    style: { display: "" },
    dataset: {},
    textContent: "",
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() }
  } as unknown as HTMLElement);

const renderWithAlert = (captureAlert: ClientState["captureAlert"]): HTMLElement => {
  const captureReportBugBtn = makeElement();
  renderCaptureProgress(
    { captureAlert, activeBattles: new Map(), capture: undefined, tiles: new Map(), pendingCombatReveal: undefined, dismissedCaptureStartAt: undefined } as unknown as Parameters<typeof renderCaptureProgress>[0],
    {
      keyFor: (x: number, y: number) => `${x},${y}`,
      formatCooldownShort: () => "0s",
      showCaptureAlert: vi.fn(),
      pushFeed: vi.fn(),
      finalizePredictedCombat: vi.fn(),
      captureCardEl: makeElement(),
      captureWrapEl: makeElement(),
      captureCancelBtn: makeElement(),
      captureDismissBtn: makeElement(),
      captureCloseBtn: makeElement(),
      captureReportBugBtn,
      captureBarEl: makeElement(),
      captureTitleEl: makeElement(),
      captureTimeEl: makeElement(),
      captureTargetEl: makeElement(),
      captureGotoBtn: makeElement() as unknown as HTMLButtonElement
    }
  );
  return captureReportBugBtn;
};

describe("renderCaptureProgress report-bug button", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the button for ordinary warning and error alerts", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    for (const tone of ["warn", "error"] as const) {
      const state: Pick<ClientState, "captureAlert"> = { captureAlert: undefined };
      showCaptureAlert(state, "Action blocked", "No expansion path to that tile.", tone);
      expect(renderWithAlert(state.captureAlert).style.display).toBe("none");
    }
  });

  it("shows the button for timeout alerts", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const state: Pick<ClientState, "captureAlert"> = { captureAlert: undefined };
    showCaptureTimeoutAlert(state, "Combat result delayed", "The server result did not arrive in time.");
    expect(state.captureAlert?.tone).toBe("warn");
    expect(renderWithAlert(state.captureAlert).style.display).toBe("inline-flex");
  });
});
