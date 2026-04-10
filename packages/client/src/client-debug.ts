const DEBUG_TILE_STORAGE_KEY = "debug_tile_key";
const DEBUG_TILE_ENABLED_STORAGE_KEY = "debug_tile_enabled";
const DEBUG_EMAIL_STORAGE_KEY = "debug_auth_email";
const DEBUG_ACCOUNT_EMAIL = "bw199005@gmail.com";
const lastLogAtByKey = new Map<string, number>();

export const tileSyncDebugEnabled = (): boolean => {
  try {
    return (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "0.0.0.0" ||
      window.localStorage.getItem("tile-sync-debug") === "1"
    );
  } catch {
    return false;
  }
};

export const attackSyncLog = (event: string, payload: Record<string, unknown>): void => {
  if (!tileSyncDebugEnabled()) return;
  console.info(`[attack-sync] ${event}`, payload);
};

const normalizeTileKey = (value: string | null): string => {
  if (!value) return "";
  const trimmed = value.trim();
  return /^\d+,\d+$/.test(trimmed) ? trimmed : "";
};

export const debugTileKey = (): string => {
  try {
    return normalizeTileKey(window.localStorage.getItem(DEBUG_TILE_STORAGE_KEY));
  } catch {
    return "";
  }
};

export const setDebugTileKey = (value: string | undefined): void => {
  try {
    const normalized = normalizeTileKey(value ?? null);
    if (normalized) window.localStorage.setItem(DEBUG_TILE_STORAGE_KEY, normalized);
    else window.localStorage.removeItem(DEBUG_TILE_STORAGE_KEY);
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
};

const debugAuthEmail = (): string => {
  try {
    return (window.localStorage.getItem(DEBUG_EMAIL_STORAGE_KEY) ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
};

export const setDebugAuthEmail = (email: string | undefined): void => {
  try {
    const normalized = (email ?? "").trim().toLowerCase();
    if (normalized) window.localStorage.setItem(DEBUG_EMAIL_STORAGE_KEY, normalized);
    else window.localStorage.removeItem(DEBUG_EMAIL_STORAGE_KEY);
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
};

export const debugEnabledForAccount = (): boolean => debugAuthEmail() === DEBUG_ACCOUNT_EMAIL;

export const debugTileLoggingEnabled = (): boolean => {
  if (!debugEnabledForAccount()) return false;
  try {
    return window.localStorage.getItem(DEBUG_TILE_ENABLED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const setDebugTileLoggingEnabled = (enabled: boolean): void => {
  try {
    if (enabled) window.localStorage.setItem(DEBUG_TILE_ENABLED_STORAGE_KEY, "1");
    else window.localStorage.removeItem(DEBUG_TILE_ENABLED_STORAGE_KEY);
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
};

export const announceDebugTileState = (message: string, payload?: Record<string, unknown>): void => {
  console.log(`[debug-tile] ${message}`, payload ?? {});
};

export const tileMatchesDebugKey = (
  x: number,
  y: number,
  radius = 0,
  options?: { fallbackTile?: { x: number; y: number } | undefined }
): boolean => {
  if (!debugTileLoggingEnabled()) return false;
  const key = debugTileKey();
  const fallbackTile = options?.fallbackTile;
  const resolvedKey = key || (fallbackTile ? `${fallbackTile.x},${fallbackTile.y}` : "");
  if (!resolvedKey) return false;
  const parts = resolvedKey.split(",").map(Number);
  const dx = Number(parts[0] ?? Number.NaN);
  const dy = Number(parts[1] ?? Number.NaN);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  return Math.abs(dx - x) <= radius && Math.abs(dy - y) <= radius;
};

export const debugTileLog = (
  scope: string,
  payload: Record<string, unknown>,
  options?: { throttleKey?: string; minIntervalMs?: number }
): void => {
  const throttleKey = options?.throttleKey ? `${scope}:${options.throttleKey}` : "";
  if (throttleKey) {
    const now = Date.now();
    const minIntervalMs = options?.minIntervalMs ?? 1500;
    const last = lastLogAtByKey.get(throttleKey) ?? 0;
    if (now - last < minIntervalMs) return;
    lastLogAtByKey.set(throttleKey, now);
  }
  console.log(`[debug-tile:${scope}]`, payload);
};
