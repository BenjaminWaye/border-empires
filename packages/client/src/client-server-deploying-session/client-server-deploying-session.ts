const SERVER_DEPLOYING_SESSION_KEY = "be:server-deploying-at";
const SERVER_DEPLOYING_WINDOW_MS = 180_000;

export const setServerDeployingSession = (): void => {
  try { sessionStorage.setItem(SERVER_DEPLOYING_SESSION_KEY, String(Date.now())); } catch {}
};

export const clearServerDeployingSession = (): void => {
  try { sessionStorage.removeItem(SERVER_DEPLOYING_SESSION_KEY); } catch {}
};

export const checkServerDeployingSession = (): boolean => {
  try {
    const ts = sessionStorage.getItem(SERVER_DEPLOYING_SESSION_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < SERVER_DEPLOYING_WINDOW_MS;
  } catch {
    return false;
  }
};
