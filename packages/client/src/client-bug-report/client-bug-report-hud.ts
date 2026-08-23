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
    if (!overlayEl.innerHTML) {
      overlayEl.innerHTML = bugReportModalHtml();
      bindBugReportModal({ state, wsUrl, overlayEl, onClose: renderHud });
      requestAnimationFrame(() => { overlayEl?.setAttribute("data-open", "true"); });
    }
  } else if (overlayEl && overlayEl.innerHTML) {
    overlayEl.removeAttribute("data-open");
    setTimeout(() => {
      if (!isBugReportOpen()) overlayEl!.innerHTML = "";
    }, CLOSE_TRANSITION_MS);
  }
};
