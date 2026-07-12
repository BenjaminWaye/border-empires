import type { SlackAlerter } from "../slack-alerts/slack-alerts.js";
import type { GatewayMetricsSnapshot } from "../metrics/metrics.js";

export type StartSlackAlertLatencyPollDeps = {
  getSlackAlerter: () => SlackAlerter | undefined;
  snapshotMetrics: () => GatewayMetricsSnapshot;
  startupStartedAt: number;
  intervalMs?: number;
};

// Polls gateway metrics for conditions worth a Slack ping: a machine restart
// detected on the first poll after boot, and sustained high command-submit
// latency (p99 > 2.5s).
export const startSlackAlertLatencyPoll = (deps: StartSlackAlertLatencyPollDeps): { stop: () => void } => {
  let machineRestartFired = false;
  const timer = setInterval(() => {
    const slackAlerter = deps.getSlackAlerter();
    if (!slackAlerter) return;
    const snapshot = deps.snapshotMetrics();
    if (!machineRestartFired) {
      machineRestartFired = true;
      const uptimeMs = Date.now() - deps.startupStartedAt;
      if (uptimeMs < 120_000) slackAlerter.alertMachineRestart(uptimeMs);
    }
    const submitP99 = snapshot.gatewayCommandSubmitLatencyMs.p99;
    if (submitP99 > 2500) slackAlerter.alertCommandSubmitLatencyHigh(submitP99);
  }, deps.intervalMs ?? 30_000);
  return { stop: () => clearInterval(timer) };
};
