// Safari private browsing / ITP (and email-link taps opened from Mail in a
// locked-down WebKit context) can throw on any localStorage access rather
// than just returning null. An unguarded throw during bootstrap used to abort
// the entire client init with no diagnostics, and because the email sign-in
// link's query string was never cleared on that path, every reload of the
// same link reproduced the identical crash (Safari's "a problem repeatedly
// occurred" page). These wrappers make storage access degrade gracefully
// instead of crashing; normal browsers with working storage are unaffected.
export const safeLocalStorageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeLocalStorageSet = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the value just isn't remembered.
  }
};

export const safeLocalStorageRemove = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing to clean up.
  }
};
