// Consent for usage analytics (Google Analytics for Firebase), plan section
// 15 step 8f; docs/legal-drafts/README.md item 11. Swedish law (lag
// (2022:482) 9 kap. 28 §) allows non-essential storage on a player's device
// only with consent, and the privacy draft promises that analytics run only
// with it and that it can be withdrawn in Settings.
//
// Analytics is not started until the player accepts: Firebase sets its
// cookies when it starts, so starting it and switching collection off would
// already be too late. The choice is kept in this browser only.
import type { Analytics } from "firebase/analytics";

export type AnalyticsConsent = "granted" | "denied";

/** Read where an event is logged, so a consent given mid-visit counts from then on. */
export type AnalyticsSource = () => Analytics | undefined;

/** Bump the suffix if what is asked changes, so everyone is asked again. */
export const ANALYTICS_CONSENT_STORAGE_KEY = "be-analytics-consent-v1";

type StoredConsent = { choice: AnalyticsConsent; at: number };

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export const readAnalyticsConsent = (store: Storage | undefined = storage()): AnalyticsConsent | undefined => {
  try {
    const raw = store?.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    return parsed.choice === "granted" || parsed.choice === "denied" ? parsed.choice : undefined;
  } catch {
    return undefined;
  }
};

const writeAnalyticsConsent = (choice: AnalyticsConsent, now: number, store: Storage | undefined = storage()): void => {
  try {
    store?.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify({ choice, at: now } satisfies StoredConsent));
  } catch {
    // Storage blocked: the choice holds for this visit only, and the player is asked again next time.
  }
};

/**
 * Google Analytics' own cookies (`_ga`, `_ga_<id>`), deleted when consent is
 * withdrawn. They are set on the site's registrable domain, so each parent
 * domain of the current host is tried.
 */
export const deleteAnalyticsCookies = (given?: Pick<Document, "cookie" | "location">): void => {
  const doc = given ?? (typeof document === "undefined" ? undefined : document);
  if (!doc) return;
  // _ga, _ga_<id> and _gid are Analytics' own; _gcl_* and _gac_* appear when the property is linked to Google Ads.
  const names = doc.cookie.split(";").map((part) => part.split("=")[0]?.trim() ?? "").filter((name) => name === "_ga" || name === "_gid" || /^_(ga|gac|gcl)_/.test(name));
  const labels = doc.location.hostname.split(".");
  const domains = labels.map((_, i) => labels.slice(i).join(".")).filter((domain) => domain.includes("."));
  // Both forms of expiry: some browsers ignore Max-Age=0.
  const expired = "Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  for (const name of names) {
    doc.cookie = `${name}=; ${expired}`;
    for (const domain of domains) doc.cookie = `${name}=; ${expired}; domain=.${domain}`;
  }
};

const safely = (step: () => void): void => {
  try {
    step();
  } catch {
    // Best effort; see withdraw.
  }
};

export type AnalyticsConsentController = {
  /** Undefined until the player has chosen. */
  choice: () => AnalyticsConsent | undefined;
  /** The running analytics, or undefined without consent. */
  analytics: AnalyticsSource;
  grant: () => void;
  withdraw: () => void;
  /** Called after every answer, so other measurement (the sign-up funnel) can follow it. */
  onChange: (listener: (choice: AnalyticsConsent) => void) => void;
};

/**
 * `start` creates Firebase Analytics (getAnalytics) and may throw where it
 * cannot run; `setCollection` switches collection off and on again for a
 * running instance (setAnalyticsCollectionEnabled); `setConsentMode` tells
 * Google's tag the answer (setConsent), so it stops writing its cookies even
 * if a measurement id it uses is not the one `setCollection` switched off;
 * `forgetDevice` deletes the Firebase installation id kept in IndexedDB.
 */
export const createAnalyticsConsent = (deps: {
  start: () => Analytics;
  setCollection: (analytics: Analytics, enabled: boolean) => void;
  setConsentMode?: (granted: boolean) => void;
  forgetDevice?: () => Promise<void> | void;
  now?: () => number;
  store?: Storage;
  clearCookies?: () => void;
}): AnalyticsConsentController => {
  const store = deps.store ?? storage();
  const now = deps.now ?? (() => Date.now());
  let choice = readAnalyticsConsent(store);
  let running: Analytics | undefined;
  const start = (): void => {
    try {
      if (running) deps.setCollection(running, true);
      else running = deps.start();
    } catch {
      // Unsupported here (some private-browsing modes): no analytics, nothing else breaks.
      running = undefined;
    }
  };
  const listeners: Array<(choice: AnalyticsConsent) => void> = [];
  const notify = (answer: AnalyticsConsent): void => { for (const listener of listeners) safely(() => listener(answer)); };
  if (choice === "granted") start();
  // Cookies the game set before it asked (earlier builds started analytics for everyone) go now, unless the answer is yes.
  else (deps.clearCookies ?? deleteAnalyticsCookies)();
  return {
    choice: () => choice,
    analytics: () => (choice === "granted" ? running : undefined),
    grant: () => {
      choice = "granted";
      writeAnalyticsConsent("granted", now(), store);
      safely(() => deps.setConsentMode?.(true));
      start();
      notify("granted");
    },
    withdraw: () => {
      choice = "denied";
      writeAnalyticsConsent("denied", now(), store);
      // Each step is attempted whatever the others do: analytics() returns nothing from now on anyway.
      safely(() => deps.setConsentMode?.(false));
      if (running) {
        const instance = running;
        safely(() => deps.setCollection(instance, false));
      }
      safely(() => {
        const forgetting = deps.forgetDevice?.();
        if (forgetting) forgetting.catch(() => undefined);
      });
      safely(() => (deps.clearCookies ?? deleteAnalyticsCookies)());
      notify("denied");
    },
    onChange: (listener) => { listeners.push(listener); }
  };
};
