import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("gateway fog capability regression guard", () => {
  it("stores the fog-admin capability on the live session and reuses it for init and player updates", () => {
    const source = sourceFor("./gateway-app.ts");

    expect(source).toContain("canToggleFog: boolean;");
    expect(source).toContain("canToggleFog: false");
    expect(source).toContain("session.canToggleFog = canToggleFogForEmail(playerIdentity.authEmail, options.fogAdminEmail);");
    expect(source).toContain("session.canToggleFog\n              );");
    expect(source).toContain("canToggleFog: session.canToggleFog");
    expect(source).toContain('for (const targetSocket of playerSubscriptions.socketsForPlayer(session.playerId))');
    expect(source).toContain('if (options?.includeFogUpdate === true) {');
    expect(source).toContain('queueOrSendSessionPayload(targetSocket, { type: "FOG_UPDATE", fogDisabled });');
    expect(source).toContain('fullVisibilityReplacementPayloadCache.get(snapshot)');
    expect(source).toContain('await refreshPlayerFogSnapshot(session.playerId, fogDisabled, {');
    expect(source).toContain('reason: "fog_toggle"');
    expect(source).toContain('queueOrSendSessionPayload(targetSocket, replacementBroadcast);');
    expect(source).toContain('const hasFogDisabledSession = [...playerSubscriptions.socketsForPlayer(playerId)].some(');
    // TILE_DELTA_BATCH must NOT await refreshPlayerFogSnapshot inline — that
    // blocked the gateway event loop for 21s p99 in prod on 2026-05-23 and
    // starved login bootstrap_subscribe for 45s+. The path now goes through
    // the coalesced scheduler.
    expect(source).not.toContain('await refreshPlayerFogSnapshot(playerId, true, { reason: "live-delta"');
    expect(source).toContain("scheduleFogLiveRefresh(playerId, event.commandId);");
    expect(source).toContain("const FOG_LIVE_REFRESH_MIN_INTERVAL_MS");
    expect(source).not.toContain("session.authEmail");
  });

  it("streams reveal-map snapshots through the chunk cache without retaining them as per-player diagnostics", () => {
    const source = sourceFor("./gateway-app.ts");
    const revealStart = source.indexOf("const revealMapPayloadSet = async");
    const revealEnd = source.indexOf("const streamRevealMapToSocket = async");
    const revealBuildSource = source.slice(revealStart, revealEnd);

    expect(source).toContain("const revealMapChunkCache = createRevealMapChunkCache({");
    expect(source).toContain("let revealMapPayloadBuild: Promise<RevealMapPayloadSet> | undefined;");
    expect(revealBuildSource).toContain("const cachedPayloadSet = revealMapChunkCache.current();");
    expect(revealBuildSource).toContain("if (cachedPayloadSet) return cachedPayloadSet;");
    expect(revealBuildSource).toContain('trigger: "gateway_reveal_map"');
    expect(revealBuildSource).toContain("const payloadSet = revealMapChunkCache.getOrCreate(snapshot);");
    expect(revealBuildSource).not.toContain("recordGatewaySnapshotDiagnostics");
    expect(source).toContain('if (message.type === "REQUEST_REVEAL_MAP") {');
    expect(source).toContain("void streamRevealMapToSocket(socket, session.playerId).catch((error) => {");
    expect(source).toContain("revealMapChunkCache.clear();");
  });

  it("gates REQUEST_REVEAL_MAP on the same fog-admin capability as SET_FOG_DISABLED", () => {
    const source = sourceFor("./gateway-app.ts");
    const revealHandlerStart = source.indexOf('if (message.type === "REQUEST_REVEAL_MAP") {');
    const revealHandlerEnd = source.indexOf('if (message.type === "REQUEST_TILE_DETAIL") {');
    const revealHandlerSource = source.slice(revealHandlerStart, revealHandlerEnd);

    expect(revealHandlerSource).toContain("if (!session.canToggleFog) {");
    expect(revealHandlerSource).toContain('"gateway_reveal_map_forbidden"');
    expect(revealHandlerSource).toContain('code: "FORBIDDEN"');
    expect(revealHandlerSource.indexOf("if (!session.canToggleFog) {")).toBeLessThan(
      revealHandlerSource.indexOf("void streamRevealMapToSocket(")
    );
  });

  it("emits reveal-map metrics for snapshot build, active streams, chunks sent, and cache entries", () => {
    const source = sourceFor("./gateway-app.ts");

    expect(source).toContain("gatewayMetrics.observeRevealSnapshotBuildMs(buildDurationMs);");
    expect(source).toContain("gatewayMetrics.observeRevealSnapshotBytes(payloadSet.payloadJsonBytes);");
    expect(source).toContain("gatewayMetrics.setRevealCacheEntries(1);");
    expect(source).toContain("gatewayMetrics.setRevealCacheEntries(0);");
    expect(source).toContain("gatewayMetrics.setRevealActiveStreams(activeRevealStreamSockets.size);");
    expect(source).toContain("gatewayMetrics.incrementRevealChunksSent(1);");
  });

  it("rate-limits reveal requests per player and caps concurrent reveal streams", () => {
    const source = sourceFor("./gateway-app.ts");
    const revealHandlerStart = source.indexOf('if (message.type === "REQUEST_REVEAL_MAP") {');
    const revealHandlerEnd = source.indexOf('if (message.type === "REQUEST_TILE_DETAIL") {');
    const revealHandlerSource = source.slice(revealHandlerStart, revealHandlerEnd);

    expect(source).toContain("const MAX_CONCURRENT_REVEAL_STREAMS =");
    expect(source).toContain("const REVEAL_REQUEST_COOLDOWN_MS =");
    expect(source).toContain("const activeRevealStreamSockets = new Set<");
    expect(source).toContain("const lastRevealRequestMsByPlayerId = new Map<string, number>();");
    expect(revealHandlerSource).toContain("lastRevealRequestMsByPlayerId.get(session.playerId)");
    expect(revealHandlerSource).toContain('code: "REVEAL_MAP_THROTTLED"');
    expect(revealHandlerSource).toContain("activeRevealStreamSockets.size >= MAX_CONCURRENT_REVEAL_STREAMS");
    expect(revealHandlerSource).toContain('code: "REVEAL_MAP_BUSY"');
    expect(revealHandlerSource).toContain("lastRevealRequestMsByPlayerId.set(session.playerId, now);");
    expect(source).toContain("activeRevealStreamSockets.add(socket);");
    expect(source).toContain("activeRevealStreamSockets.delete(socket);");
  });

  // Regression for "why did the websocket reply take so long" — the gateway
  // already measured gateway_input_to_state_update_latency_ms as an aggregate
  // quantile, but a single slow command never got its own diagnostic log
  // (commandId, eventType, elapsed), so a real incident could only be seen
  // as a shifted p95/p99, not traced back to one player action.
  it("logs a per-command diagnostic when input-to-state latency crosses the slow threshold", () => {
    const source = sourceFor("./gateway-app.ts");

    expect(source).toContain(
      "const slowGatewayInputToStateWarnMs = Math.max(100, Number(process.env.GATEWAY_SLOW_INPUT_TO_STATE_WARN_MS ?? 1_000));"
    );
    const observeStart = source.indexOf("const submittedAt = pendingInputToStateByCommandId.get(event.commandId);");
    const observeEnd = source.indexOf("if (event.eventType === \"PLAYER_MESSAGE\"");
    const observeSource = source.slice(observeStart, observeEnd);

    expect(observeSource).toContain("gatewayMetrics.observeGatewayInputToStateUpdateLatencyMs(inputToStateDurationMs);");
    expect(observeSource).toContain("if (inputToStateDurationMs >= slowGatewayInputToStateWarnMs) {");
    expect(observeSource).toContain('recordGatewayEvent("warn", "gateway_input_to_state_slow", {');
    expect(observeSource).toContain("commandId: event.commandId,");
    expect(observeSource).toContain("eventType: event.eventType,");
  });
});
