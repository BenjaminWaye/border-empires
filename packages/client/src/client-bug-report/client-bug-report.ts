import { snapshotClientDebugEvents } from "../client-debug/client-debug.js";
import { snapshotPerformanceMetrics, initPerformanceMetrics } from "../client-performance-metrics/client-performance-metrics.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { serverHttpOriginFromWsUrl, withTimeout, type JsonFetchResult } from "../client-debug-bundle/client-debug-bundle.js";
import type { ClientState } from "../client-state/client-state.js";

// ---------------------------------------------------------------------------
// Module-level bug report open state
// ---------------------------------------------------------------------------

let bugReportOpen = false;
export const isBugReportOpen = (): boolean => bugReportOpen;
export const setBugReportOpen = (open: boolean): void => { bugReportOpen = open; };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BugReportMetadata = {
  generatedAt: string;
  pageUrl: string;
  userAgent: string;
  wsUrl: string;
  serverOrigin: string;
  renderer: "true-3d" | "2d-canvas";
};

type BugReportClientContext = {
  connection: ClientState["connection"];
  authSessionReady: boolean;
  me: string;
  meName: string;
  selected: { x: number; y: number } | undefined;
  bridgeDebugMode: string;
  bridgeDebugSeasonId: string;
  bridgeDebugRuntimeFingerprint: string;
  bridgeDebugServerBuildSha: string;
};

export type BugReportPayload = {
  metadata: BugReportMetadata;
  description: string;
  clientContext: BugReportClientContext;
  clientEvents: ReturnType<typeof snapshotClientDebugEvents>;
  performanceMetrics: ReturnType<typeof snapshotPerformanceMetrics>;
  serverBundle: JsonFetchResult;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLIENT_EVENT_LIMIT = 100;
const MAX_DESCRIPTION_LENGTH = 1_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildClientContext = (state: ClientState): BugReportClientContext => ({
  connection: state.connection,
  authSessionReady: state.authSessionReady,
  me: state.me,
  meName: state.meName,
  selected: state.selected,
  bridgeDebugMode: state.bridgeDebugMode,
  bridgeDebugSeasonId: state.bridgeDebugSeasonId,
  bridgeDebugRuntimeFingerprint: state.bridgeDebugRuntimeFingerprint,
  bridgeDebugServerBuildSha: state.bridgeDebugServerBuildSha
});

const buildMetadata = (wsUrl: string): BugReportMetadata => ({
  generatedAt: new Date().toISOString(),
  pageUrl: typeof window !== "undefined" ? window.location.href : "",
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  wsUrl,
  serverOrigin: serverHttpOriginFromWsUrl(wsUrl),
  renderer: isTrue3DRendererActive() ? "true-3d" : "2d-canvas"
});

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

export const buildBugReportPayload = async (args: {
  state: ClientState;
  wsUrl: string;
  description: string;
}): Promise<BugReportPayload> => {
  initPerformanceMetrics();
  const serverOrigin = serverHttpOriginFromWsUrl(args.wsUrl);
  const serverBundle = await withTimeout(`${serverOrigin}/admin/runtime/debug-bundle`);
  return {
    metadata: buildMetadata(args.wsUrl),
    description: args.description.slice(0, MAX_DESCRIPTION_LENGTH),
    clientContext: buildClientContext(args.state),
    clientEvents: snapshotClientDebugEvents(CLIENT_EVENT_LIMIT),
    performanceMetrics: snapshotPerformanceMetrics(),
    serverBundle
  };
};

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export const submitBugReport = async (args: {
  payload: BugReportPayload;
  wsUrl: string;
}): Promise<{ ok: boolean; error?: string }> => {
  const serverOrigin = serverHttpOriginFromWsUrl(args.wsUrl);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${serverOrigin}/api/bug-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.json().catch(() => undefined);
      const message = typeof (body as { error?: unknown } | undefined)?.error === "string"
        ? (body as { error: string }).error
        : `HTTP ${response.status}`;
      return { ok: false, error: message };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

// ---------------------------------------------------------------------------
// Modal HTML
// ---------------------------------------------------------------------------

export const bugReportModalHtml = (): string => `
  <div class="bug-report-backdrop" data-bug-report-backdrop></div>
  <div class="bug-report-modal card" role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
    <div class="bug-report-modal-scroll">
      <h3 id="bug-report-title">Report a Bug</h3>
      <p class="bug-report-hint">Describe what went wrong. Recent client and server logs are attached automatically.</p>
      <textarea
        class="bug-report-textarea"
        data-bug-report-description
        placeholder="What happened? What did you expect?"
        maxlength="${MAX_DESCRIPTION_LENGTH}"
        rows="4"
      ></textarea>
      <div class="bug-report-char-count"><span data-bug-report-char-count>0</span>/${MAX_DESCRIPTION_LENGTH}</div>
      <div class="bug-report-actions">
        <button type="button" class="panel-btn" data-bug-report-cancel>Cancel</button>
        <button type="button" class="panel-btn bug-report-submit-btn" data-bug-report-submit>Submit Report</button>
      </div>
      <div class="bug-report-status" data-bug-report-status></div>
    </div>
  </div>
`;

// ---------------------------------------------------------------------------
// Modal bindings
// ---------------------------------------------------------------------------

export const bindBugReportModal = (args: {
  state: ClientState;
  wsUrl: string;
  overlayEl: HTMLElement;
  onClose: () => void;
}): void => {
  const { state, wsUrl, overlayEl, onClose } = args;
  const textarea = overlayEl.querySelector<HTMLTextAreaElement>("[data-bug-report-description]");
  const charCount = overlayEl.querySelector<HTMLSpanElement>("[data-bug-report-char-count]");
  const submitBtn = overlayEl.querySelector<HTMLButtonElement>("[data-bug-report-submit]");
  const cancelBtn = overlayEl.querySelector<HTMLButtonElement>("[data-bug-report-cancel]");
  const backdrop = overlayEl.querySelector<HTMLDivElement>("[data-bug-report-backdrop]");
  const statusEl = overlayEl.querySelector<HTMLDivElement>("[data-bug-report-status]");

  if (textarea && charCount) {
    textarea.addEventListener("input", () => {
      charCount.textContent = String(textarea.value.length);
    });
  }

  const setStatus = (message: string, isError = false): void => {
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `bug-report-status${isError ? " bug-report-status-error" : ""}`;
    }
  };

  const close = (): void => {
    setBugReportOpen(false);
    overlayEl.innerHTML = "";
    onClose();
  };

  if (backdrop) backdrop.addEventListener("click", close);
  if (cancelBtn) cancelBtn.addEventListener("click", close);

  if (submitBtn && textarea) {
    submitBtn.addEventListener("click", async () => {
      const description = textarea.value.trim();
      if (description.length === 0) {
        setStatus("Please describe the bug.", true);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
      setStatus("Gathering logs…");

      try {
        const payload = await buildBugReportPayload({ state, wsUrl, description });
        setStatus("Sending report…");
        const result = await submitBugReport({ payload, wsUrl });
        if (result.ok) {
          setStatus("Report submitted. Thank you!");
          setTimeout(close, 1_500);
        } else {
          setStatus(`Failed: ${result.error ?? "unknown error"}`, true);
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Report";
        }
      } catch (error) {
        setStatus(`Failed: ${error instanceof Error ? error.message : "unknown error"}`, true);
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Report";
      }
    });
  }
};
