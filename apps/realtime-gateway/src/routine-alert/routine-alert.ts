/**
 * Routine-fire notifier for lag alerts.
 *
 * Pushes a Claude Code routine (via its API trigger) the moment a
 * lag-related SlackAlerter/SlowLoginAlerter threshold trips, carrying the
 * same rich text payload the Slack message gets (metrics snapshot, recent
 * events, world stats) so the fired session starts with real evidence
 * instead of a bare "something's slow" ping.
 *
 * Fire-and-forget, same shape as the Slack alerters: `notify()` returns
 * immediately, the POST runs in the background with a hard timeout, and a
 * cooldown prevents flooding a fresh session per event. No-op when
 * fireUrl/fireToken are unset (local/test runs, or before the API trigger
 * has been configured on the routine).
 */

export type RoutineAlertOptions = {
  /** Routine API-trigger fire URL, e.g. https://api.anthropic.com/v1/claude_code/routines/<id>/fire */
  fireUrl?: string;
  /** Bearer token for the routine's API trigger. */
  fireToken?: string;
  /** Minimum interval between routine fires (ms). Default 600_000 (10 min) — a fresh
   * investigation session per flap would be wasteful; the routine's own diagnosis
   * already covers "is this still happening" once it starts. */
  cooldownMs?: number;
  fetchImpl?: typeof fetch;
  log?: { error?: (payload: unknown, message?: string) => void };
  now?: () => number;
};

export type RoutineAlertNotifier = {
  /** Fire the routine with the given alert text, subject to cooldown. */
  notify: (text: string) => void;
};

const DEFAULT_COOLDOWN_MS = 600_000; // 10 min
const POST_TIMEOUT_MS = 5_000;
const ROUTINE_BETA_HEADER = "experimental-cc-routine-2026-04-01";

export const createRoutineAlertNotifier = (options: RoutineAlertOptions): RoutineAlertNotifier => {
  const fireUrl = options.fireUrl?.trim();
  const fireToken = options.fireToken?.trim();
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  const log = options.log;
  let lastFiredAt = 0;

  const post = async (text: string): Promise<void> => {
    if (!fireUrl || !fireToken || !fetchImpl) return;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), POST_TIMEOUT_MS);
    try {
      const res = await fetchImpl(fireUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fireToken}`,
          "anthropic-beta": ROUTINE_BETA_HEADER,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({ text }),
        signal: ac.signal
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log?.error?.({ status: res.status, body: body.slice(0, 200) }, "routine-alert fire returned non-2xx");
      }
    } catch (err) {
      log?.error?.({ error: err instanceof Error ? err.message : String(err) }, "routine-alert fire failed");
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    notify(text: string): void {
      if (!fireUrl || !fireToken) return;
      const nowMs = now();
      if (lastFiredAt > 0 && nowMs - lastFiredAt < cooldownMs) return;
      lastFiredAt = nowMs;
      void post(text);
    }
  };
};

/** Singleton built from ROUTINE_LAG_ALERT_FIRE_URL/TOKEN env vars — a no-op notifier
 * until those are set. Shared by slack-alerts.ts and slow-login-alert.ts so both
 * lag signals share one cooldown clock instead of firing two routine sessions at once. */
export const gatewayRoutineAlertNotifier: RoutineAlertNotifier = createRoutineAlertNotifier({
  ...(process.env.ROUTINE_LAG_ALERT_FIRE_URL ? { fireUrl: process.env.ROUTINE_LAG_ALERT_FIRE_URL } : {}),
  ...(process.env.ROUTINE_LAG_ALERT_FIRE_TOKEN ? { fireToken: process.env.ROUTINE_LAG_ALERT_FIRE_TOKEN } : {})
});
