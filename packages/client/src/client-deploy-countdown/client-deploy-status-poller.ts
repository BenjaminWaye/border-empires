import type { ClientState } from "../client-state/client-state.js";
import { DEPLOY_STATUS_PATH, parseDeployStatus } from "./client-deploy-countdown.js";

export const DEPLOY_STATUS_POLL_MS = 15_000;
export const DEPLOY_STATUS_FETCH_TIMEOUT_MS = 4_000;
const COUNTDOWN_TICK_MS = 1_000;

/** Resolves to the parsed JSON body, or null for any miss (404, 502, timeout, bad JSON). */
export type DeployStatusFetcher = () => Promise<unknown>;

export interface DeployStatusPoller {
  /** Begins polling (idempotent); call whenever the realtime connection drops. */
  start(): void;
  /** Stops polling and clears the countdown; call once the session is back. */
  stop(): void;
}

/**
 * Reads the status file from the page's own origin: Caddy serves it from the
 * live client release, which stays up while the game server restarts. Native
 * wrappers (non-http origins) have no such file and fall back to plain
 * "Reconnecting…".
 */
export const createDefaultDeployStatusFetcher = (): DeployStatusFetcher | null => {
  if (typeof fetch !== "function" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return null;
  return async () => {
    const controller = typeof AbortController === "function" ? new AbortController() : undefined;
    const timer = setTimeout(() => controller?.abort(), DEPLOY_STATUS_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${location.origin}${DEPLOY_STATUS_PATH}?t=${Date.now()}`, {
        cache: "no-store",
        credentials: "omit",
        ...(controller ? { signal: controller.signal } : {})
      });
      if (!response.ok) return null;
      return (await response.json()) as unknown;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
};

export const createDeployStatusPoller = (deps: {
  state: Pick<ClientState, "deployStatus">;
  fetchStatus: DeployStatusFetcher | null;
  /** Re-renders every surface that shows the countdown. */
  onChange: () => void;
  now?: () => number;
}): DeployStatusPoller => {
  const now = deps.now ?? Date.now;
  let running = false;
  let generation = 0;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;

  const syncTick = (): void => {
    if (deps.state.deployStatus && running && tickTimer === undefined) {
      tickTimer = setInterval(deps.onChange, COUNTDOWN_TICK_MS);
    } else if ((!deps.state.deployStatus || !running) && tickTimer !== undefined) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }
  };

  const poll = async (): Promise<void> => {
    const fetchStatus = deps.fetchStatus;
    if (!fetchStatus) return;
    const ownGeneration = generation;
    let raw: unknown = null;
    try {
      raw = await fetchStatus();
    } catch {
      raw = null;
    }
    // The session came back (or a new outage began) while this was in flight.
    if (!running || ownGeneration !== generation) return;
    const next = parseDeployStatus(raw, now());
    const previous = deps.state.deployStatus;
    deps.state.deployStatus = next;
    syncTick();
    if (previous?.startedAt !== next?.startedAt || previous?.expectedSeconds !== next?.expectedSeconds) deps.onChange();
  };

  return {
    start(): void {
      if (running || !deps.fetchStatus) return;
      running = true;
      generation += 1;
      void poll();
      pollTimer = setInterval(() => void poll(), DEPLOY_STATUS_POLL_MS);
    },
    stop(): void {
      if (!running) return;
      running = false;
      generation += 1;
      if (pollTimer !== undefined) clearInterval(pollTimer);
      pollTimer = undefined;
      const hadStatus = deps.state.deployStatus !== null;
      deps.state.deployStatus = null;
      syncTick();
      if (hadStatus) deps.onChange();
    }
  };
};
