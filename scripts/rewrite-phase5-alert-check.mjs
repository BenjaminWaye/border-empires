#!/usr/bin/env node
import readline from "node:readline";

const mode = process.argv[2] ?? "gateway";
const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim() || process.env.PHASE5_ALERT_SLACK_WEBHOOK?.trim() || "";
const appLabel = process.env.PHASE5_ALERT_LABEL?.trim() || "border-empires";

const state = {
  gatewayConsecutiveBreaches: 0,
  gatewayAlerted: false,
  simBacklogAlerted: false,
  simRssAlerted: false,
  simBarbMusterBlockAlerted: false
};

const maybeNumber = (line, key) => {
  const match = line.match(new RegExp(`${key}["=:\\s]+([0-9]+(?:\\.[0-9]+)?)`));
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
};

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

const postSlack = async (text) => {
  if (!webhookUrl || typeof fetch !== "function") return;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      console.error(`Slack alert post failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Slack alert post failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const alertOnce = (key, message) => {
  if (state[key]) return;
  state[key] = true;
  console.error(message);
  process.exitCode = 2;
  void postSlack(`:rotating_light: ${appLabel}: ${message}`);
};

rl.on("line", (line) => {
  if (mode === "gateway") {
    const eventLoopMax = maybeNumber(line, "gateway_event_loop_max_ms");
    if (typeof eventLoopMax !== "number") return;
    state.gatewayConsecutiveBreaches = eventLoopMax > 100 ? state.gatewayConsecutiveBreaches + 1 : 0;
    if (state.gatewayConsecutiveBreaches >= 3) {
      alertOnce("gatewayAlerted", `ALERT gateway_event_loop_max_ms breached for 3 samples (latest=${eventLoopMax})`);
    }
    return;
  }

  if (mode === "simulation") {
    const backlog = maybeNumber(line, "sim_human_interactive_backlog_ms");
    if (typeof backlog === "number" && backlog > 500) {
      alertOnce("simBacklogAlerted", `ALERT sim_human_interactive_backlog_ms breached (latest=${backlog})`);
    }

    const rss = maybeNumber(line, "sim_checkpoint_rss_mb");
    if (typeof rss === "number" && rss > 400) {
      alertOnce("simRssAlerted", `ALERT sim_checkpoint_rss_mb breached (latest=${rss})`);
    }

    // Phase 3 pre-cutover alarm: barbarians spamming ATTACK with no muster built up.
    // >2000 blocks in a session means barbarians are looping without accumulating muster.
    const barbBlocked = maybeNumber(line, "sim_muster_remote_blocked_barbarian_total");
    if (typeof barbBlocked === "number" && barbBlocked > 2000) {
      alertOnce("simBarbMusterBlockAlerted", `ALERT sim_muster_remote_blocked_barbarian_total runaway (total=${barbBlocked})`);
    }
  }
});
