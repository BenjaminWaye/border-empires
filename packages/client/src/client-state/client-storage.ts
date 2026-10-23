// localStorage access that never throws (restricted browser contexts),
// extracted from client-state.ts (500-line budget).
export const storageGet = (keyName: string): string | null => {
  try {
    return window.localStorage.getItem(keyName);
  } catch {
    return null;
  }
};

export const storageSet = (keyName: string, value: string): void => {
  try {
    window.localStorage.setItem(keyName, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const storageRemove = (keyName: string): void => {
  try {
    window.localStorage.removeItem(keyName);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};
