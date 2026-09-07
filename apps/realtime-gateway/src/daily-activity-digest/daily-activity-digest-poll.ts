import type { ActivityApiResponse } from "@border-empires/game-domain";

import { buildDailyActivityDigestSlackText } from "./daily-activity-digest-message.js";

const DIGEST_FIRE_HOUR_STOCKHOLM = 7;
const RETRYABLE_STATUS_MIN = 500;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000];

export type StartDailyActivityDigestPollDeps = {
  /** The gateway's own listen address, e.g. "http://127.0.0.1:8080". */
  getBaseUrl: () => string;
  webhookUrl?: string;
  fetchImpl?: typeof fetch;
  log?: { info?: (payload: unknown, message?: string) => void; error?: (payload: unknown, message?: string) => void };
  /** Override Date.now for tests. */
  now?: () => number;
  /** Override setTimeout for tests. */
  scheduleTimeout?: (fn: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  /** Override sleep for tests (used between retries). */
  sleep?: (ms: number) => Promise<void>;
};

// Ported off GitHub Actions' `schedule:` cron (see the now-removed
// .github/workflows/daily-activity-digest.yml schedule trigger): GitHub
// deprioritizes cron-triggered workflow runs under scheduler load, which
// drifted this digest's actual post time later and later (a run nominally
// set for 04:00 UTC was landing past 08:00 UTC some days). Running the same
// job as an in-process timer on the always-on gateway process removes that
// queueing hop entirely -- it hits the gateway's own /api/activity route
// over loopback instead of GitHub Actions fetching it over the public
// internet, and posts straight to Slack.
//
// Recomputes the next 07:00 Europe/Stockholm fire time (rather than a fixed
// 24h interval) on every reschedule so DST changeovers self-correct instead
// of drifting an hour off twice a year.
const msUntilNextStockholm7am = (nowMs: number): number => {
  // Intl gives us the Stockholm wall-clock time for "now"; from that we can
  // work out how many ms until the next 07:00 in that wall clock without
  // hand-rolling DST/offset math.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(nowMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const secondsSinceMidnightStockholm = get("hour") * 3600 + get("minute") * 60 + get("second");
  const targetSecondsSinceMidnight = DIGEST_FIRE_HOUR_STOCKHOLM * 3600;
  let deltaSeconds = targetSecondsSinceMidnight - secondsSinceMidnightStockholm;
  if (deltaSeconds <= 0) deltaSeconds += 24 * 3600;
  return deltaSeconds * 1000;
};

// The gateway can be mid-restart when the timer fires; retry a couple of
// times with a short backoff before giving up for the day, same as the old
// script's fetchActivityWithRetry.
const fetchActivityWithRetry = async (
  url: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>
): Promise<Response> => {
  let lastRes: Response;
  for (let attempt = 0; attempt <= DEFAULT_RETRY_DELAYS_MS.length; attempt++) {
    lastRes = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    if (lastRes.ok || lastRes.status < RETRYABLE_STATUS_MIN) return lastRes;
    if (attempt < DEFAULT_RETRY_DELAYS_MS.length) await sleep(DEFAULT_RETRY_DELAYS_MS[attempt]!);
  }
  return lastRes!;
};

export const startDailyActivityDigestPoll = (deps: StartDailyActivityDigestPollDeps): { stop: () => void } => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const scheduleTimeout = deps.scheduleTimeout ?? ((fn, delayMs) => setTimeout(fn, delayMs));
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => Date.now());
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fireDigest = async (): Promise<void> => {
    if (!deps.webhookUrl) return;
    try {
      const activityRes = await fetchActivityWithRetry(`${deps.getBaseUrl()}/api/activity`, fetchImpl, sleep);
      if (!activityRes.ok) {
        deps.log?.error?.({ status: activityRes.status }, "daily activity digest: GET /api/activity failed");
        return;
      }
      const data = (await activityRes.json()) as ActivityApiResponse;
      const text = buildDailyActivityDigestSlackText(data);
      const slackRes = await fetchImpl(deps.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!slackRes.ok) {
        const body = await slackRes.text().catch(() => "");
        deps.log?.error?.({ status: slackRes.status, body: body.slice(0, 200) }, "daily activity digest: Slack webhook returned an error");
        return;
      }
      deps.log?.info?.({}, "daily activity digest posted to Slack");
    } catch (error) {
      deps.log?.error?.({ err: error }, "daily activity digest failed");
    }
  };

  const scheduleNext = (): void => {
    if (stopped) return;
    const delayMs = msUntilNextStockholm7am(now());
    timer = scheduleTimeout(() => {
      void fireDigest().finally(scheduleNext);
    }, delayMs);
  };

  scheduleNext();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
};
