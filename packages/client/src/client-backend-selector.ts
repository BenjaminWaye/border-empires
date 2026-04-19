/**
 * client-backend-selector.ts
 *
 * Determines which backend (legacy monolith vs rewrite gateway) the client
 * should connect to. Priority order:
 *
 *   1. URL param  ?backend=gateway|legacy     — highest, overrides everything
 *   2. Cookie     be-backend=gateway|legacy   — per-session override
 *   3. Environment default                    — localhost → gateway, prod → legacy
 *
 * Production is always "legacy" by default until Phase 6 of the rewrite plan
 * flips the cookie for beta testers. The legacy WS URL is never changed.
 */

export type BackendChoice = "legacy" | "gateway";

const COOKIE_NAME = "be-backend";
const PARAM_NAME = "backend";

function readUrlParam(): BackendChoice | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const v = params.get(PARAM_NAME);
  if (v === "gateway" || v === "legacy") return v;
  return null;
}

function readCookie(): BackendChoice | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(";").find((c) => c.trim().startsWith(COOKIE_NAME + "="));
  if (!match) return null;
  const v = match.trim().slice(COOKIE_NAME.length + 1);
  if (v === "gateway" || v === "legacy") return v;
  return null;
}

function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0";
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
}): BackendSelection {
  const { legacyWsUrl, gatewayWsUrl } = opts;

  const fromParam = readUrlParam();
  if (fromParam !== null) {
    return {
      backend: fromParam,
      wsUrl: fromParam === "gateway" ? gatewayWsUrl : legacyWsUrl,
      source: "url-param"
    };
  }

  const fromCookie = readCookie();
  if (fromCookie !== null) {
    return {
      backend: fromCookie,
      wsUrl: fromCookie === "gateway" ? gatewayWsUrl : legacyWsUrl,
      source: "cookie"
    };
  }

  // Environment default: localhost → gateway (developer convenience);
  // anywhere else → legacy (production safety).
  const defaultBackend: BackendChoice = isLocalhost() ? "gateway" : "legacy";
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
