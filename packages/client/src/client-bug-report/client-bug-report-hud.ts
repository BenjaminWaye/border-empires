import type { ClientState } from "../client-state/client-state.js";
import { isBugReportOpen, setBugReportOpen, bugReportModalHtml, bindBugReportModal } from "./client-bug-report.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HudDom = {
  hud: HTMLElement;
};

// ---------------------------------------------------------------------------
// Overlay rendering (renders inside the HUD element, which already has the
// correct z-index and fixed positioning context).
// ---------------------------------------------------------------------------

const OVERLAY_ID = "bug-report-overlay";
const CLOSE_TRANSITION_MS = 200;

export const renderBugReportOverlay = (args: {
  state: ClientState;
  dom: HudDom;
  wsUrl: string;
  renderHud: () => void;
}): void => {
  const { state, dom, wsUrl, renderHud } = args;

  // Bind the Report Bug button in the settings panel
  const reportBugButtons = dom.hud.querySelectorAll("[data-settings-report-bug]") as NodeListOf<HTMLButtonElement>;
  reportBugButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = (): void => { setBugReportOpen(true); renderHud(); };
  });

  let overlayEl = dom.hud.querySelector<HTMLDivElement>(`#${OVERLAY_ID}`);
  if (isBugReportOpen()) {
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = OVERLAY_ID;
      dom.hud.appendChild(overlayEl);
    }
    // Rebuild whenever there's no live, non-closing instance. This covers a
    // reopen that lands while the previous instance's close transition (and
    // teardown) was still pending -- that old instance already had its
    // listeners torn down by close(), so it must not be reused as-is.
    if (!overlayEl.dataset.rendered || overlayEl.dataset.closing === "true") {
      overlayEl.innerHTML = bugReportModalHtml();
      overlayEl.dataset.rendered = "true";
      delete overlayEl.dataset.closing;
      bindBugReportModal({ state, wsUrl, overlayEl, onClose: renderHud });
      requestAnimationFrame(() => { overlayEl?.setAttribute("data-open", "true"); });
    }
  } else if (overlayEl && overlayEl.dataset.rendered && overlayEl.dataset.closing !== "true") {
    overlayEl.removeAttribute("data-open");
    overlayEl.dataset.closing = "true";
    setTimeout(() => {
      if (!isBugReportOpen() && overlayEl!.dataset.closing === "true") {
        overlayEl!.innerHTML = "";
        delete overlayEl!.dataset.rendered;
        delete overlayEl!.dataset.closing;
      }
    }, CLOSE_TRANSITION_MS);
  }
};
