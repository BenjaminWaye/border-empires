// Facebook Messenger, Instagram, and similar in-app WebViews block window.open
// (used for signInWithPopup) and/or partition sessionStorage across the
// redirect navigation Firebase falls back to. That combination surfaces as
// Firebase's cryptic "Unable to process request due to missing initial
// state." error on res.firebaseapp.com instead of ever showing our own UI.
// Detect these environments up front so we can steer the player to their
// system browser instead of letting Google sign-in fail silently there.
type KnownInAppBrowser = {
  name: string;
  matches: (userAgent: string) => boolean;
};

const KNOWN_IN_APP_BROWSERS: KnownInAppBrowser[] = [
  { name: "Facebook Messenger", matches: (ua) => /FBAN|FBAV|Messenger/i.test(ua) },
  { name: "Instagram", matches: (ua) => /Instagram/i.test(ua) },
  { name: "Line", matches: (ua) => /\bLine\//i.test(ua) },
  { name: "WeChat", matches: (ua) => /MicroMessenger/i.test(ua) },
  { name: "TikTok", matches: (ua) => /BytedanceWebview|TikTok/i.test(ua) },
  { name: "Twitter/X", matches: (ua) => /Twitter/i.test(ua) }
];

export const detectInAppBrowserName = (userAgent: string): string | undefined =>
  KNOWN_IN_APP_BROWSERS.find((browser) => browser.matches(userAgent))?.name;

export const inAppBrowserGoogleSignInMessage = (appName: string): string =>
  `Google sign-in doesn't work inside the ${appName} in-app browser. Tap the menu (••• or ⋮) and choose "Open in Chrome" or "Open in Safari", then sign in again.`;

// Fallback for when detection above misses a browser but Firebase's redirect
// fallback still fails because sessionStorage was cleared/partitioned.
export const isMissingInitialStateError = (message: string): boolean =>
  /missing initial state/i.test(message);

export const MISSING_INITIAL_STATE_MESSAGE =
  'Google sign-in failed because this browser blocked the required session storage. Open this page in Chrome or Safari (not an in-app browser) and try again.';
