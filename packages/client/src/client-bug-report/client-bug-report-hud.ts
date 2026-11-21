import type { ClientState } from "../client-state/client-state.js";
import { isReportOpen, setReportOpen, reportModalHtml, bindReportModal, type ReportKind } from "./client-bug-report.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HudDom = {
  hud: HTMLElement;
};

type ReportOverlayArgs = {
  kind: ReportKind;
  state: ClientState;
  wsUrl: string;
  renderHud: () => void;
};

// ---------------------------------------------------------------------------
// Overlay rendering. The overlay is mounted on <body>, not inside #hud: the
// "Report bug" buttons on the map-loading, auth-busy and renderer-prompt
// screens open it while those full-screen overlays are up, and #hud's
// stacking context sits underneath them. Shared by the bug-report and
// suggestion overlays, which differ only in kind/DOM ids/trigger selector.
// ---------------------------------------------------------------------------

const CLOSE_TRANSITION_MS = 200;

const overlayIdFor = (kind: ReportKind): string => kind === "bug" ? "bug-report-overlay" : "suggestion-overlay";
const triggerSelectorFor = (kind: ReportKind): string => kind === "bug" ? "[data-settings-report-bug]" : "[data-settings-suggest-improvement]";

const renderReportOverlay = (args: ReportOverlayArgs): void => {
  const { kind, state, wsUrl, renderHud } = args;
  const overlayId = overlayIdFor(kind);

  let overlayEl = document.getElementById(overlayId) as HTMLDivElement | null;
  if (isReportOpen(kind)) {
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = overlayId;
      overlayEl.className = "player-report-overlay";
      document.body.appendChild(overlayEl);
    }
    // Rebuild whenever there's no live, non-closing instance. This covers a
    // reopen that lands while the previous instance's close transition (and
    // teardown) was still pending -- that old instance already had its
    // listeners torn down by close(), so it must not be reused as-is.
    if (!overlayEl.dataset.rendered || overlayEl.dataset.closing === "true") {
      overlayEl.innerHTML = reportModalHtml(kind);
      overlayEl.dataset.rendered = "true";
      delete overlayEl.dataset.closing;
      // Re-render this overlay directly on close: when opened from a
      // pre-HUD screen (auth busy) the HUD render loop may not be running.
      bindReportModal({ kind, state, wsUrl, overlayEl, onClose: () => { renderReportOverlay(args); renderHud(); } });
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

// Opens the report dialog from anywhere (settings, map-loading overlay,
// auth-busy overlay, renderer prompt). The report attaches recent client and
// server logs plus the full diagnostics bundle, which replaced the old
// "Download diagnostics" buttons.
export const openReportDialog = (args: Omit<ReportOverlayArgs, "renderHud"> & { renderHud?: () => void }): void => {
  setReportOpen(args.kind, true);
  renderReportOverlay({ ...args, renderHud: args.renderHud ?? ((): void => undefined) });
};

export const renderBugReportOverlay = (args: {
  state: ClientState;
  dom: HudDom;
  wsUrl: string;
  renderHud: () => void;
}): void => {
  const { state, dom, wsUrl, renderHud } = args;
  for (const kind of ["bug", "suggestion"] as const) {
    (dom.hud.querySelectorAll(triggerSelectorFor(kind)) as NodeListOf<HTMLButtonElement>).forEach((btn) => {
      btn.onclick = (): void => openReportDialog({ kind, state, wsUrl, renderHud });
    });
    renderReportOverlay({ kind, state, wsUrl, renderHud });
  }
};
