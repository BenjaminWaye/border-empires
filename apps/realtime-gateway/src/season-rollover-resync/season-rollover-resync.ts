import { SEASON_ROLLOVER_CLOSE_CODE, SEASON_ROLLOVER_CLOSE_REASON } from "@border-empires/shared";

// Every reconnecting client costs the simulation a full login export, and the
// login gate only admits GATEWAY_MAX_CONCURRENT_BOOTSTRAPS (4) at a time with a
// queue of 50 behind it, so the closes are spread out instead of landing in one
// tick. The window grows with the number of connected players (about one
// login's worth of budget each) up to a cap, and never drops below the floor.
export const SEASON_ROLLOVER_RESYNC_MIN_SPREAD_MS = 8_000;
export const SEASON_ROLLOVER_RESYNC_MAX_SPREAD_MS = 60_000;
export const SEASON_ROLLOVER_RESYNC_MS_PER_PLAYER = 1_000;
// The simulation announces the rollover just before the gateway's own post-start
// hooks (social data, lobby roster) have been reset. No close may land before
// they have, or a very fast reconnect would be sent last season's social state.
export const SEASON_ROLLOVER_RESYNC_MIN_DELAY_MS = 1_500;

const NO_PLAYER = "";
const BROADCAST_PLAYER = "__broadcast__";

type RolloverCandidate = { eventType: string; playerId: string; payload?: Record<string, unknown> };

// The simulation announces a rollover as a PLAYER_MESSAGE addressed to nobody.
// The gateway's per-player routing finds no sockets for that and drops it, so
// this has to be recognised before that routing runs. Both spellings of "to
// everyone" are accepted so a harmless change to the simulation's address
// cannot silently stop the resync.
export const isSeasonRolloverEvent = (event: RolloverCandidate): boolean =>
  event.eventType === "PLAYER_MESSAGE" &&
  (event.playerId === NO_PLAYER || event.playerId === BROADCAST_PLAYER) &&
  event.payload?.type === "SEASON_ROLLOVER";

type ClosableSocket = { readonly readyState: number; readonly OPEN: number; close: (code: number, reason: string) => void };

type ScheduleDeps = {
  /** Fixed spread window; defaults to a window sized from the number of connected players. */
  spreadMs?: number;
  minDelayMs?: number;
  random?: () => number;
  setTimer?: (task: () => void, delayMs: number) => void;
};

// unref'd so a pending close never holds the process open at shutdown.
const defaultSetTimer = (task: () => void, delayMs: number): void => {
  setTimeout(task, delayMs).unref();
};

const envMs = (name: string): number | undefined => {
  const value = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
};

export const seasonRolloverSpreadMs = (playerCount: number): number =>
  Math.min(
    SEASON_ROLLOVER_RESYNC_MAX_SPREAD_MS,
    Math.max(SEASON_ROLLOVER_RESYNC_MIN_SPREAD_MS, playerCount * SEASON_ROLLOVER_RESYNC_MS_PER_PLAYER)
  );

// Closes every open socket once, each player's sockets all at the same moment
// and different players at random points inside the spread window. The group
// matters: while any one of a player's sockets stays open the gateway keeps that
// player's cached snapshot, so a client that reconnected before its other socket
// (or tab) closed would be sent the old season's state again.
// GATEWAY_SEASON_ROLLOVER_SPREAD_MS / GATEWAY_SEASON_ROLLOVER_MIN_DELAY_MS
// override the window and the floor (used by tests; 0 closes immediately).
// Returns how many sockets were scheduled.
export const scheduleSeasonRolloverResync = (socketGroups: Iterable<Iterable<ClosableSocket>>, deps: ScheduleDeps = {}): number => {
  const groups = [...socketGroups].map((group) => [...group].filter((socket) => socket.readyState === socket.OPEN)).filter((open) => open.length > 0);
  const spreadMs = deps.spreadMs ?? envMs("GATEWAY_SEASON_ROLLOVER_SPREAD_MS") ?? seasonRolloverSpreadMs(groups.length);
  const minDelayMs = deps.minDelayMs ?? envMs("GATEWAY_SEASON_ROLLOVER_MIN_DELAY_MS") ?? SEASON_ROLLOVER_RESYNC_MIN_DELAY_MS;
  const { random = Math.random, setTimer = defaultSetTimer } = deps;
  let scheduled = 0;
  for (const open of groups) {
    scheduled += open.length;
    setTimer(() => {
      for (const socket of open) {
        if (socket.readyState === socket.OPEN) socket.close(SEASON_ROLLOVER_CLOSE_CODE, SEASON_ROLLOVER_CLOSE_REASON);
      }
    }, minDelayMs + Math.floor(random() * spreadMs));
  }
  return scheduled;
};
