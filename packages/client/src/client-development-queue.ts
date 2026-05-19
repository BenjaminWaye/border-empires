import type { ClientState } from "./client-state.js";
import { SETTLE_COST } from "@border-empires/shared";

export const AUTO_SETTLEMENT_QUEUE_VISIBLE_MS = 3_000;

export type QueuedDevelopmentActionLike =
  | { kind: "SETTLE"; tileKey: string; label?: string; optimisticKind?: string }
  | { kind: "BUILD"; tileKey: string; label?: string; optimisticKind?: string };

export type PersistedDevelopmentAction = ClientState["developmentQueue"][number];

export type DevelopmentOwnedTileLike = {
  ownerId?: string;
  fort?: { status?: string };
  observatory?: { status?: string };
  siegeOutpost?: { status?: string };
  economicStructure?: { status?: string };
};

export const queuedSettlementOrderForTile = (
  queue: readonly QueuedDevelopmentActionLike[],
  tileKey: string
): number =>
  queue.reduce((order, entry, index) => {
    if (order !== -1) return order;
    return entry.kind === "SETTLE" && entry.tileKey === tileKey ? index : -1;
  }, -1);

export const hasQueuedSettlementForTile = (
  queue: readonly QueuedDevelopmentActionLike[],
  tileKey: string
): boolean => queuedSettlementOrderForTile(queue, tileKey) !== -1;

export const queuedBuildOrderForTile = (
  queue: readonly QueuedDevelopmentActionLike[],
  tileKey: string
): number =>
  queue.reduce((order, entry, index) => {
    if (order !== -1) return order;
    return entry.kind === "BUILD" && entry.tileKey === tileKey ? index : -1;
  }, -1);

export const hasQueuedBuildForTile = (
  queue: readonly QueuedDevelopmentActionLike[],
  tileKey: string
): boolean => queuedBuildOrderForTile(queue, tileKey) !== -1;

export const pruneExpiredAutoSettlementQueueVisibleHolds = (state: ClientState, nowMs: number = Date.now()): void => {
  for (const [tileKey, visibleUntil] of state.autoSettlementQueueVisibleUntilByTile.entries()) {
    if (visibleUntil <= nowMs) state.autoSettlementQueueVisibleUntilByTile.delete(tileKey);
  }
};

export const applyAutoSettlementQueueFromServer = (
  state: ClientState,
  entries: Array<{ x: number; y: number }> | undefined,
  deps: {
    keyFor: (x: number, y: number) => string;
  }
): number => {
  if (!entries) return 0;
  state.skippedAutoSettlementTileKeys = restoreSkippedAutoSettlementTileKeysForPlayer(state.me);
  state.autoSettlementQueue = entries;
  pruneExpiredAutoSettlementQueueVisibleHolds(state);
  let added = 0;
  const pendingSettlementTileKeys = new Set(state.settleProgressByTile.keys());
  const queuedSettlementTileKeys = new Set(
    state.developmentQueue.filter((entry) => entry.kind === "SETTLE").map((entry) => entry.tileKey)
  );
  let settlementBudget = Math.max(0, state.gold - queuedSettlementTileKeys.size * SETTLE_COST);
  for (const entry of entries) {
    if (settlementBudget < SETTLE_COST) break;
    const tileKey = deps.keyFor(entry.x, entry.y);
    if (pendingSettlementTileKeys.has(tileKey) || queuedSettlementTileKeys.has(tileKey)) continue;
    if (state.skippedAutoSettlementTileKeys.has(tileKey)) continue;
    const tile = state.tiles.get(tileKey);
    if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER") continue;
    state.developmentQueue.push({
      kind: "SETTLE",
      x: entry.x,
      y: entry.y,
      tileKey,
      label: `Settlement at (${entry.x}, ${entry.y})`
    });
    state.autoSettlementQueueVisibleUntilByTile.set(tileKey, Date.now() + AUTO_SETTLEMENT_QUEUE_VISIBLE_MS);
    queuedSettlementTileKeys.add(tileKey);
    settlementBudget -= SETTLE_COST;
    added += 1;
  }
  if (added > 0) persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
  return added;
};

export const busyDevelopmentProcessCount = (
  tiles: Iterable<DevelopmentOwnedTileLike>,
  ownerId: string,
  pendingSettlementCount: number
): number => {
  let busy = pendingSettlementCount;
  for (const tile of tiles) {
    if (tile.ownerId !== ownerId) continue;
    if (
      tile.fort?.status === "under_construction" ||
      tile.fort?.status === "removing" ||
      tile.observatory?.status === "under_construction" ||
      tile.observatory?.status === "removing" ||
      tile.siegeOutpost?.status === "under_construction" ||
      tile.siegeOutpost?.status === "removing" ||
      tile.economicStructure?.status === "under_construction" ||
      tile.economicStructure?.status === "removing"
    ) {
      busy += 1;
    }
  }
  return busy;
};

const DEVELOPMENT_QUEUE_SESSION_KEY = "border-empires-development-queue-v1";
const AUTO_SETTLEMENT_SKIP_SESSION_KEY = "border-empires-auto-settlement-skips-v1";

