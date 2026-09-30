#!/usr/bin/env node
// A Fly deploy can pass its first health check and then stall after traffic
// starts. Keep checking the actual gateway and WebSocket before publishing the
// matching client build to the staging alias.
import WebSocket from "ws";

const DEFAULT_HEALTH_URL = "https://border-empires-combined-staging.fly.dev/health";
const DEFAULT_WS_URL = "wss://border-empires-combined-staging.fly.dev/ws?channel=control";

export const checkStagingRealtime = async ({
  healthUrl = DEFAULT_HEALTH_URL,
  wsUrl = DEFAULT_WS_URL,
  timeoutMs = 5_000,
  fetchImpl = fetch,
  WebSocketImpl = WebSocket
} = {}) => {
  const response = await fetchImpl(healthUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`gateway health returned HTTP ${response.status}`);
  const health = await response.json();
  if (health.ok !== true || health.simulation?.connected !== true) {
    throw new Error("gateway health reports simulation disconnected");
  }

  await new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(wsUrl);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      if (error) {
        socket.terminate();
        reject(error);
      } else {
        socket.close();
        resolve();
      }
    };
    const timer = setTimeout(() => finish(new Error(`WebSocket did not open within ${timeoutMs}ms`)), timeoutMs);
    socket.once("open", () => finish());
    socket.once("error", (error) => finish(error));
    socket.once("close", () => finish(new Error("WebSocket closed before opening")));
  });
};

export const soakStagingRealtime = async ({
  durationMs = 120_000,
  intervalMs = 10_000,
  check = checkStagingRealtime,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log
} = {}) => {
  if (durationMs < 0 || intervalMs <= 0) throw new Error("duration and interval must be positive");
  const deadline = now() + durationMs;
  let attempts = 0;
  let consecutiveFailures = 0;
  do {
    attempts += 1;
    try {
      await check();
      consecutiveFailures = 0;
      log(`staging gateway and WebSocket healthy (${attempts})`);
    } catch (error) {
      consecutiveFailures += 1;
      const reason = error instanceof Error ? error.message : String(error);
      if (consecutiveFailures >= 2 || now() >= deadline) {
        throw new Error(`staging realtime failed ${consecutiveFailures} consecutive checks: ${reason}`);
      }
      log(`staging realtime check failed; retrying: ${reason}`);
    }
    if (now() >= deadline) break;
    await sleep(Math.min(intervalMs, deadline - now()));
  } while (true);
  return attempts;
};

const isMain = process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  const durationIndex = args.indexOf("--duration-ms");
  const durationMs = durationIndex >= 0 ? Number(args[durationIndex + 1]) : 120_000;
  if ((durationIndex >= 0 && args.length !== 2) || (durationIndex < 0 && args.length !== 0) || !Number.isFinite(durationMs)) {
    console.error("Usage: node scripts/verify-staging-realtime.mjs [--duration-ms N]");
    process.exit(2);
  }
  soakStagingRealtime({ durationMs }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
