/**
 * client-backend-selector.ts
 *
 * Determines which backend (legacy monolith vs rewrite gateway) the client
 * should connect to. Priority order:
 *
 *   1. URL param  ?backend=gateway|legacy     — highest, overrides everything
 *   2. Staging host hard-default              — gateway (cookie ignored)
 *   3. Cookie     be-backend=gateway|legacy   — per-session override (non-staging)
 *   4. Environment default                    — localhost/staging → gateway, prod → legacy
 *
 * Production stays "legacy" by default unless explicitly overridden, while
 * localhost and staging hostnames default to gateway.
 *
 * Browser globals (window, document) are read lazily and can be overridden via
 * the `ctx` parameter for unit testing without a DOM environment.
 */

export type BackendChoice = "legacy" | "gateway";

const COOKIE_NAME = "be-backend";
const PARAM_NAME = "backend";

/** Injectable browser context — defaults to real globals when undefined. */
export interface BrowserCtx {
  /** window.location.search string, e.g. "?backend=gateway" */
  search: string;
  /** window.location.hostname, e.g. "localhost" */
  hostname: string;
  /** document.cookie string, e.g. "be-backend=gateway; other=value" */
  cookieStr: string;
}

function readUrlParam(search: string): BackendChoice | null {
  const params = new URLSearchParams(search);
  const v = params.get(PARAM_NAME);
  if (v === "gateway" || v === "legacy") return v;
  return null;
}

function readCookie(cookieStr: string): BackendChoice | null {
  const match = cookieStr.split(";").find((c) => c.trim().startsWith(COOKIE_NAME + "="));
  if (!match) return null;
  const v = match.trim().slice(COOKIE_NAME.length + 1);
  if (v === "gateway" || v === "legacy") return v;
  return null;
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function isStagingHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "staging.borderempires.com" ||
    (normalized.endsWith(".vercel.app") && normalized.includes("-staging-"))
  );
}

function readBrowserCtx(): BrowserCtx {
  if (typeof window === "undefined") {
    return { search: "", hostname: "", cookieStr: "" };
  }
  return {
    search: window.location.search,
    hostname: window.location.hostname,
    cookieStr: typeof document !== "undefined" ? document.cookie : ""
  };
}

export interface BackendSelection {
  backend: BackendChoice;
  /** The WebSocket URL to connect to. */
  wsUrl: string;
  /** How the choice was made — useful for the debug badge. */
  source: "url-param" | "cookie" | "env-default";
}

export function selectBackend(opts: {
  /** Value of VITE_WS_URL (legacy monolith). Required. */
  legacyWsUrl: string;
  /** Value of VITE_GATEWAY_WS_URL (rewrite gateway). Required. */
  gatewayWsUrl: string;
  /** Override browser globals for testing. Defaults to real window/document. */
  ctx?: BrowserCtx;
}): BackendSelection {
  const { legacyWsUrl, gatewayWsUrl } = opts;
  const { search, hostname, cookieStr } = opts.ctx ?? readBrowserCtx();

  const fromParam = readUrlParam(search);
  if (fromParam !== null) {
    return {
      backend: fromParam,
      wsUrl: fromParam === "gateway" ? gatewayWsUrl : legacyWsUrl,
      source: "url-param"
    };
  }

  if (isStagingHostname(hostname)) {
    return {
      backend: "gateway",
      wsUrl: gatewayWsUrl,
      source: "env-default"
    };
  }

  const fromCookie = readCookie(cookieStr);
  if (fromCookie !== null) {
    return {
      backend: fromCookie,
      wsUrl: fromCookie === "gateway" ? gatewayWsUrl : legacyWsUrl,
      source: "cookie"
    };
  }

  // Environment default: localhost/staging → gateway;
  // everywhere else → legacy (production safety).
  const defaultBackend: BackendChoice =
    isLocalhostHostname(hostname) || isStagingHostname(hostname) ? "gateway" : "legacy";
  return {
    backend: defaultBackend,
    wsUrl: defaultBackend === "gateway" ? gatewayWsUrl : legacyWsUrl,
    source: "env-default"
  };
}

/**
 * Writes the backend cookie so it survives page reloads.
 * Setting to null clears the cookie and reverts to env default.
 */
export function persistBackendCookie(choice: BackendChoice | null): void {
  if (typeof document === "undefined") return;
  if (choice === null) {
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/`;
  } else {
    document.cookie = `${COOKIE_NAME}=${choice}; max-age=31536000; path=/; SameSite=Lax`;
  }
}
