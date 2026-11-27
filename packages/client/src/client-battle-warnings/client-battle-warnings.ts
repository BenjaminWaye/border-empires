// In-game battle warnings: a terse "Under attack" HUD banner plus a brief
// flash on each tile you just lost, in both renderers.
//
// Builds on two signals the client already receives:
// - Tile losses: a TILE_DELTA_BATCH that moves one of your tiles to another
//   owner (a House, Planetary Defense, or a breakthrough that takes several
//   tiles in one attack). Reported by client-tile-delta-batch-handler.ts via
//   recordOwnTileLosses. Tiles that fall to neutral (frontier decay, a
//   failed claim reverting) are not attacks and are ignored.
// - Incoming attacks: ATTACK_ALERT fills state.incomingAttacksByTile before
//   the attack resolves (client-network.ts). Both renderers already mark
//   those tiles; syncIncomingAttacks only adds them to the banner.
//
// Rapid losses batch into one banner: every event inside
// BATTLE_WARNING_HOLD_MS of the previous one adds to the same count instead
// of raising a new alert. Purely presentational; no combat rule is touched.
import { playerNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import type { ClientState } from "../client-state/client-state.js";

/** Banner stays up this long after the latest loss / new incoming attack; events inside it batch together. */
export const BATTLE_WARNING_HOLD_MS = 20_000;
/** How long a lost tile flashes on the map. */
export const BATTLE_FLASH_MS = 8_000;
/** Bound on flashing tiles; the oldest flash drops first. */
export const BATTLE_FLASH_CAP = 64;

export type BattleFlash = { x: number; y: number; startedAt: number; until: number };

type BattleAttacker = { id: string; name: string };

export type BattleWarningBatch = {
  attackers: BattleAttacker[];
  lostCount: number;
  focusX: number;
  focusY: number;
  lastEventAt: number;
  dismissed: boolean;
};

export type BattleWarningStore = {
  me: string | undefined;
  batch: BattleWarningBatch | undefined;
  flashes: Map<string, BattleFlash>;
  // incomingAttacksByTile key -> resolvesAt already counted, so each ATTACK_ALERT raises the banner once.
  seenIncoming: Map<string, number>;
};

export type BattleWarningView = { title: string; detail: string; focusX: number; focusY: number };

export type OwnTileLoss = { x: number; y: number; newOwnerId: string };

type NameState = Pick<ClientState, "me" | "meName" | "playerNames" | "leaderboard">;
type IncomingAttackState = Pick<ClientState, "incomingAttacksByTile">;

export const createBattleWarningStore = (): BattleWarningStore => ({
  me: undefined,
  batch: undefined,
  flashes: new Map(),
  seenIncoming: new Map()
});

/** Shared by the tile-delta handler (writes) and the per-frame HUD/renderers (reads). */
export const battleWarnings = createBattleWarningStore();

const resetForPlayer = (store: BattleWarningStore, me: string | undefined): void => {
  if (store.me === me) return;
  store.me = me;
  store.batch = undefined;
  store.flashes.clear();
  store.seenIncoming.clear();
};

const noteEvent = (store: BattleWarningStore, attacker: BattleAttacker, x: number, y: number, nowMs: number): BattleWarningBatch => {
  const current = store.batch && nowMs - store.batch.lastEventAt <= BATTLE_WARNING_HOLD_MS ? store.batch : undefined;
  const batch: BattleWarningBatch = current ?? { attackers: [], lostCount: 0, focusX: x, focusY: y, lastEventAt: nowMs, dismissed: false };
  // Latest attacker first, so the banner names whoever is hitting you now.
  batch.attackers = [attacker, ...batch.attackers.filter((entry) => entry.id !== attacker.id)];
  batch.focusX = x;
  batch.focusY = y;
  batch.lastEventAt = nowMs;
  batch.dismissed = false;
  store.batch = batch;
  return batch;
};

const addFlash = (store: BattleWarningStore, x: number, y: number, nowMs: number): void => {
  const key = `${x},${y}`;
  store.flashes.delete(key);
  store.flashes.set(key, { x, y, startedAt: nowMs, until: nowMs + BATTLE_FLASH_MS });
  while (store.flashes.size > BATTLE_FLASH_CAP) {
    const oldest = store.flashes.keys().next().value;
    if (oldest === undefined) break;
    store.flashes.delete(oldest);
  }
};

/**
 * Picks the tiles of `me` that a tile-delta batch handed to another owner.
 * `previousOwnerAt` is the cached tile before the batch merged, `currentOwnerAt`
 * after. A tile still pending our own optimistic claim was never really ours.
 */
export const detectOwnTileLosses = (
  me: string | undefined,
  updates: ReadonlyArray<{ x: number; y: number }>,
  previousAt: (x: number, y: number) => { ownerId?: string | undefined; optimisticPending?: string | undefined } | undefined,
  currentOwnerAt: (x: number, y: number) => string | undefined
): OwnTileLoss[] => {
  if (!me) return [];
  const losses: OwnTileLoss[] = [];
  for (const update of updates) {
    const previous = previousAt(update.x, update.y);
    if (previous?.ownerId !== me || previous.optimisticPending === "expand") continue;
    const newOwnerId = currentOwnerAt(update.x, update.y);
    if (!newOwnerId || newOwnerId === me) continue;
    losses.push({ x: update.x, y: update.y, newOwnerId });
  }
  return losses;
};

export const recordOwnTileLosses = (
  store: BattleWarningStore,
  state: NameState,
  losses: readonly OwnTileLoss[],
  nowMs: number
): void => {
  resetForPlayer(store, state.me);
  for (const loss of losses) {
    const name = playerNameForOwnerFromState(state, loss.newOwnerId) ?? "Unknown";
    const batch = noteEvent(store, { id: loss.newOwnerId, name }, loss.x, loss.y, nowMs);
    batch.lostCount += 1;
    addFlash(store, loss.x, loss.y, nowMs);
  }
};

const parseTileKey = (key: string): { x: number; y: number } | undefined => {
  const [xs, ys] = key.split(",");
  const x = Number(xs);
  const y = Number(ys);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

/** Raises the banner once per new ATTACK_ALERT still pending in state.incomingAttacksByTile. */
export const syncIncomingAttacks = (store: BattleWarningStore, state: NameState & IncomingAttackState, nowMs: number): void => {
  resetForPlayer(store, state.me);
  for (const key of [...store.seenIncoming.keys()]) {
    if (!state.incomingAttacksByTile.has(key)) store.seenIncoming.delete(key);
  }
  for (const [key, incoming] of state.incomingAttacksByTile) {
    if (incoming.resolvesAt <= nowMs || store.seenIncoming.get(key) === incoming.resolvesAt) continue;
    store.seenIncoming.set(key, incoming.resolvesAt);
    const tile = parseTileKey(key);
    if (!tile) continue;
    const id = incoming.attackerId ?? incoming.attackerName;
    const name = (incoming.attackerId ? playerNameForOwnerFromState(state, incoming.attackerId) : undefined) ?? incoming.attackerName;
    noteEvent(store, { id, name }, tile.x, tile.y, nowMs);
  }
};

const activeIncomingCount = (state: IncomingAttackState, nowMs: number): number => {
  let count = 0;
  for (const incoming of state.incomingAttacksByTile.values()) if (incoming.resolvesAt > nowMs) count += 1;
  return count;
};

/** Terse banner text, e.g. "Insurgents · 3 tiles lost · 1 incoming"; undefined when nothing to show. */
export const battleWarningView = (store: BattleWarningStore, state: IncomingAttackState, nowMs: number): BattleWarningView | undefined => {
  const batch = store.batch;
  if (!batch) return undefined;
  const incoming = activeIncomingCount(state, nowMs);
  if (nowMs - batch.lastEventAt > BATTLE_WARNING_HOLD_MS && incoming === 0) {
    store.batch = undefined;
    return undefined;
  }
  if (batch.dismissed) return undefined;
  const [latest] = batch.attackers;
  const who = latest ? (batch.attackers.length > 1 ? `${latest.name} +${batch.attackers.length - 1}` : latest.name) : "Unknown";
  const parts = [who];
  if (batch.lostCount > 0) parts.push(`${batch.lostCount} ${batch.lostCount === 1 ? "tile" : "tiles"} lost`);
  if (incoming > 0) parts.push(`${incoming} incoming`);
  return { title: "Under attack", detail: parts.join(" · "), focusX: batch.focusX, focusY: batch.focusY };
};

/** Hides the banner until the next loss or new incoming attack (tapping it jumps to the fight). */
export const dismissBattleWarning = (store: BattleWarningStore): void => {
  if (store.batch) store.batch.dismissed = true;
};

/** Live tile flashes, oldest first; expired ones are pruned. */
export const activeBattleFlashes = (store: BattleWarningStore, nowMs: number): BattleFlash[] => {
  const live: BattleFlash[] = [];
  for (const [key, flash] of store.flashes) {
    if (flash.until <= nowMs) store.flashes.delete(key);
    else live.push(flash);
  }
  return live;
};

/** 0..1 flash strength: three quick pulses that fade out over the flash's life. */
export const battleFlashIntensity = (flash: BattleFlash, nowMs: number): number => {
  const span = Math.max(1, flash.until - flash.startedAt);
  const t = Math.min(1, Math.max(0, (nowMs - flash.startedAt) / span));
  const pulse = 0.55 + 0.45 * Math.cos(t * Math.PI * 2 * 6);
  return (1 - t) * pulse;
};
