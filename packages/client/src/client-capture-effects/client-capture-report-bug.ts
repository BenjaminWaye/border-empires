import { setReportOpen } from "../client-bug-report/client-bug-report.js";
import type { ClientState } from "../client-state/client-state.js";

// Click handler for the capture popup's "Report bug" button (only shown on
// timeout alerts, see renderCaptureProgress). Dismisses the alert so the card
// doesn't stay clickable beside/over the modal, then opens the bug report,
// which attaches recent client/server logs automatically.
export const openBugReportFromCaptureAlert = (
  state: Pick<ClientState, "captureAlert">,
  deps: { renderCaptureProgress: () => void; renderHud: () => void }
): void => {
  state.captureAlert = undefined;
  deps.renderCaptureProgress();
  setReportOpen("bug", true);
  deps.renderHud();
};
