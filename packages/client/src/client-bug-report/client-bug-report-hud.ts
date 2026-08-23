import type { ClientState } from "../client-state/client-state.js";
import { isReportOpen, setReportOpen, reportModalHtml, bindReportModal, type ReportKind } from "./client-bug-report.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HudDom = {
  hud: HTMLElement;
};

// ---------------------------------------------------------------------------
// Overlay rendering (renders inside the HUD element, which already has the
// correct z-index and fixed positioning context). Shared by the bug-report
// and suggestion overlays, which differ only in kind/DOM ids/trigger selector.
// ---------------------------------------------------------------------------

const CLOSE_TRANSITION_MS = 200;

const overlayIdFor = (kind: ReportKind): string => kind === "bug" ? "bug-report-overlay" : "suggestion-overlay";
const triggerSelectorFor = (kind: ReportKind): string => kind === "bug" ? "[data-settings-report-bug]" : "[data-settings-suggest-improvement]";

const renderReportOverlay = (args: {
  kind: ReportKind;
  state: ClientState;
  dom: HudDom;
  wsUrl: string;
  renderHud: () => void;
}): void => {
  const { kind, state, dom, wsUrl, renderHud } = args;
  const overlayId = overlayIdFor(kind);

  const triggerButtons = dom.hud.querySelectorAll(triggerSelectorFor(kind)) as NodeListOf<HTMLButtonElement>;
  triggerButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = (): void => { setReportOpen(kind, true); renderHud(); };
  });

  let overlayEl = dom.hud.querySelector<HTMLDivElement>(`#${overlayId}`);
  if (isReportOpen(kind)) {
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = overlayId;
      dom.hud.appendChild(overlayEl);
    }
    // Rebuild whenever there's no live, non-closing instance. This covers a
    // reopen that lands while the previous instance's close transition (and
    // teardown) was still pending -- that old instance already had its
    // listeners torn down by close(), so it must not be reused as-is.
    if (!overlayEl.dataset.rendered || overlayEl.dataset.closing === "true") {
      overlayEl.innerHTML = reportModalHtml(kind);
      overlayEl.dataset.rendered = "true";
      delete overlayEl.dataset.closing;
      bindReportModal({ kind, state, wsUrl, overlayEl, onClose: renderHud });
      requestAnimationFrame(() => { overlayEl?.setAttribute("data-open", "true"); });
    }
  } else if (overlayEl && overlayEl.dataset.rendered && overlayEl.dataset.closing !== "true") {
    overlayEl.removeAttribute("data-open");
    overlayEl.dataset.closing = "true";
    setTimeout(() => {
      if (!isReportOpen(kind) && overlayEl!.dataset.closing === "true") {
        overlayEl!.innerHTML = "";
        delete overlayEl!.dataset.rendered;
        delete overlayEl!.dataset.closing;
      }
    }, CLOSE_TRANSITION_MS);
  }
};

export const renderBugReportOverlay = (args: {
  state: ClientState;
  dom: HudDom;
  wsUrl: string;
  renderHud: () => void;
}): void => {
  renderReportOverlay({ kind: "bug", ...args });
  renderReportOverlay({ kind: "suggestion", ...args });
};