const readSessionStorage = (key: string): string | null => {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const writeSessionStorage = (key: string, value: string): void => {
  try {
    globalThis.sessionStorage?.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

const removeSessionStorage = (key: string): void => {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const parsePersistedDevelopmentAction = (value: unknown): PersistedDevelopmentAction | undefined => {
  if (!isRecord(value)) return undefined;
  if (
    value.kind === "SETTLE" &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.tileKey === "string" &&
    typeof value.label === "string"
  ) {
    return {
      kind: "SETTLE",
      x: value.x,
      y: value.y,
      tileKey: value.tileKey,
      label: value.label
    };
  }
  if (
    value.kind === "BUILD" &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.tileKey === "string" &&
    typeof value.label === "string" &&
    typeof value.optimisticKind === "string" &&
    isRecord(value.payload) &&
    typeof value.payload.type === "string" &&
    typeof value.payload.x === "number" &&
    typeof value.payload.y === "number" &&
    (value.payload.type !== "BUILD_ECONOMIC_STRUCTURE" || typeof value.payload.structureType === "string")
  ) {
    return {
      kind: "BUILD",
      x: value.x,
      y: value.y,
      tileKey: value.tileKey,
      label: value.label,
      payload:
        value.payload.type === "BUILD_ECONOMIC_STRUCTURE"
          ? {
              type: "BUILD_ECONOMIC_STRUCTURE",
              x: value.payload.x,
              y: value.payload.y,
              structureType: value.payload.structureType as Extract<
                Extract<PersistedDevelopmentAction, { kind: "BUILD" }>["payload"],
                { type: "BUILD_ECONOMIC_STRUCTURE" }
              >["structureType"]
            }
          : ({
              type: value.payload.type,
              x: value.payload.x,
              y: value.payload.y
            } as Exclude<Extract<PersistedDevelopmentAction, { kind: "BUILD" }>["payload"], { type: "BUILD_ECONOMIC_STRUCTURE" }>),
      optimisticKind: value.optimisticKind as Extract<PersistedDevelopmentAction, { kind: "BUILD" }>["optimisticKind"]
    };
  }
  return undefined;
};

export const persistDevelopmentQueueForPlayer = (
  playerId: string,
  queue: readonly PersistedDevelopmentAction[]
): void => {
  if (!playerId || queue.length === 0) {
    removeSessionStorage(DEVELOPMENT_QUEUE_SESSION_KEY);
    return;
  }
  writeSessionStorage(
    DEVELOPMENT_QUEUE_SESSION_KEY,
    JSON.stringify({
      playerId,
      queue
    })
  );
};

export const persistSkippedAutoSettlementTileKeysForPlayer = (
  playerId: string,
  tileKeys: ReadonlySet<string>
): void => {
  if (!playerId || tileKeys.size === 0) {
    removeSessionStorage(AUTO_SETTLEMENT_SKIP_SESSION_KEY);
    return;
  }
  writeSessionStorage(
    AUTO_SETTLEMENT_SKIP_SESSION_KEY,
    JSON.stringify({
      playerId,
      tileKeys: [...tileKeys]
    })
  );
};

export const restoreSkippedAutoSettlementTileKeysForPlayer = (playerId: string): Set<string> => {
  if (!playerId) return new Set();
  const raw = readSessionStorage(AUTO_SETTLEMENT_SKIP_SESSION_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as { playerId?: unknown; tileKeys?: unknown };
    if (parsed.playerId !== playerId || !Array.isArray(parsed.tileKeys)) {
      removeSessionStorage(AUTO_SETTLEMENT_SKIP_SESSION_KEY);
      return new Set();
    }
    return new Set(parsed.tileKeys.filter((tileKey): tileKey is string => typeof tileKey === "string"));
  } catch {
    removeSessionStorage(AUTO_SETTLEMENT_SKIP_SESSION_KEY);
    return new Set();
  }
};

export const clearSkippedAutoSettlementTileKeyForPlayer = (playerId: string, tileKey: string): Set<string> => {
  const nextSkipped = restoreSkippedAutoSettlementTileKeysForPlayer(playerId);
  nextSkipped.delete(tileKey);
  persistSkippedAutoSettlementTileKeysForPlayer(playerId, nextSkipped);
  return nextSkipped;
};

type QueueRestoreTileLike = {
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
};

export const restorePersistedDevelopmentQueueForPlayer = (
  playerId: string,
  tiles: ReadonlyMap<string, QueueRestoreTileLike>,
  pendingSettlementTileKeys: ReadonlySet<string> = new Set()
): PersistedDevelopmentAction[] => {
  if (!playerId) return [];
  const raw = readSessionStorage(DEVELOPMENT_QUEUE_SESSION_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { playerId?: unknown; queue?: unknown };
    if (parsed.playerId !== playerId || !Array.isArray(parsed.queue)) {
      removeSessionStorage(DEVELOPMENT_QUEUE_SESSION_KEY);
      return [];
    }
    const restoredQueue = parsed.queue
      .map(parsePersistedDevelopmentAction)
      .filter((entry): entry is PersistedDevelopmentAction => Boolean(entry))
      .filter((entry) => {
        const tile = tiles.get(entry.tileKey);
        if (!tile || tile.ownerId !== playerId) return false;
        if (entry.kind === "SETTLE") {
          return tile.ownershipState === "FRONTIER" && !pendingSettlementTileKeys.has(entry.tileKey);
        }
        return tile.ownershipState === "SETTLED";
      });
    persistDevelopmentQueueForPlayer(playerId, restoredQueue);
    return restoredQueue;
  } catch {
    removeSessionStorage(DEVELOPMENT_QUEUE_SESSION_KEY);
    return [];
  }
};
