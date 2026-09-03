#!/usr/bin/env node
// Fetches GET /api/activity from a running gateway and posts a curated
// daily highlights digest to Slack via an incoming webhook. Scheduled by
// .github/workflows/daily-activity-digest.yml (see that file for the cron
// and secret wiring — same webhook-POST pattern as slack-alerts.ts and the
// nightly-load-harness Slack notify step).
//
// Usage: ACTIVITY_API_URL=... SLACK_WEBHOOK_URL=... node scripts/daily-activity-digest.mjs

const RETRYABLE_STATUS_MIN = 500;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000];

// The gateway occasionally returns a transient 503 (e.g. mid-deploy, cold
// start) — retry those a couple of times with a short backoff before giving
// up. A 4xx is never retried: it means the request itself is wrong, and
// retrying it would just burn the same result three times.
export async function fetchActivityWithRetry(url, { retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastRes;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    lastRes = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (lastRes.ok || lastRes.status < RETRYABLE_STATUS_MIN) return lastRes;
    if (attempt < retryDelaysMs.length) {
      console.error(`GET ${url} returned ${lastRes.status} (attempt ${attempt + 1}/${retryDelaysMs.length + 1}) — retrying in ${retryDelaysMs[attempt]}ms`);
      await sleep(retryDelaysMs[attempt]);
    }
  }
  return lastRes;
}

async function main() {
  const activityApiUrl = process.env.ACTIVITY_API_URL;
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!activityApiUrl) {
    console.error("ACTIVITY_API_URL is required.");
    process.exit(1);
  }
  if (!slackWebhookUrl) {
    console.error("SLACK_WEBHOOK_URL is required.");
    process.exit(1);
  }

  const res = await fetchActivityWithRetry(activityApiUrl);
  if (!res.ok) {
    console.error(`GET ${activityApiUrl} returned ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();

  const lines = [];
  lines.push(`*Border Empires — Today's Story* (${new Date(data.generatedAt).toDateString()})`);

  // dailyStory is the whole point of this digest: narrated headlines in the
  // game's own in-fiction voice (see apps/realtime-gateway/src/activity-api/
  // daily-story.ts), ranked most-significant first — not a stat dump. Every
  // name in it is already resolved server-side.
  if (data.dailyStory.length > 0) {
    lines.push("");
    for (const event of data.dailyStory) {
      lines.push(`*${event.headline}.* ${event.text}`);
    }
  } else {
    lines.push("");
    lines.push("Quiet day — nothing worth reporting.");
  }

  // Power score leaders: a compact standings footer, not part of the story.
  if (data.powerScore.length > 0) {
    const top3 = [...data.powerScore].sort((a, b) => a.rank - b.rank).slice(0, 3);
    lines.push("");
    lines.push("*:trophy: Power score leaders:*");
    for (const p of top3) {
      lines.push(`${p.rank}. ${p.name} — ${p.score}`);
    }
  }

  const text = lines.join("\n");

  const slackRes = await fetch(slackWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!slackRes.ok) {
    const body = await slackRes.text().catch(() => "");
    console.error(`Slack webhook returned ${slackRes.status}: ${body.slice(0, 200)}`);
    process.exit(1);
  }

  console.log("Daily activity digest posted to Slack.");
}

// Only run main() when this file is executed directly (`node
// daily-activity-digest.mjs`), not when it's imported by
// daily-activity-digest.test.mjs to exercise fetchActivityWithRetry.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
