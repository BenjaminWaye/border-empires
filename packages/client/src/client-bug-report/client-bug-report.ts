import { snapshotClientDebugEvents } from "../client-debug/client-debug.js";
import { snapshotPerformanceMetrics, initPerformanceMetrics } from "../client-performance-metrics/client-performance-metrics.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { serverHttpOriginFromWsUrl, withTimeout, type JsonFetchResult } from "../client-debug-bundle/client-debug-bundle.js";
import type { ClientState } from "../client-state/client-state.js";

// ---------------------------------------------------------------------------
// Report kinds -- bug reports and improvement suggestions share the same
// payload shape, modal, and submission flow. Only copy/endpoint/styling
// differ, so they're driven by this config rather than duplicated.
// ---------------------------------------------------------------------------

export type ReportKind = "bug" | "suggestion";

type ReportKindConfig = {
  endpoint: string;
  title: string;
  icon: string;
  hint: string;
  placeholder: string;
  submitLabel: string;
  submittingLabel: string;
  modalModifierClass: string;
};

const REPORT_KIND_CONFIG: Record<ReportKind, ReportKindConfig> = {
  bug: {
    endpoint: "/api/bug-reports",
    title: "Report a Bug",
    icon: "🐞",
    hint: "Describe what went wrong. Recent client and server logs are attached automatically.",
    placeholder: "What happened? What did you expect?",
    submitLabel: "Submit Report",
    submittingLabel: "Submitting…",
    modalModifierClass: ""
  },
  suggestion: {
    endpoint: "/api/suggestions",
    title: "Suggest an Improvement",
    icon: "💡",
    hint: "Share an idea to make the game better. Recent client and server logs are attached automatically.",
    placeholder: "What would you like to see added or improved?",
    submitLabel: "Submit Suggestion",
    submittingLabel: "Submitting…",
    modalModifierClass: "suggestion-modal"
  }
};

// ---------------------------------------------------------------------------
// Module-level open state (one flag per kind)
// ---------------------------------------------------------------------------

const openState: Record<ReportKind, boolean> = { bug: false, suggestion: false };
export const isReportOpen = (kind: ReportKind): boolean => openState[kind];
export const setReportOpen = (kind: ReportKind, open: boolean): void => { openState[kind] = open; };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportMetadata = {
  generatedAt: string;
  pageUrl: string;
  userAgent: string;
  wsUrl: string;
  serverOrigin: string;
  renderer: "true-3d" | "2d-canvas";
};

type ReportClientContext = {
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

export type ReportPayload = {
  metadata: ReportMetadata;
  description: string;
  clientContext: ReportClientContext;
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

const buildClientContext = (state: ClientState): ReportClientContext => ({
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

const buildMetadata = (wsUrl: string): ReportMetadata => ({
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

export const buildReportPayload = async (args: {
  state: ClientState;
  wsUrl: string;
  description: string;
}): Promise<ReportPayload> => {
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

export const submitReport = async (args: {
  kind: ReportKind;
  payload: ReportPayload;
  wsUrl: string;
}): Promise<{ ok: boolean; error?: string }> => {
  const serverOrigin = serverHttpOriginFromWsUrl(args.wsUrl);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${serverOrigin}${REPORT_KIND_CONFIG[args.kind].endpoint}`, {
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

export const reportModalHtml = (kind: ReportKind): string => {
  const cfg = REPORT_KIND_CONFIG[kind];
  return `
  <div class="bug-report-backdrop" data-bug-report-backdrop></div>
  <div class="bug-report-modal ${cfg.modalModifierClass}" role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
    <div class="bug-report-modal-scroll">
      <div class="bug-report-header">
        <div class="bug-report-heading">
          <div class="bug-report-icon" aria-hidden="true">${cfg.icon}</div>
          <h3 id="bug-report-title">${cfg.title}</h3>
        </div>
        <button type="button" class="bug-report-close-btn" data-bug-report-cancel aria-label="Close">&times;</button>
      </div>
      <p class="bug-report-hint">${cfg.hint}</p>
      <textarea
        class="bug-report-textarea"
        data-bug-report-description
        placeholder="${cfg.placeholder}"
        maxlength="${MAX_DESCRIPTION_LENGTH}"
        rows="4"
        autofocus
      ></textarea>
      <div class="bug-report-char-count"><span data-bug-report-char-count>0</span>/${MAX_DESCRIPTION_LENGTH}</div>
      <div class="bug-report-actions">
        <button type="button" class="panel-btn" data-bug-report-cancel>Cancel</button>
        <button type="button" class="panel-btn bug-report-submit-btn" data-bug-report-submit>${cfg.submitLabel}</button>
      </div>
      <div class="bug-report-status" data-bug-report-status></div>
    </div>
  </div>
`;
};

// ---------------------------------------------------------------------------
// Modal bindings
// ---------------------------------------------------------------------------

export const bindReportModal = (args: {
  kind: ReportKind;
  state: ClientState;
  wsUrl: string;
  overlayEl: HTMLElement;
  onClose: () => void;
}): void => {
  const { kind, state, wsUrl, overlayEl, onClose } = args;
  const cfg = REPORT_KIND_CONFIG[kind];
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

  type StatusKind = "busy" | "success" | "error" | "";

  const setStatus = (message: string, statusKind: StatusKind = ""): void => {
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `bug-report-status${statusKind ? ` bug-report-status-${statusKind}` : ""}`;
    }
  };

  const close = (): void => {
    setReportOpen(kind, false);
    document.removeEventListener("keydown", onKeydown);
    onClose();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeydown);

  if (backdrop) backdrop.addEventListener("click", close);
  if (cancelBtn) cancelBtn.addEventListener("click", close);

  textarea?.focus();

  if (submitBtn && textarea) {
    submitBtn.addEventListener("click", async () => {
      const description = textarea.value.trim();
      if (description.length === 0) {
        setStatus(kind === "bug" ? "Please describe the bug." : "Please describe your suggestion.", "error");
        textarea.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = cfg.submittingLabel;
      setStatus("Gathering logs…", "busy");

      try {
        const payload = await buildReportPayload({ state, wsUrl, description });
        setStatus("Sending…", "busy");
        const result = await submitReport({ kind, payload, wsUrl });
        if (result.ok) {
          setStatus(kind === "bug" ? "Report submitted. Thank you!" : "Suggestion submitted. Thank you!", "success");
          setTimeout(close, 1_200);
        } else {
          setStatus(`Failed: ${result.error ?? "unknown error"}`, "error");
          submitBtn.disabled = false;
          submitBtn.textContent = cfg.submitLabel;
        }
      } catch (error) {
        setStatus(`Failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
        submitBtn.disabled = false;
        submitBtn.textContent = cfg.submitLabel;
      }
    });
  }
};
