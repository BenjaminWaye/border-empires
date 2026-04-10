import type { Tile } from "./client-types.js";

const DEBUG_TILE_STORAGE_KEY = "debug_tile_key";
const DEBUG_TILE_ENABLED_STORAGE_KEY = "debug_tile_enabled";
const DEBUG_EMAIL_STORAGE_KEY = "debug_auth_email";
const DEBUG_ACCOUNT_EMAIL = "bw199005@gmail.com";
const lastLogAtByKey = new Map<string, number>();

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

export const debugTileSnapshot = (tile: Tile | undefined): Record<string, unknown> | null => {
  if (!tile) return null;
  return {
    x: tile.x,
    y: tile.y,
    ownerId: tile.ownerId,
    ownershipState: tile.ownershipState,
    optimisticPending: tile.optimisticPending,
    detailLevel: tile.detailLevel,
    fogged: tile.fogged,
    lastChangedAt: (tile as Tile & { lastChangedAt?: number }).lastChangedAt,
    terrain: tile.terrain,
    resource: tile.resource
  };
};

export const debugTileTimeline = (
  scope: string,
  args: {
    x: number;
    y: number;
    before?: Tile | undefined;
    incoming?: Tile | undefined;
    after?: Tile | undefined;
    state: {
      selected?: { x: number; y: number } | undefined;
      actionInFlight?: boolean | undefined;
      actionTargetKey?: string | undefined;
      queuedTargetKeys?: Pick<Set<string>, "has"> | undefined;
      settleProgressByTile?: Pick<Map<string, unknown>, "has"> | undefined;
      frontierSyncWaitUntilByTarget?: Pick<Map<string, number>, "get"> | undefined;
    };
    keyFor: (x: number, y: number) => string;
    extra?: Record<string, unknown>;
    radius?: number;
    throttleKey?: string;
    minIntervalMs?: number;
  }
): void => {
  if (!tileMatchesDebugKey(args.x, args.y, args.radius ?? 1, { fallbackTile: args.state.selected })) return;
  const tileKey = args.keyFor(args.x, args.y);
  debugTileLog(
    scope,
    {
      tileKey,
      before: debugTileSnapshot(args.before),
      incoming: debugTileSnapshot(args.incoming),
      after: debugTileSnapshot(args.after),
      actionInFlight: args.state.actionInFlight,
      actionTargetKey: args.state.actionTargetKey,
      queued: args.state.queuedTargetKeys?.has(tileKey) ?? false,
      settlePending: args.state.settleProgressByTile?.has(tileKey) ?? false,
      frontierSyncWaitMs: Math.max(0, (args.state.frontierSyncWaitUntilByTarget?.get(tileKey) ?? 0) - Date.now()),
      ...(args.extra ?? {})
    },
    args.throttleKey ? { throttleKey: args.throttleKey, ...(typeof args.minIntervalMs === "number" ? { minIntervalMs: args.minIntervalMs } : {}) } : undefined
  );
};
