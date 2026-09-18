import { storageGet, storageSet } from "../client-state/client-state.js";
import { buildWaystationActivationInfo } from "./client-waystation-activation-detect.js";
import { showWaystationActivationOverlay, type WaystationActivationInfo } from "./client-waystation-activation.js";
import type { ClientEventLogEntry } from "../client-event-log-html.js";

// Waystation activation normally pops a hero overlay via the live
// TILE_DELTA_BATCH path (client-waystation-activation-detect.ts), but that
// only reaches a client connected at the exact moment it happens -- an
// activation that lands while the player is offline (e.g. auto-settle onto a
// dormant waystation tile) previously left them with no explanation of what
// they got. The server now also records a WAYSTATION_ACTIVATED entry on the
// player's durable eventLog (packages/game-domain/src/index/player-event-log.ts),
// delivered on every INIT/reconnect regardless of device -- this module
// watches for those entries and shows the same popup once per activation.
//
// The Activity Feed entry for a WAYSTATION_ACTIVATED eventLog item always
// renders regardless (see feedEntryForEventLogEntry), so the player is never
// left with zero indication -- this popup is a best-effort enhancement on
// top of that guaranteed feed line, gated per-device so a player who opens
// the game on two devices around the same time might get the popup on
// whichever loads first and just the feed line on the other. That tradeoff
// is deliberate: making the popup itself exactly-once-cross-device would
// need a server-side "delivered" ack round-trip for a purely cosmetic flourish.
const STORAGE_KEY = (playerId: string): string => `be:waystation:popup-shown:${playerId}`;
const MAX_STORED = 500;
// Bounds the OUTER cache (distinct players seen this tab session), not just
// each player's id set -- without this, a long-lived tab that logs in as
// many different accounts (shared/dev/QA machine) would grow one Set per
// playerId forever. Map iteration order is insertion order, so the oldest
// entry is evicted first -- a normal single-player session never comes
// close to this, so eviction never affects real gameplay.
const MAX_PLAYERS_TRACKED = 20;

type CatchupState = { me: string };

// Keyed by playerId rather than stored on ClientState -- this is purely a
// localStorage-backed "have we shown this popup before" cache, so a
// module-level map (one entry per player seen this page load) avoids
// growing the already-oversized ClientState default object.
const shownIdsByPlayer = new Map<string, Set<string>>();

const shownIdsFor = (playerId: string): Set<string> => {
  let ids = shownIdsByPlayer.get(playerId);
  if (ids) return ids;
  ids = new Set<string>();
  try {
    const raw = storageGet(STORAGE_KEY(playerId));
    const parsed: unknown = JSON.parse(raw ?? "[]");
    const stored = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    for (const id of stored) ids.add(id);
  } catch {
    storageSet(STORAGE_KEY(playerId), "[]");
  }
  if (shownIdsByPlayer.size >= MAX_PLAYERS_TRACKED) {
    const oldestPlayerId = shownIdsByPlayer.keys().next().value;
    if (oldestPlayerId !== undefined) shownIdsByPlayer.delete(oldestPlayerId);
  }
  shownIdsByPlayer.set(playerId, ids);
  return ids;
};

/** Checks whether a waystation's popup has already been shown to the player, without marking it shown -- lets the live TILE_DELTA_BATCH path (client-waystation-activation-detect.ts) defer to whichever path (live or eventLog catch-up) got there first, instead of both independently deciding to show it. */
export const hasWaystationActivationBeenShown = (state: CatchupState, x: number, y: number): boolean =>
  Boolean(state.me) && shownIdsFor(state.me).has(`${x},${y}`);

const persist = (playerId: string, ids: Set<string>): void => {
  const entries = [...ids];
  storageSet(STORAGE_KEY(playerId), JSON.stringify(entries.length > MAX_STORED ? entries.slice(-MAX_STORED) : entries));
};

/**
 * Marks a waystation's popup as already shown to the player (by tile
 * coordinate, not eventLog id -- see below for why), so neither this
 * player's other devices' catch-up scan nor a later-arriving eventLog entry
 * for the same activation re-shows it. Call this whenever the live
 * TILE_DELTA_BATCH popup fires (client-waystation-activation-detect.ts).
 */
export const markWaystationActivationSeen = (state: CatchupState, x: number, y: number): void => {
  if (!state.me) return;
  const ids = shownIdsFor(state.me);
  ids.add(`${x},${y}`);
  persist(state.me, ids);
};

