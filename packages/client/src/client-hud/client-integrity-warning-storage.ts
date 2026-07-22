// Persists the "Empire Integrity" warning dismissal so it doesn't nag the
// player on every login while integrity stays below 90%. The dismissal
// decays after 30 days, at which point the tooltip is eligible to show
// again even if integrity never recovered above the threshold.

const INTEGRITY_WARNING_STORAGE_KEY = "be-integrity-warning-dismissed-at";
const INTEGRITY_WARNING_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const isIntegrityWarningDismissed = (): boolean => {
  try {
    const raw = window.localStorage.getItem(INTEGRITY_WARNING_STORAGE_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < INTEGRITY_WARNING_DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

export const setIntegrityWarningDismissed = (): void => {
  try {
    window.localStorage.setItem(INTEGRITY_WARNING_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const clearIntegrityWarningDismissed = (): void => {
  try {
    window.localStorage.removeItem(INTEGRITY_WARNING_STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

// Wires every "[data-dismiss-integrity-warning]" button in `root` to dismiss
// the warning both in-memory (via `onDismiss`) and persisted to storage.
export const wireIntegrityWarningDismissButtons = (root: ParentNode, onDismiss: () => void): void => {
  const buttons = root.querySelectorAll("[data-dismiss-integrity-warning]") as NodeListOf<HTMLButtonElement>;
  buttons.forEach((btn) => {
    btn.onclick = () => {
      setIntegrityWarningDismissed();
      onDismiss();
    };
  });
};

// Resets the persisted dismissal once integrity recovers to >=90%, so the
// warning reappears promptly the next time integrity drops below 90%.
export const resetIntegrityWarningIfRecovered = (defensibilityPct: number): boolean => {
  if (defensibilityPct < 90) return false;
  clearIntegrityWarningDismissed();
  return true;
};
