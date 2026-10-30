import { afterEach, describe, expect, it, vi } from "vitest";
import { isReportOpen, setReportOpen } from "../client-bug-report/client-bug-report.js";
import type { ClientState } from "../client-state/client-state.js";
import { openBugReportFromCaptureAlert } from "./client-capture-report-bug.js";

describe("openBugReportFromCaptureAlert", () => {
  afterEach(() => {
    setReportOpen("bug", false);
  });

  it("dismisses the timeout alert and opens the bug report modal", () => {
    const state: Pick<ClientState, "captureAlert"> = {
      captureAlert: { title: "Combat result delayed", detail: "", until: Number.MAX_SAFE_INTEGER, tone: "warn", timeout: true }
    };
    const renderCaptureProgress = vi.fn();
    const renderHud = vi.fn();

    openBugReportFromCaptureAlert(state, { renderCaptureProgress, renderHud });

    expect(state.captureAlert).toBeUndefined();
    expect(renderCaptureProgress).toHaveBeenCalledTimes(1);
    expect(isReportOpen("bug")).toBe(true);
    expect(renderHud).toHaveBeenCalledTimes(1);
  });
});
