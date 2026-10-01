// When the 3D renderer fails to start (or its WebGL context is lost
// mid-session) the app silently falls back to the 2D renderer. Silently is
// the problem: on a phone there is no console to read, so the only signal a
// player gets is "the map looks different on my iPhone than on my laptop",
// and the only signal we get is nothing at all.
//
// This is a small dismissible banner carrying the actual reason string, so a
// player on a device we can't reproduce on can read it out (or screenshot
// it), and so the reason is on screen next to the "Download Diagnostics"
// button that ships the full probe.
//
// Self-contained inline styles, matching client-global-error-guard.ts: this
// has to render even when the failure happened early enough that the HUD
// stylesheet path is not the thing to depend on.
//
// The same banner also announces a *chosen* 2D session (`?renderer=2d`, from
// the "Switch to 2D" prompt or a shared link), where nothing failed and so no
// fallback banner ever fired — see showTwoDimensionalModeNotice.

const NOTICE_ID = "be-renderer-fallback-notice";

let shown = false;

type NoticeContent = {
  readonly title: string;
  /** Already HTML-escaped. */
  readonly detail: string;
  readonly footnote?: string;
  readonly actionLabel?: string;
};

const SETTINGS_POINTER = "You can switch renderers any time in Settings → Gameplay → Map Renderer.";

const buildMarkup = (content: NoticeContent): string => `
  <div style="display:flex;align-items:flex-start;gap:10px;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:600;margin-bottom:3px;">${content.title}</div>
      <div style="font-size:11px;color:#a9b2c8;line-height:1.45;word-break:break-word;">${content.detail}</div>
      ${
        content.footnote
          ? `<div style="font-size:11px;color:#7f8aa6;line-height:1.45;margin-top:4px;">${content.footnote}</div>`
          : ""
      }
      ${
        content.actionLabel
          ? `<button id="${NOTICE_ID}-retry" type="button"
               style="margin-top:6px;padding:3px 10px;border-radius:6px;border:1px solid #4a5a86;background:#26304a;color:#e7ecf7;font-size:11px;line-height:1.4;cursor:pointer;">${content.actionLabel}</button>`
          : ""
      }
    </div>
    <button id="${NOTICE_ID}-close" type="button" aria-label="Dismiss"
      style="flex:none;padding:2px 8px;border-radius:6px;border:1px solid #3a4256;background:transparent;color:#a9b2c8;font-size:14px;line-height:1.4;cursor:pointer;">×</button>
  </div>
`;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });

export type RendererFallbackNoticeOptions = {
  /**
   * Called when the player clicks "Try 3D again". Present only for the
   * crash-loop-brake reason (see client-three-renderer-host.ts) — the other
   * failure reasons (a WebGL init throw, a mid-session context loss) are
   * per-attempt and retrying them without a page reload wouldn't help, so
   * omitting this hides the button rather than showing a retry that can't
   * work.
   */
  readonly onRetry?: () => void;
};

/** Mounts the banner. Returns false (and does nothing) if one was already shown or there is no DOM. */
const showNotice = (content: NoticeContent, onAction?: () => void): boolean => {
  if (shown) return false;
  if (typeof document === "undefined" || !document.body) return false;
  shown = true;

  const notice = document.createElement("div");
  notice.id = NOTICE_ID;
  notice.style.cssText =
    "position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top, 0px) + 10px);z-index:2147483646;" +
    "max-width:min(460px, calc(100vw - 24px));padding:10px 12px;border-radius:10px;background:#1b1f2a;border:1px solid #3a4256;" +
    "box-shadow:0 8px 28px rgba(0,0,0,0.45);font-family:system-ui,-apple-system,sans-serif;color:#e7ecf7;";
  notice.innerHTML = buildMarkup(content);
  document.body.appendChild(notice);

  document.getElementById(`${NOTICE_ID}-close`)?.addEventListener("click", () => notice.remove());
  document.getElementById(`${NOTICE_ID}-retry`)?.addEventListener("click", () => onAction?.());
  return true;
};

/**
 * Shows the fallback banner once per session. Safe to call from any failure
 * path (init throw, context loss) — repeat calls after the first are ignored,
 * so a context loss that follows a failed init doesn't stack banners.
 */
export const showRendererFallbackNotice = (reason: string, options?: RendererFallbackNoticeOptions): void => {
  showNotice(
    {
      title: "3D map unavailable — showing the 2D map",
      detail: escapeHtml(reason),
      footnote: SETTINGS_POINTER,
      ...(options?.onRetry ? { actionLabel: "Try 3D again" } : {})
    },
    options?.onRetry
  );
};

const TWO_D_NOTICE_SEEN_KEY = "be-renderer-2d-notice-seen";

// The HUD re-renders constantly and calls showTwoDimensionalModeNotice each
// time, so once the notice has been shown (or skipped as already seen) this
// short-circuits before touching sessionStorage again.
let twoDimensionalNoticeHandled = false;

const twoDimensionalNoticeSeen = (): boolean => {
  try {
    return window.sessionStorage.getItem(TWO_D_NOTICE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

const markTwoDimensionalNoticeSeen = (): void => {
  try {
    window.sessionStorage.setItem(TWO_D_NOTICE_SEEN_KEY, "1");
  } catch {
    // Storage blocked — the in-memory `shown` latch still limits it to once per load.
  }
};

/**
 * Announces that the player is on the 2D map by choice (`?renderer=2d`) and
 * how to get back to 3D. Once per tab session, so a reload doesn't nag a
 * player who picked 2D on purpose; dismissing it still leaves the Settings
 * field as the way back.
 */
export const showTwoDimensionalModeNotice = (options: { readonly onSwitchTo3D: () => void }): void => {
  if (twoDimensionalNoticeHandled || typeof window === "undefined") return;
  if (twoDimensionalNoticeSeen()) {
    twoDimensionalNoticeHandled = true;
    return;
  }
  const mounted = showNotice(
    {
      title: "You're playing on the 2D map",
      detail: "The 3D map is the default on most devices.",
      footnote: SETTINGS_POINTER,
      actionLabel: "Switch to 3D map"
    },
    options.onSwitchTo3D
  );
  if (!mounted) return;
  twoDimensionalNoticeHandled = true;
  markTwoDimensionalNoticeSeen();
};

/** Test-only: clears the once-per-session latch. */
export const resetRendererFallbackNotice = (): void => {
  shown = false;
  twoDimensionalNoticeHandled = false;
};
