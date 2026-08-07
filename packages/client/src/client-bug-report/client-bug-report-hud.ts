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
      overlayEl.style.cssText = "display:grid;position:fixed;inset:0;z-index:9000;place-items:center;";
      dom.hud.appendChild(overlayEl);
    }
    overlayEl.style.display = "grid";
    if (!overlayEl.innerHTML) {
      overlayEl.innerHTML = bugReportModalHtml();
      bindBugReportModal({ state, wsUrl, overlayEl, onClose: renderHud });
    }
  } else if (overlayEl) {
    overlayEl.style.display = "none";
    overlayEl.innerHTML = "";
  }
};
