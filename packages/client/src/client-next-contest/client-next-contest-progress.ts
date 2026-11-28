// Live progress for "Starting the next Sector Contest…". Building the next
// world can take a minute on a busy server, and the button alone gave no sign
// that anything was happening. Two stages are shown with a running clock:
//   building: the gateway announced `starting` (or the admin force-started);
//   ready:    the gateway sent SEASON_ROLLOVER_READY with this socket's
//             reconnect delay (sockets are closed over a spread window).
// After that the socket closes and the reconnect banner takes over.
import type { ClientState } from "../client-state/client-state.js";

export const CONTEST_BUILD_SLOW_MS = 90_000;
const TICK_MS = 1_000;

type ProgressState = Pick<ClientState, "seasonEndStarting" | "seasonStartVoted">;

type Progress = { startedAt: number | undefined; reconnectAt: number | undefined };
const progress: Progress = { startedAt: undefined, reconnectAt: undefined };

const clock = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Keeps the stage timestamps in step with `seasonEndStarting`. */
const sync = (state: ProgressState, now: number): void => {
  if (!state.seasonEndStarting) {
    progress.startedAt = undefined;
    progress.reconnectAt = undefined;
    return;
  }
  progress.startedAt ??= now;
};

/** SEASON_ROLLOVER_READY: the new world is up; this socket closes in `reconnectInMs`. */
export const applyContestRolloverReady = (state: ProgressState, msg: Record<string, unknown>, now = Date.now()): void => {
  const delay = typeof msg.reconnectInMs === "number" && Number.isFinite(msg.reconnectInMs) ? Math.max(0, msg.reconnectInMs) : 0;
  sync(state, now);
  if (state.seasonEndStarting) progress.reconnectAt = now + delay;
};

/** The progress line, or undefined when no start is under way for this House. */
export const contestProgressText = (state: ProgressState, now = Date.now()): string | undefined => {
  sync(state, now);
  if (!state.seasonEndStarting || !state.seasonStartVoted || progress.startedAt === undefined) return undefined;
  if (progress.reconnectAt !== undefined) {
    const left = Math.ceil((progress.reconnectAt - now) / 1000);
    return left > 0 ? `World ready · joining in ${left}s` : "World ready · joining…";
  }
  const elapsed = now - progress.startedAt;
  return elapsed >= CONTEST_BUILD_SLOW_MS
    ? `Still building the next world · ${clock(elapsed)} · taking longer than usual`
    : `Building the next world · ${clock(elapsed)}`;
};

export const resetContestProgressForTests = (): void => {
  progress.startedAt = undefined;
  progress.reconnectAt = undefined;
};

let ticker: ReturnType<typeof setInterval> | undefined;

/** Refreshes `[data-se-progress]` once a second while it is on screen. */
export const ensureContestProgressTicker = (root: ParentNode, state: ProgressState): void => {
  const paint = (): boolean => {
    const el = root.querySelector<HTMLElement>("[data-se-progress]");
    const text = el ? contestProgressText(state) : undefined;
    if (!el || text === undefined) {
      if (el) el.textContent = "";
      return false;
    }
    if (el.textContent !== text) el.textContent = text;
    return true;
  };
  if (!paint()) {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
    return;
  }
  if (ticker !== undefined) return;
  ticker = setInterval(() => {
    if (paint()) return;
    clearInterval(ticker);
    ticker = undefined;
  }, TICK_MS);
};
