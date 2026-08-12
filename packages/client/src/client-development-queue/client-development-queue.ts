import type { ClientState } from "../client-state/client-state.js";
import type { OptimisticStructureKind } from "../client-types.js";
import { DEV_QUEUE_SERVER_CAP, DEV_QUEUE_TOTAL_CAP, SETTLE_COST, SETTLE_MANPOWER_COST } from "@border-empires/shared";

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
  // Manpower is also a real SETTLE cost (§4.2 of docs/manpower-economy-rewrite-plan.md)
  // — bulk-filling this queue against gold alone over-queues settlements a
  // manpower-poor player can't actually afford, each of which then gets
  // rejected server-side one at a time.
  let manpowerBudget = Math.max(0, state.manpower - queuedSettlementTileKeys.size * SETTLE_MANPOWER_COST);
  for (const entry of entries) {
    if (settlementBudget < SETTLE_COST || manpowerBudget < SETTLE_MANPOWER_COST) break;
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
    manpowerBudget -= SETTLE_MANPOWER_COST;
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
    (value.payload.type !== "BUILD_STRUCTURE" || typeof value.payload.structureType === "string")
  ) {
    // Migrate legacy wire types to BUILD_STRUCTURE so queued builds survive
    // the v2026.06.02.7 → v2026.06.02.8 client upgrade.
    let normalizedType: string;
    let normalizedStructureType: string;
    const rawType = value.payload.type;
    if (rawType === "BUILD_STRUCTURE" && typeof (value.payload as any).structureType === "string") {
      normalizedType = "BUILD_STRUCTURE";
      normalizedStructureType = (value.payload as any).structureType as string;
    }
    else if (rawType === "BUILD_FORT") { normalizedType = "BUILD_STRUCTURE"; normalizedStructureType = "FORT"; }
    else if (rawType === "BUILD_OBSERVATORY") { normalizedType = "BUILD_STRUCTURE"; normalizedStructureType = "OBSERVATORY"; }
    else if (rawType === "BUILD_SIEGE_OUTPOST") { normalizedType = "BUILD_STRUCTURE"; normalizedStructureType = "SIEGE_OUTPOST"; }
    else if (rawType === "BUILD_ECONOMIC_STRUCTURE" && typeof (value.payload as any).structureType === "string") {
      normalizedType = "BUILD_STRUCTURE";
      normalizedStructureType = (value.payload as any).structureType as string;
    }
    else { normalizedType = rawType; normalizedStructureType = ""; }

    return {
      kind: "BUILD",
      x: value.x,
      y: value.y,
      tileKey: value.tileKey,
      label: value.label,
      payload: normalizedType === "BUILD_STRUCTURE"
        ? { type: "BUILD_STRUCTURE", x: value.payload.x, y: value.payload.y, structureType: normalizedStructureType }
        : ({ type: value.payload.type, x: value.payload.x, y: value.payload.y } as Extract<PersistedDevelopmentAction, { kind: "BUILD" }>["payload"]),
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

export const queuedDevelopmentActionExists = (
  state: ClientState,
  tileKey: string,
  kind?: PersistedDevelopmentAction["kind"]
): boolean => state.developmentQueue.some((entry) => entry.tileKey === tileKey && (!kind || entry.kind === kind));

// Wire payloads for the server-durable dev-queue tier (see
// apps/simulation/src/runtime-dev-queue.ts). structureType doubles as the
// "REMOVE_STRUCTURE" sentinel for removal entries -- matches
// tryDrainDevQueue's own isRemoval check server-side.
export const devQueueEnqueueWirePayload = (entry: PersistedDevelopmentAction): Record<string, unknown> => ({
  type: "DEV_QUEUE_ENQUEUE",
  x: entry.x,
  y: entry.y,
  tileKey: entry.tileKey,
  kind: entry.kind,
  ...(entry.kind === "BUILD"
    ? { structureType: entry.payload.type === "REMOVE_STRUCTURE" ? "REMOVE_STRUCTURE" : entry.payload.structureType }
    : {})
});

export const devQueueCancelWirePayload = (tileKey: string): Record<string, unknown> => ({ type: "DEV_QUEUE_CANCEL", tileKey });

export const devQueueMoveToFrontWirePayload = (tileKey: string): Record<string, unknown> => ({ type: "DEV_QUEUE_MOVE_TO_FRONT", tileKey });

/**
 * Push a SETTLE/BUILD action onto the flat, FIFO-dispatched developmentQueue.
 * Position within that array implicitly determines its dev-queue tier (see
 * devQueueTierForIndex in packages/shared/src/dev-queue/dev-queue.ts): the
 * first DEV_QUEUE_SERVER_CAP entries are "queued", the rest "planned" --
 * capped in total at DEV_QUEUE_TOTAL_CAP so the wishlist can't grow forever.
 *
 * Entries that land within the durable "queued" tier are also mirrored to
 * the server via DEV_QUEUE_ENQUEUE (deps.sendGameMessage), so they keep
 * draining themselves (see tryDrainDevQueue, event-driven off settle/build
 * completion) even while this client is offline -- previously this queue was
 * purely client-local sessionStorage, so anything past the one action
 * in-flight simply stalled the moment the tab closed or the player logged
 * out. sendGameMessage is optional so callers/tests that don't care about
 * server durability aren't forced to stub it.
 */
export const queueDevelopmentAction = (
  state: ClientState,
  entry: PersistedDevelopmentAction,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage?: (payload: unknown) => boolean;
  }
): boolean => {
  if (queuedDevelopmentActionExists(state, entry.tileKey, entry.kind)) {
    deps.renderHud();
    return false;
  }
  if (state.developmentQueue.length >= DEV_QUEUE_TOTAL_CAP) {
    deps.pushFeed(`Development queue is full (${DEV_QUEUE_TOTAL_CAP}/${DEV_QUEUE_TOTAL_CAP}). Cancel something before queuing more.`, "combat", "warn");
    deps.renderHud();
    return false;
  }
  if (entry.kind === "SETTLE") {
    state.skippedAutoSettlementTileKeys = clearSkippedAutoSettlementTileKeyForPlayer(state.me, entry.tileKey);
  }
  const position = state.developmentQueue.length;
  state.developmentQueue.push(entry);
  persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
  if (position < DEV_QUEUE_SERVER_CAP) deps.sendGameMessage?.(devQueueEnqueueWirePayload(entry));
  deps.renderHud();
  return true;
};

type QueueRestoreTileLike = {
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
};

/** True if `entry` still describes something worth dispatching -- false once the
 * tile has moved past it (e.g. a SETTLE whose tile already settled, or a BUILD
 * whose tile is no longer owned/settled). Used both to prune stale sessionStorage
 * entries on restore and to catch entries a durable server-side auto-drain
 * (tryDrainDevQueue) already resolved while this client was disconnected --
 * those never make it into a reconnect's serverDevQueue, so
 * mergeServerDevQueueIntoRestoredQueue alone can't distinguish "genuinely still
 * planned" from "already done"; this tile-state check can. */
export const isQueuedDevelopmentActionStillValid = (
  entry: PersistedDevelopmentAction,
  tiles: ReadonlyMap<string, QueueRestoreTileLike>,
  playerId: string,
  pendingSettlementTileKeys: ReadonlySet<string> = new Set()
): boolean => {
  const tile = tiles.get(entry.tileKey);
  if (!tile || tile.ownerId !== playerId) return false;
  if (entry.kind === "SETTLE") {
    return tile.ownershipState === "FRONTIER" && !pendingSettlementTileKeys.has(entry.tileKey);
  }
  return tile.ownershipState === "SETTLED";
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
    const parsedQueue = parsed.queue
      .map(parsePersistedDevelopmentAction)
      .filter((entry): entry is PersistedDevelopmentAction => Boolean(entry));
    // On a fresh page load this restore runs before the first tile snapshot
    // arrives, so `tiles` is still empty here — filtering against it would
    // treat every entry as stale and immediately re-persist an empty queue,
    // permanently wiping it (the actual bug: queued settles vanishing on
    // refresh). Trust the persisted entries as-is until real tile data is in
    // hand; only prune (and only then re-persist the pruned result) once we
    // have something to validate against.
    if (tiles.size === 0) return parsedQueue;
    const restoredQueue = parsedQueue.filter((entry) => isQueuedDevelopmentActionStillValid(entry, tiles, playerId, pendingSettlementTileKeys));
    persistDevelopmentQueueForPlayer(playerId, restoredQueue);
    return restoredQueue;
  } catch {
    removeSessionStorage(DEVELOPMENT_QUEUE_SESSION_KEY);
    return [];
  }
};

