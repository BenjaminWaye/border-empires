/**
 * Routine-fire notifier for lag alerts.
 *
 * Pushes a Claude Code routine (via its API trigger) once per lag
 * *incident*, carrying the same rich text the Slack message gets (metrics
 * snapshot, recent events, world stats) so the fired session starts with
 * real evidence instead of a bare "something's slow" ping.
 *
 * Edge-triggered, not time-cooldown-based: `notify()` is expected to be
 * called on every underlying breach (each already spaced out by the
 * upstream alerter's own dedupe window — ~5 min for SlackAlerter, ~30s for
 * SlowLoginAlerter), but only the *first* breach of an incident fires the
 * routine. Later breaches update the "still ongoing" clock without spawning
 * another session — the /fire API always starts a brand-new session, so
 * there is no way to append to the one already investigating. The incident
 * is considered over, and the next breach starts a fresh session, only
 * after `resolveAfterMs` passes with no breach at all (default 20 min,
 * comfortably longer than the upstream dedupe cadence so a sustained,
 * hours-long lag spell still spawns exactly one session).
 *
 * Fire-and-forget: `notify()` returns immediately, the POST runs in the
 * background with a hard timeout. No-op when fireUrl/fireToken are unset
 * (local/test runs, or before the API trigger has been configured).
 */

export type RoutineAlertOptions = {
  /** Routine API-trigger fire URL, e.g. https://api.anthropic.com/v1/claude_code/routines/<id>/fire */
  fireUrl?: string;
  /** Bearer token for the routine's API trigger. */
  fireToken?: string;
  /** Quiet period (ms) with no breach before the next breach counts as a new
   * incident and fires a fresh session. Default 1_200_000 (20 min). */
  resolveAfterMs?: number;
  fetchImpl?: typeof fetch;
  log?: { error?: (payload: unknown, message?: string) => void };
  now?: () => number;
};

export type RoutineAlertNotifier = {
  /** Report a breach. Fires the routine only if no incident is currently open. */
  notify: (text: string) => void;
};

const DEFAULT_RESOLVE_AFTER_MS = 1_200_000; // 20 min
const POST_TIMEOUT_MS = 5_000;
const ROUTINE_BETA_HEADER = "experimental-cc-routine-2026-04-01";

export const createRoutineAlertNotifier = (options: RoutineAlertOptions): RoutineAlertNotifier => {
  const fireUrl = options.fireUrl?.trim();
  const fireToken = options.fireToken?.trim();
  const resolveAfterMs = options.resolveAfterMs ?? DEFAULT_RESOLVE_AFTER_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  const log = options.log;
  // Incident state: an incident is "open" from the first breach until
  // resolveAfterMs elapses with no further breach.
  let incidentOpen = false;
  let lastBreachAt = 0;

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
      if (incidentOpen && nowMs - lastBreachAt >= resolveAfterMs) incidentOpen = false;
      lastBreachAt = nowMs;
      if (incidentOpen) return;
      incidentOpen = true;
      void post(text);
    }
  };
};

/** Singleton built from ROUTINE_LAG_ALERT_FIRE_URL/TOKEN env vars — a no-op notifier
 * until those are set. Shared by slack-alerts.ts and slow-login-alert.ts so both
 * lag signals share one incident clock instead of opening two incidents at once. */
export const gatewayRoutineAlertNotifier: RoutineAlertNotifier = createRoutineAlertNotifier({
  ...(process.env.ROUTINE_LAG_ALERT_FIRE_URL ? { fireUrl: process.env.ROUTINE_LAG_ALERT_FIRE_URL } : {}),
  ...(process.env.ROUTINE_LAG_ALERT_FIRE_TOKEN ? { fireToken: process.env.ROUTINE_LAG_ALERT_FIRE_TOKEN } : {})
});
