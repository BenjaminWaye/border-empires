#!/usr/bin/env node
// Prints (and optionally posts to Slack) which outreach posts brought
// visitors and sign-ups, from GET /admin/players/insights.json.
//
// Usage:
//   ADMIN_API_TOKEN=... node scripts/outreach/outreach-report.mjs [--days 7]
//   ADMIN_API_TOKEN=... SLACK_WEBHOOK_URL=... node scripts/outreach/outreach-report.mjs --days 7 --slack
//
// INSIGHTS_ORIGIN defaults to production (https://api.borderempires.com).
import { parseArgs } from "node:util";

import { formatSourceReport } from "./outreach-lib.mjs";

const { values } = parseArgs({
  options: {
    days: { type: "string", default: "7" },
    slack: { type: "boolean", default: false }
  }
});

const origin = process.env.INSIGHTS_ORIGIN ?? "https://api.borderempires.com";
const token = process.env.ADMIN_API_TOKEN;
if (!token) {
  console.error("ADMIN_API_TOKEN is required.");
  process.exit(1);
}

const res = await fetch(`${origin}/admin/players/insights.json?days=${encodeURIComponent(values.days)}`, {
  headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(20_000)
});
if (!res.ok) {
  console.error(`insights.json returned ${res.status}`);
  process.exit(1);
}
const body = await res.json();
const report = formatSourceReport(body.insights);
console.log(report);

if (values.slack) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.error("--slack needs SLACK_WEBHOOK_URL.");
    process.exit(1);
  }
  const slackRes = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "```\n" + report + "\n```" }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!slackRes.ok) {
    console.error(`Slack webhook returned ${slackRes.status}`);
    process.exit(1);
  }
}
