#!/usr/bin/env node
import readline from "node:readline";

const mode = process.argv[2] ?? "gateway";

const state = {
  gatewayConsecutiveBreaches: 0,
  simBacklogBreached: false,
  simRssBreached: false
};

const maybeNumber = (line, key) => {
  const match = line.match(new RegExp(`${key}["=:\\s]+([0-9]+(?:\\.[0-9]+)?)`));
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
};

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  if (mode === "gateway") {
    const eventLoopMax = maybeNumber(line, "gateway_event_loop_max_ms");
    if (typeof eventLoopMax !== "number") return;
    state.gatewayConsecutiveBreaches = eventLoopMax > 100 ? state.gatewayConsecutiveBreaches + 1 : 0;
    if (state.gatewayConsecutiveBreaches >= 3) {
      console.error(`ALERT gateway_event_loop_max_ms breached for 3 samples (latest=${eventLoopMax})`);
      process.exitCode = 2;
    }
    return;
  }

  if (mode === "simulation") {
    const backlog = maybeNumber(line, "sim_human_interactive_backlog_ms");
    if (typeof backlog === "number" && backlog > 500) {
      state.simBacklogBreached = true;
      console.error(`ALERT sim_human_interactive_backlog_ms breached (latest=${backlog})`);
      process.exitCode = 2;
    }

    const rss = maybeNumber(line, "sim_checkpoint_rss_mb");
    if (typeof rss === "number" && rss > 400) {
      state.simRssBreached = true;
      console.error(`ALERT sim_checkpoint_rss_mb breached (latest=${rss})`);
      process.exitCode = 2;
    }
  }
});
