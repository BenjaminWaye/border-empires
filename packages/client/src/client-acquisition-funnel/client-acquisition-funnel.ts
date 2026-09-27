// Anonymous pre-login funnel for /admin/players/insights:
//
//   visit -> auth_form_shown -> auth_method_clicked -> sign_up
//
// Each step is sent once per browser (a random visitor id in localStorage;
// the gateway also dedupes per visitor + step) to POST /api/funnel via
// navigator.sendBeacon. Browsers that have ever held a signed-in Firebase
// session are existing players and are skipped, except for sign_up.
// auth_form_shown / auth_method_clicked are mirrored to GA as well.
//
// Deliberately self-contained: it registers its own onAuthStateChanged
// listener and button listeners instead of threading hooks through
// client-auth-flow.ts. Best-effort throughout — nothing here may throw into,
// or delay, sign-in.
import { logEvent, type Analytics } from "firebase/analytics";
import { onAuthStateChanged, type Auth } from "firebase/auth";

import { readAcquisitionParams } from "../client-auth-flow/client-auth-flow-acquisition.js";
import { serverHttpOriginFromWsUrl } from "../client-debug-bundle/client-debug-bundle.js";

export type AcquisitionStep = "visit" | "auth_form_shown" | "auth_method_clicked" | "sign_up";
export type AcquisitionDetail = { method?: string; referrerHost?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string };

export const VISITOR_ID_STORAGE_KEY = "be:funnel-visitor-id";
export const KNOWN_PLAYER_STORAGE_KEY = "be:funnel-known-player";
const FIREBASE_USER_KEY_PREFIX = "firebase:authUser:";

export type AcquisitionFunnelEnv = {
  storage: Pick<Storage, "getItem" | "setItem" | "length" | "key"> | undefined;
  sendBeacon: (url: string, body: string) => void;
  randomId: () => string;
  locationHost: string;
};

export type AcquisitionFunnel = {
  report: (step: AcquisitionStep, detail?: AcquisitionDetail) => void;
  markKnownPlayer: () => void;
  isKnownPlayer: () => boolean;
};

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const hasPersistedFirebaseUser = (storage: AcquisitionFunnelEnv["storage"]): boolean =>
  safe(() => {
    if (!storage) return false;
    for (let i = 0; i < storage.length; i += 1) if (storage.key(i)?.startsWith(FIREBASE_USER_KEY_PREFIX)) return true;
    return false;
  }, false);

export const createAcquisitionFunnel = (endpoint: string, env: AcquisitionFunnelEnv): AcquisitionFunnel => {
  const sentThisPage = new Set<AcquisitionStep>();
  let ephemeralVisitorId: string | undefined;
  const visitorId = (): string => {
    const stored = safe(() => env.storage?.getItem(VISITOR_ID_STORAGE_KEY) ?? null, null);
    if (stored) return stored;
    const fresh = ephemeralVisitorId ?? env.randomId();
    ephemeralVisitorId = fresh;
    safe(() => env.storage?.setItem(VISITOR_ID_STORAGE_KEY, fresh), undefined);
    return fresh;
  };
  const isKnownPlayer = (): boolean =>
    safe(() => env.storage?.getItem(KNOWN_PLAYER_STORAGE_KEY) === "1", false) || hasPersistedFirebaseUser(env.storage);

  return {
    report: (step, detail = {}) => {
      if (sentThisPage.has(step)) return;
      if (step !== "sign_up" && isKnownPlayer()) return;
      sentThisPage.add(step);
      safe(() => env.sendBeacon(endpoint, JSON.stringify({ visitorId: visitorId(), step, detail })), undefined);
    },
    markKnownPlayer: () => safe(() => env.storage?.setItem(KNOWN_PLAYER_STORAGE_KEY, "1"), undefined),
    isKnownPlayer
  };
};

export const visitDetail = (locationHost: string): AcquisitionDetail => {
  const params = readAcquisitionParams();
  const referrerHost = safe(() => (params.referrer ? new URL(params.referrer).host : undefined), undefined);
  return {
    ...(referrerHost && referrerHost !== locationHost ? { referrerHost } : {}),
    ...(params.source ? { utmSource: params.source } : {}),
    ...(params.medium ? { utmMedium: params.medium } : {}),
    ...(params.campaign ? { utmCampaign: params.campaign } : {})
  };
};

let activeFunnel: AcquisitionFunnel | undefined;

// Called from client-auth-flow-analytics.ts on a genuine new-account sign-in.
export const reportAcquisitionSignUp = (method: string): void => activeFunnel?.report("sign_up", { method });

const browserEnv = (): AcquisitionFunnelEnv => ({
  storage: safe(() => window.localStorage, undefined),
  sendBeacon: (url, body) => {
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url, body)) return;
    void fetch(url, { method: "POST", body, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } }).catch(() => undefined);
  },
  randomId: () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`),
  locationHost: window.location.host
});

export type StartAcquisitionFunnelDeps = {
  firebaseAuth: Auth | undefined;
  analytics: Analytics | undefined;
  wsUrl: string;
  methodButtons: Array<{ button: HTMLElement; method: string }>;
};

export const startClientAcquisitionFunnel = (deps: StartAcquisitionFunnelDeps): void => {
  safe(() => {
    const env = browserEnv();
    const funnel = createAcquisitionFunnel(`${serverHttpOriginFromWsUrl(deps.wsUrl)}/api/funnel`, env);
    activeFunnel = funnel;
    const logGa = (name: string, params: Record<string, string>): void => {
      if (deps.analytics && !funnel.isKnownPlayer()) safe(() => logEvent(deps.analytics!, name, params), undefined);
    };
    funnel.report("visit", visitDetail(env.locationHost));
    for (const { button, method } of deps.methodButtons) {
      button.addEventListener("click", () => {
        logGa("auth_method_clicked", { method });
        funnel.report("auth_method_clicked", { method });
      });
    }
    if (!deps.firebaseAuth) return;
    onAuthStateChanged(deps.firebaseAuth, (user) => {
      if (user) {
        funnel.markKnownPlayer();
        return;
      }
      logGa("auth_form_shown", {});
      funnel.report("auth_form_shown");
    });
  }, undefined);
};
