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
export const deleteAnalyticsCookies = (doc: Document = document): void => {
  const names = doc.cookie.split(";").map((part) => part.split("=")[0]?.trim() ?? "").filter((name) => name === "_ga" || name.startsWith("_ga_") || name === "_gid");
  const labels = doc.location.hostname.split(".");
  const domains = labels.map((_, i) => labels.slice(i).join(".")).filter((domain) => domain.includes("."));
  // Both forms of expiry: some browsers ignore Max-Age=0.
  const expired = "Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  for (const name of names) {
    doc.cookie = `${name}=; ${expired}`;
    for (const domain of domains) doc.cookie = `${name}=; ${expired}; domain=.${domain}`;
  }
};

export type AnalyticsConsentController = {
  /** Undefined until the player has chosen. */
  choice: () => AnalyticsConsent | undefined;
  /** The running analytics, or undefined without consent. */
  analytics: AnalyticsSource;
  grant: () => void;
  withdraw: () => void;
};

/**
 * `start` creates Firebase Analytics (getAnalytics) and may throw where it
 * cannot run; `setCollection` switches collection off and on again for a
 * running instance (setAnalyticsCollectionEnabled).
 */
export const createAnalyticsConsent = (deps: {
  start: () => Analytics;
  setCollection: (analytics: Analytics, enabled: boolean) => void;
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
  if (choice === "granted") start();
  return {
    choice: () => choice,
    analytics: () => (choice === "granted" ? running : undefined),
    grant: () => {
      choice = "granted";
      writeAnalyticsConsent("granted", now(), store);
      start();
    },
    withdraw: () => {
      choice = "denied";
      writeAnalyticsConsent("denied", now(), store);
      if (running) {
        try {
          deps.setCollection(running, false);
        } catch {
          // Collection is off for this visit anyway: analytics() returns nothing from now on.
        }
      }
      (deps.clearCookies ?? deleteAnalyticsCookies)();
    }
  };
};