export type ServerDevQueueWireEntry = {
  tileKey: string;
  x: number;
  y: number;
  kind: "SETTLE" | "BUILD";
  structureType?: string;
  queuedAt: number;
};

/** Best-effort reconstruction of a queue entry from the server's durable
 * dev-queue when sessionStorage has nothing for that tile (e.g. a fresh
 * login on a new device/tab) -- label/optimisticKind are synthesized rather
 * than round-tripped, since the wire payload only carries what
 * tryDrainDevQueue actually needs to dispatch, not full UI copy. */
const reconstructDevelopmentActionFromServerEntry = (entry: ServerDevQueueWireEntry): PersistedDevelopmentAction => {
  if (entry.kind === "SETTLE") {
    return { kind: "SETTLE", x: entry.x, y: entry.y, tileKey: entry.tileKey, label: `Settlement at (${entry.x}, ${entry.y})` };
  }
  const isRemoval = entry.structureType === "REMOVE_STRUCTURE";
  return {
    kind: "BUILD",
    x: entry.x,
    y: entry.y,
    tileKey: entry.tileKey,
    label: isRemoval ? `Remove structure at (${entry.x}, ${entry.y})` : `Build ${entry.structureType ?? "structure"} at (${entry.x}, ${entry.y})`,
    payload: isRemoval
      ? { type: "REMOVE_STRUCTURE", x: entry.x, y: entry.y }
      : { type: "BUILD_STRUCTURE", x: entry.x, y: entry.y, structureType: entry.structureType ?? "" },
    optimisticKind: (entry.structureType ?? "FORT") as OptimisticStructureKind
  };
};

