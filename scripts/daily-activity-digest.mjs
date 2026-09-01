#!/usr/bin/env node
// Fetches GET /api/activity from a running gateway and posts a curated
// daily highlights digest to Slack via an incoming webhook. Scheduled by
// .github/workflows/daily-activity-digest.yml (see that file for the cron
// and secret wiring — same webhook-POST pattern as slack-alerts.ts and the
// nightly-load-harness Slack notify step).
//
// Usage: ACTIVITY_API_URL=... SLACK_WEBHOOK_URL=... node scripts/daily-activity-digest.mjs

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

const res = await fetch(activityApiUrl, { signal: AbortSignal.timeout(15_000) });
if (!res.ok) {
  console.error(`GET ${activityApiUrl} returned ${res.status}`);
  process.exit(1);
}
const data = await res.json();

// Display names now come straight from the API (playerAName/playerBName/
// playerName/contestedByNames — resolved server-side against the leaderboard
// with a "Barbarians" fallback for barbarian-1, see
// apps/realtime-gateway/src/activity-api/activity-api-player-names.ts).
// alliances/allianceBreaks don't carry a *Name field yet, so those still
// fall back to the raw id via powerScore below.
const nameById = new Map(data.powerScore.map((entry) => [entry.id, entry.name]));
const nameOf = (playerId) => nameById.get(playerId) ?? playerId;

const lines = [];
lines.push(`*Border Empires — Daily Activity* (${new Date(data.generatedAt).toDateString()})`);

// Wars
if (data.wars.length > 0) {
  const top = [...data.wars].sort((a, b) => b.tileFlips24h - a.tileFlips24h).slice(0, 5);
  lines.push("");
  lines.push("*:crossed_swords: Active wars (last 24h):*");
  for (const w of top) {
    lines.push(`• ${w.playerAName} vs ${w.playerBName} — ${w.tileFlips24h} tile flips`);
  }
} else {
  lines.push("");
  lines.push("*:crossed_swords: Active wars:* none in the last 24h");
}

// Most fortified
if (data.fortification.length > 0) {
  const top = data.fortification[0];
  lines.push("");
  lines.push(`*:european_castle: Most fortified:* ${top.playerName} — score ${top.score} (${top.forts} forts, ${(top.garrisonFillPct * 100).toFixed(0)}% garrisoned)`);
}

// New alliances
if (data.alliances.length > 0) {
  lines.push("");
  lines.push("*:handshake: Current alliances:*");
  for (const a of data.alliances.slice(0, 8)) {
    lines.push(`• ${nameOf(a.playerA)} + ${nameOf(a.playerB)}`);
  }
}

// Alliance breaks
if (data.allianceBreaks.length > 0) {
  lines.push("");
  lines.push("*:broken_heart: Alliance breaks:*");
  for (const b of data.allianceBreaks.slice(0, 5)) {
    lines.push(`• ${nameOf(b.playerA)} & ${nameOf(b.playerB)} — broken by ${nameOf(b.brokenBy)}`);
  }
}

// Biggest swing
if (data.biggestSwing24h) {
  const s = data.biggestSwing24h;
  lines.push("");
  lines.push(`*:chart_with_downwards_trend: Biggest swing:* ${s.playerName} lost ${s.tilesLost} tiles in a day`);
}

// Frontline hotspots
if (data.frontlineHotspots.length > 0) {
  const top = data.frontlineHotspots[0];
  lines.push("");
  lines.push(`*:fire: Hottest frontline:* tile (${top.x}, ${top.y}) — ${top.flips24h} flips, contested by ${top.contestedByNames.join(" & ")}`);
}

// Power score leaders
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
