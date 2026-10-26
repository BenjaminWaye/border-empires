// Server clock alignment. The server sends absolute deadlines (resolvesAt,
// transitEndsAt) in its own clock, while every client timer compares them
// against Date.now(). A device clock that is off by tens of seconds (seen in
// prod: an iPhone 43.6s fast) made each EXPAND look overdue the moment it was
// accepted, so the combat-result timeout fired, rolled back the optimistic
// tile and then dropped the real FRONTIER_RESULT as a command mismatch.
//
// Messages that carry deadlines also carry `serverNow`. We keep an estimate
// of (server clock - local clock) and rewrite those deadlines into local time
// as the message is parsed, so the rest of the client keeps using Date.now().
import { parseIncomingMessage } from "../client-init-transfer/client-login-timeline.js";

/** Deadline fields stamped alongside `serverNow` that are rewritten to local time. */
export const SERVER_DEADLINE_FIELDS = ["resolvesAt", "transitEndsAt"] as const;

// One-way latency only ever makes serverNow look older than it is, so the
// largest recent sample is the closest to the true offset. A bounded window
// lets the estimate follow the device clock if the player corrects it.
const OFFSET_SAMPLE_WINDOW = 16;

export type ServerClock = {
  /** Records a server timestamp received at local time `receivedAt`. */
  observe: (serverNow: number, receivedAt: number) => void;
  /** Best estimate of server clock minus local clock, in ms (0 before any sample). */
  offsetMs: () => number;
  /** Converts a server-clock timestamp to the local clock. */
  toLocal: (serverTime: number) => number;
};

export const createServerClock = (): ServerClock => {
  const samples: number[] = [];
  let best = 0;
  return {
    observe: (serverNow, receivedAt) => {
      if (!Number.isFinite(serverNow) || !Number.isFinite(receivedAt)) return;
      samples.push(serverNow - receivedAt);
      if (samples.length > OFFSET_SAMPLE_WINDOW) samples.shift();
      best = Math.max(...samples);
    },
    offsetMs: () => best,
    toLocal: (serverTime) => serverTime - best
  };
};

/**
 * When `msg` carries `serverNow`, records the offset and rewrites its deadline
 * fields into local time. Messages without `serverNow` are left untouched.
 */
export const alignServerDeadlines = (
  msg: Record<string, unknown>,
  clock: ServerClock,
  receivedAt: number
): Record<string, unknown> => {
  if (typeof msg.serverNow !== "number") return msg;
  clock.observe(msg.serverNow, receivedAt);
  for (const field of SERVER_DEADLINE_FIELDS) {
    const value = msg[field];
    if (typeof value === "number" && Number.isFinite(value)) msg[field] = clock.toLocal(value);
  }
  return msg;
};

export const serverClock = createServerClock();

/** Parses a socket message and aligns its server deadlines to the local clock. */
export const parseServerMessage = (data: string): Record<string, unknown> =>
  alignServerDeadlines(parseIncomingMessage(data), serverClock, Date.now());