/**
 * Merge the server-durable dev-queue tail (from a PLAYER_UPDATE/login
 * snapshot) into the sessionStorage-restored queue on login/reconnect. The
 * server list is authoritative for ordering/presence of the "queued" tier --
 * it kept draining while this client was offline, so sessionStorage may be
 * stale (missing tiles that already resolved, or ordered differently). Any
 * sessionStorage entries the server doesn't know about (the client-local
 * "planned" tier beyond DEV_QUEUE_SERVER_CAP) are appended after, in their
 * original order.
 */
export const mergeServerDevQueueIntoRestoredQueue = (
  restoredQueue: readonly PersistedDevelopmentAction[],
  serverDevQueue: readonly ServerDevQueueWireEntry[] | undefined
): PersistedDevelopmentAction[] => {
  if (!serverDevQueue?.length) return [...restoredQueue];
  const restoredByTileKey = new Map(restoredQueue.map((entry) => [entry.tileKey, entry] as const));
  const serverTileKeys = new Set(serverDevQueue.map((entry) => entry.tileKey));
  const merged = serverDevQueue.map(
    (entry) => restoredByTileKey.get(entry.tileKey) ?? reconstructDevelopmentActionFromServerEntry(entry)
  );
  for (const entry of restoredQueue) {
    if (!serverTileKeys.has(entry.tileKey)) merged.push(entry);
  }
  return merged;
};