/**
 * Shows the activation popup for a WAYSTATION_ACTIVATED eventLog entry the
 * player hasn't seen a popup for yet on this device, then marks it shown.
 * Call once per incoming entry, live or backfilled -- a no-op for any other
 * event type or an already-shown tile.
 *
 * Keyed by (x, y) rather than the eventLog entry's own id: a waystation
 * activates at most once ever (a permanent one-shot -- see
 * runtime-waystation-activation.ts), so the tile coordinate is just as
 * unique as the entry id, and using it lets markWaystationActivationSeen
 * (called from the live path, which never sees the eventLog entry) block
 * this function from also popping the same activation a second time when
 * its eventLog entry arrives on a later INIT.
 */
export const notifyWaystationActivationEventLogEntry = (
  entry: ClientEventLogEntry,
  state: CatchupState,
  deps: {
    techCatalog: ReadonlyArray<{ id: string; name: string }>;
    onJumpToLocation: (x: number, y: number) => void;
    onViewTech?: (techId: string) => void;
    showOverlay?: (info: WaystationActivationInfo) => void;
  }
): void => {
  if (entry.type !== "WAYSTATION_ACTIVATED" || !state.me) return;
  const x = entry.x ?? 0;
  const y = entry.y ?? 0;
  const key = `${x},${y}`;
  const ids = shownIdsFor(state.me);
  if (ids.has(key)) return;
  const info = buildWaystationActivationInfo(
    { activated: true, activatedByPlayerId: state.me, ...entry },
    x,
    y,
    state.me,
    deps.techCatalog,
    () => deps.onJumpToLocation(x, y),
    deps.onViewTech
  );
  if (!info) return;
  ids.add(key);
  persist(state.me, ids);
  const showOverlay = deps.showOverlay ?? showWaystationActivationOverlay;
  showOverlay(info);
};

/** Runs notifyWaystationActivationEventLogEntry over a whole eventLog batch -- the shape client-network.ts's single INIT/PLAYER_UPDATE eventLog handler needs, whether it's a first-sync backfill or a later incremental sync. */
export const notifyWaystationActivationsFromEventLog = (
  entries: ReadonlyArray<ClientEventLogEntry>,
  state: CatchupState,
  deps: {
    techCatalog: ReadonlyArray<{ id: string; name: string }>;
    onJumpToLocation: (x: number, y: number) => void;
    onViewTech?: (techId: string) => void;
    showOverlay?: (info: WaystationActivationInfo) => void;
  }
): void => {
  for (const entry of entries) notifyWaystationActivationEventLogEntry(entry, state, deps);
};

/** State fields the deps built by eventLogDepsFromClientState below need to read/mutate -- kept minimal (not a `ClientState` import) so this module stays cheap to test with a plain object literal. */
export type WaystationEventLogClientState = CatchupState & {
  techCatalog: ReadonlyArray<{ id: string; name: string }>;
  camX: number;
  camY: number;
  camSubX: number;
  camSubY: number;
  selected: { x: number; y: number } | undefined;
  techUiSelectedId: string;
  techDetailOpen: boolean;
  domainDetailOpen: boolean;
};

/**
 * Builds the "jump to location" / "open tech panel" deps notifyWaystationActivationsFromEventLog
 * needs, straight off a ClientState-shaped object. Both call sites
 * (client-network-init-message.ts's INIT handler and client-network.ts's
 * later live-resync handler) built this exact same object inline before --
 * factored out here so the shared closure logic lives in one place instead
 * of two, and so each call site only needs one short line.
 */
export const eventLogDepsFromClientState = (
  state: WaystationEventLogClientState,
  requestViewRefresh: (radius: number, force: boolean) => void,
  renderHud: () => void
): {
  techCatalog: ReadonlyArray<{ id: string; name: string }>;
  onJumpToLocation: (x: number, y: number) => void;
  onViewTech: (techId: string) => void;
} => ({
  techCatalog: state.techCatalog,
  onJumpToLocation: (x, y) => {
    state.camX = x;
    state.camY = y;
    state.camSubX = 0;
    state.camSubY = 0;
    state.selected = { x, y };
    requestViewRefresh(1, true);
  },
  onViewTech: (techId) => {
    state.techUiSelectedId = techId;
    state.techDetailOpen = true;
    state.domainDetailOpen = false;
    renderHud();
  }
});
