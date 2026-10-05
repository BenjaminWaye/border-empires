import { SEASON_ROLLOVER_CLOSE_CODE, SEASON_ROLLOVER_CLOSE_REASON } from "@border-empires/shared";

// Every reconnecting client costs the simulation a full login export, so the
// closes are spread out instead of landing in one tick.
export const SEASON_ROLLOVER_RESYNC_SPREAD_MS = 8_000;

type RolloverCandidate = { eventType: string; playerId: string; payload?: Record<string, unknown> };

// The simulation announces a rollover as a PLAYER_MESSAGE with no player id.
// The gateway's per-player routing finds no sockets for "" and drops it, so
// this has to be recognised before that routing runs.
export const isSeasonRolloverEvent = (event: RolloverCandidate): boolean =>
  event.eventType === "PLAYER_MESSAGE" && event.playerId === "" && event.payload?.type === "SEASON_ROLLOVER";

type ClosableSocket = { readonly readyState: number; readonly OPEN: number; close: (code: number, reason: string) => void };

type ScheduleDeps = {
  spreadMs?: number;
  random?: () => number;
  setTimer?: (task: () => void, delayMs: number) => void;
};

// unref'd so a pending close never holds the process open at shutdown.
const defaultSetTimer = (task: () => void, delayMs: number): void => {
  setTimeout(task, delayMs).unref();
};

// Closes every open socket once, each player's sockets all at the same moment
// and different players at random points inside the spread window. The group
// matters: while any one of a player's sockets stays open the gateway keeps that
// player's cached snapshot, so a client that reconnected before its other socket
// (or tab) closed would be sent the old season's state again.
// Returns how many sockets were scheduled.
export const scheduleSeasonRolloverResync = (socketGroups: Iterable<Iterable<ClosableSocket>>, deps: ScheduleDeps = {}): number => {
  const { spreadMs = SEASON_ROLLOVER_RESYNC_SPREAD_MS, random = Math.random, setTimer = defaultSetTimer } = deps;
  let scheduled = 0;
  for (const group of socketGroups) {
    const open = [...group].filter((socket) => socket.readyState === socket.OPEN);
    if (open.length === 0) continue;
    scheduled += open.length;
    setTimer(() => {
      for (const socket of open) {
        if (socket.readyState === socket.OPEN) socket.close(SEASON_ROLLOVER_CLOSE_CODE, SEASON_ROLLOVER_CLOSE_REASON);
      }
    }, Math.floor(random() * spreadMs));
  }
  return scheduled;
};
