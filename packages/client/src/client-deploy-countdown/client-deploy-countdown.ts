import type { ClientState } from "../client-state/client-state.js";
import { DEPLOY_WAIT_DETAIL } from "../client-auth-deploy-wait/client-auth-deploy-wait.js";

// deploy/bin/deploy writes /__deploy_status.json into the live static client
// just before the game server restarts, and deletes it once /health is ok.
// While the realtime connection is down the client reads it (see
// client-deploy-status-poller.ts) to show how long the restart should take.
export type DeployStatus = {
  /** Unix ms when the server restart began (server clock). */
  startedAt: number;
  /** Median of recent restart durations, from the deploy host. */
  expectedSeconds: number;
};

export const DEPLOY_STATUS_PATH = "/__deploy_status.json";
/** A status file older than this is a leftover, not a running deploy. */
export const DEPLOY_STATUS_MAX_AGE_MS = 15 * 60_000;
const DEFAULT_EXPECTED_SECONDS = 120;
const MAX_EXPECTED_SECONDS = 3_600;
/** Tolerated client-behind-server clock skew before a start time reads as bogus. */
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export const DEPLOY_COUNTDOWN_ALMOST_READY = "Almost ready…";
const COUNTDOWN_PREFIX = "Server update · back in ~";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** A running deploy, or null for a missing, stale, finished or malformed file. */
export const parseDeployStatus = (raw: unknown, now: number): DeployStatus | null => {
  if (!isRecord(raw) || raw.state !== "deploying") return null;
  const startedAt = raw.startedAt;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt) || startedAt <= 0) return null;
  if (now - startedAt >= DEPLOY_STATUS_MAX_AGE_MS || startedAt - now > MAX_FUTURE_SKEW_MS) return null;
  const expected = raw.expectedSeconds;
  const expectedSeconds =
    typeof expected === "number" && Number.isFinite(expected) && expected > 0
      ? Math.min(MAX_EXPECTED_SECONDS, Math.round(expected))
      : DEFAULT_EXPECTED_SECONDS;
  return { startedAt, expectedSeconds };
};

/** "Server update · back in ~1:20", then "Almost ready…" once the estimate runs out. */
export const formatDeployCountdown = (status: DeployStatus, now: number): string => {
  const remainingMs = status.startedAt + status.expectedSeconds * 1_000 - now;
  if (remainingMs <= 0) return DEPLOY_COUNTDOWN_ALMOST_READY;
  const totalSeconds = Math.ceil(remainingMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${COUNTDOWN_PREFIX}${minutes}:${seconds}`;
};

const isDeployCountdownText = (text: string): boolean =>
  text.startsWith(COUNTDOWN_PREFIX) || text === DEPLOY_COUNTDOWN_ALMOST_READY;

/**
 * The countdown line while offline during a deploy, else null. Once the socket
 * opens the server is back and the normal sign-in progress copy takes over.
 */
export const deployCountdownLabel = (
  state: Pick<ClientState, "connection"> & Partial<Pick<ClientState, "deployStatus">>,
  now: number = Date.now()
): string | null =>
  state.deployStatus && (state.connection === "disconnected" || state.connection === "connecting")
    ? formatDeployCountdown(state.deployStatus, now)
    : null;

/**
 * Puts the countdown on the login overlay: the waiting card's title when it is
 * up (new player tapping "Enter the map", or a sign-in in progress), else the
 * sign-in panel's status line. Runs after the overlay's own sync so it only
 * replaces copy; the card's Retry button and reconnect logic are untouched.
 */
export const syncDeployCountdownCopy = (
  state: Pick<ClientState, "connection" | "deployStatus" | "authBusy" | "authError" | "authSessionReady">,
  deps: {
    titleEl: HTMLElement;
    copyEl: HTMLElement;
    statusEl: HTMLElement;
    setAuthStatus: (message: string) => void;
  },
  now: number = Date.now()
): void => {
  const label = deployCountdownLabel(state, now);
  const onCard = label !== null && state.authBusy && !state.authError;
  if (onCard) {
    deps.titleEl.textContent = label;
    deps.copyEl.textContent = DEPLOY_WAIT_DETAIL;
    deps.titleEl.dataset.countdown = "true";
  } else {
    delete deps.titleEl.dataset.countdown;
  }
  const onPanel = label !== null && !state.authBusy && !state.authError && !state.authSessionReady;
  const currentStatus = deps.statusEl.textContent?.trim() ?? "";
  if (onPanel) {
    if (currentStatus !== label) deps.setAuthStatus(label);
  } else if (isDeployCountdownText(currentStatus)) {
    deps.setAuthStatus("");
  }
};
