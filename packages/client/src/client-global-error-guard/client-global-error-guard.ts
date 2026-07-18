// Catches uncaught exceptions and unhandled promise rejections that occur
// before (or outside of) the app's own error handling boundaries. Without
// this, a synchronous throw during early module init (e.g. a WebSocket
// constructor failing, or a storage API throwing in a locked-down browser
// context) produces a silent white screen with zero diagnostics.
//
// This is purely additive: on a normal, error-free boot (the common case
// for desktop Chrome) neither handler ever fires and nothing is rendered
// or altered. It only changes behavior for sessions that would otherwise
// have crashed with no feedback at all.

const OVERLAY_ID = "be-global-error-overlay";

let overlayShown = false;

const buildOverlayMarkup = (detail: string): string => `
  <div style="max-width:420px;padding:24px 28px;border-radius:12px;background:#1b1f2a;border:1px solid #3a4256;box-shadow:0 12px 40px rgba(0,0,0,0.5);font-family:system-ui,-apple-system,sans-serif;color:#e7ecf7;text-align:center;">
    <div style="font-size:18px;font-weight:600;margin-bottom:8px;">Border Empires hit a problem loading</div>
    <div style="font-size:13px;color:#a9b2c8;margin-bottom:16px;line-height:1.5;">Something went wrong while starting the app. This can happen on some browser privacy modes or unstable connections.</div>
    <button id="be-global-error-reload" style="padding:10px 20px;border-radius:8px;border:none;background:#5b8def;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Reload</button>
    <div style="margin-top:14px;font-size:11px;color:#5c6580;word-break:break-word;">${detail}</div>
  </div>
`;

const showFatalOverlay = (detail: string): void => {
  if (overlayShown) return;
  if (typeof document === "undefined") return;
  overlayShown = true;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(8,10,16,0.92);padding:16px;";
  overlay.innerHTML = buildOverlayMarkup(detail);
  document.body.appendChild(overlay);

  const reloadBtn = document.getElementById("be-global-error-reload");
  reloadBtn?.addEventListener("click", () => window.location.reload());
};

const describeError = (value: unknown): string => {
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "unknown error";
  } catch {
    return "unknown error";
  }
};

export const installGlobalErrorGuard = (): void => {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    showFatalOverlay(describeError(event.error ?? event.message));
  });

  window.addEventListener("unhandledrejection", (event) => {
    showFatalOverlay(describeError(event.reason));
  });
};

// Self-installs on import so this only needs to be the first static import
// in the entrypoint module — ES module evaluation order guarantees this
// module (and therefore the listeners below) finishes running before any
// subsequently-imported module's top-level code executes.
installGlobalErrorGuard();
