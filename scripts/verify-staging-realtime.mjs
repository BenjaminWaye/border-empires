#!/usr/bin/env node
// A Fly deploy can pass its first health check and then stall after traffic
// starts. Keep checking the actual gateway and WebSocket before publishing the
// matching client build to the staging alias.
import WebSocket from "ws";
import { FIREBASE_API_KEY, refreshFirebaseAuthToken } from "./firebase-token-refresh.mjs";

const DEFAULT_HEALTH_URL = "https://api-staging.borderempires.com/health";
const DEFAULT_WS_URL = "wss://api-staging.borderempires.com/ws?channel=control";
const FIREBASE_ACCOUNTS_URL = "https://identitytoolkit.googleapis.com/v1/accounts";

const createAnonymousFirebaseToken = async (fetchImpl, timeoutMs) => {
  const signUp = await fetchImpl(`${FIREBASE_ACCOUNTS_URL}:signUp?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!signUp.ok) throw new Error(`anonymous Firebase sign-in failed: HTTP ${signUp.status}`);
  const { idToken } = await signUp.json();
  if (typeof idToken !== "string" || idToken.length === 0) throw new Error("anonymous Firebase sign-in returned no ID token");
  return idToken;
};

const deleteAnonymousFirebaseToken = async (fetchImpl, timeoutMs, idToken) => {
  const deletion = await fetchImpl(`${FIREBASE_ACCOUNTS_URL}:delete?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!deletion.ok) throw new Error(`temporary Firebase account deletion failed: HTTP ${deletion.status}`);
};

export const checkFirebaseAnonymousProvider = async ({ fetchImpl = fetch, timeoutMs = 15_000 } = {}) => {
  const idToken = await createAnonymousFirebaseToken(fetchImpl, timeoutMs);
  await deleteAnonymousFirebaseToken(fetchImpl, timeoutMs, idToken);
};

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
  durationMs = 600_000,
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

// Exercise Play Now itself, not just the unauthenticated WebSocket upgrade.
// CI reuses one anonymous probe account; local/manual runs without its refresh
// token create a temporary Firebase identity and delete it afterward.
export const checkStagingGuestInit = async ({
  wsUrl = DEFAULT_WS_URL,
  timeoutMs = 60_000,
  refreshToken = process.env.STAGING_ANON_PROBE_REFRESH_TOKEN,
  refreshAuthToken = refreshFirebaseAuthToken,
  fetchImpl = fetch,
  WebSocketImpl = WebSocket
} = {}) => {
  let idToken;
  if (refreshToken) {
    idToken = await refreshAuthToken(refreshToken);
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    if (claims.firebase?.sign_in_provider !== "anonymous") throw new Error("staging probe account is not anonymous");
  } else {
    idToken = await createAnonymousFirebaseToken(fetchImpl, timeoutMs);
  }
  if (typeof idToken !== "string" || idToken.length === 0) throw new Error("anonymous Firebase sign-in returned no ID token");
  try {
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
      const timer = setTimeout(() => finish(new Error(`guest AUTH did not reach INIT within ${timeoutMs}ms`)), timeoutMs);
      socket.once("open", () => {
        try { socket.send(JSON.stringify({ type: "AUTH", token: idToken })); }
        catch (error) { finish(error); }
      });
      socket.on("message", (raw) => {
        let message;
        try { message = JSON.parse(String(raw)); } catch { return; }
        if (message.type === "INIT") finish();
        if (message.type === "ERROR" || message.type === "AUTH_FAIL") finish(new Error(`guest AUTH rejected: ${message.code ?? message.type}`));
      });
      socket.once("error", (error) => finish(error));
      socket.once("close", () => finish(new Error("guest socket closed before INIT")));
    });
  } finally {
    if (!refreshToken) {
      await deleteAnonymousFirebaseToken(fetchImpl, timeoutMs, idToken);
    }
  }
};

const isMain = process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  const durationIndex = args.indexOf("--duration-ms");
  const durationMs = durationIndex >= 0 ? Number(args[durationIndex + 1]) : 600_000;
  if ((durationIndex >= 0 && args.length !== 2) || (durationIndex < 0 && args.length !== 0) || !Number.isFinite(durationMs)) {
    console.error("Usage: node scripts/verify-staging-realtime.mjs [--duration-ms N]");
    process.exit(2);
  }
  (async () => {
    await soakStagingRealtime({ durationMs });
    if (process.env.STAGING_ANON_PROBE_REFRESH_TOKEN) await checkFirebaseAnonymousProvider();
    await checkStagingGuestInit();
    await checkStagingRealtime();
    console.log("staging anonymous guest AUTH reached INIT and gateway remained healthy");
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
