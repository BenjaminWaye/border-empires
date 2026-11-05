import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildClientDebugBundle, serverHttpOriginFromWsUrl, fetchPlayerServerDiagnostics } from "./client-debug-bundle.js";
import { diagnosticAuthorization } from "../client-sync-diagnostics/client-server-diagnostics.js";
vi.mock("../client-sync-diagnostics/client-server-diagnostics.js", () => ({ diagnosticAuthorization: vi.fn(async () => "Bearer test-id-token") }));
import { recordClientDebugEvent } from "../client-debug/client-debug.js";

describe("client debug bundle", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(diagnosticAuthorization).mockResolvedValue("Bearer test-id-token");
  });

  it("derives the server origin from websocket URLs", () => {
    expect(serverHttpOriginFromWsUrl("wss://border-empires.fly.dev/ws")).toBe("https://border-empires.fly.dev");
    expect(serverHttpOriginFromWsUrl("ws://localhost:3001/ws")).toBe("http://localhost:3001");
    expect(serverHttpOriginFromWsUrl("wss://example.test/realtime/ws?channel=control")).toBe("https://example.test");
  });

  it("builds a bundle with client events and fetched server diagnostics", async () => {
    recordClientDebugEvent("warn", "attack-sync", "action-accept-timeout", { targetKey: "12,34", current: { commandId: "preserved-incident" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/health")) {
          return new Response(JSON.stringify({ ok: true, startupElapsedMs: 5 }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            recentServerEvents: [{ at: 1, event: "frontier_action_received", payload: { commandId: "c1" } }],
            playerId: "p1",
            serverBuildSha: "server-sha",
            serverStartedAt: 1000
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      })
    );

    const bundle = await buildClientDebugBundle({
      wsUrl: "wss://border-empires.fly.dev/ws",
      state: {
        me: "p1",
        meName: "Tester",
        connection: "connected",
        authSessionReady: true,
        selected: { x: 12, y: 34 },
        hover: undefined,
        capture: undefined,
        captureAlert: undefined,
        actionInFlight: true,
        actionCurrent: { x: 12, y: 34, retries: 0 },
        actionTargetKey: "12,34",
        actionStartedAt: 123,
        actionAcceptedAck: false,
        combatStartAck: false,
        pendingCombatReveal: undefined,
        queuedTargetKeys: new Set<string>(["12,34"]),
        developmentQueue: [],
        bridgeDebugMode: "rewrite-gateway",
        bridgeDebugBootstrap: "rewrite-init",
        bridgeDebugWsUrl: "wss://border-empires.fly.dev/ws",
        bridgeDebugSeasonId: "season-test",
        bridgeDebugRuntimeFingerprint: "snap-123456",
        bridgeDebugSnapshotLabel: ".prod-snapshot-copy",
        bridgeDebugInitialTileCount: 42,
        bridgeDebugSupportedMessageCount: 5
      }
    });

    expect(bundle).toMatchObject({
      schemaVersion: 2,
      clientBuildSha: expect.any(String),
      disconnectHistory: expect.any(Array),
      wsUrl: "wss://border-empires.fly.dev/ws",
      serverOrigin: "https://border-empires.fly.dev",
      attackDebug: {
        client: {
          timeouts: [expect.objectContaining({ event: "action-accept-timeout" })]
        },
        server: {
          timeline: [{ at: 1, event: "frontier_action_received", payload: { commandId: "c1" } }]
        }
      },
      serverHealth: {
        ok: true,
        status: 200,
        body: { ok: true, startupElapsedMs: 5 }
      },
      serverBundle: {
        ok: true,
        status: 200,
        body: {
          ok: true,
          recentServerEvents: [{ at: 1, event: "frontier_action_received", payload: { commandId: "c1" } }],
          serverBuildSha: "server-sha",
          serverStartedAt: 1000
        }
      }
    });
    expect(fetch).toHaveBeenCalledWith("https://border-empires.fly.dev/api/player/sync-diagnostics?commandId=preserved-incident", expect.objectContaining({ headers: { Accept: "application/json", Authorization: "Bearer test-id-token" } }));
    expect(JSON.stringify(bundle)).not.toContain("test-id-token");
    expect((bundle.clientEvents as Array<{ event: string }>).some((event) => event.event === "action-accept-timeout")).toBe(true);
  });
  it("keeps authentication failures explicit without issuing an unauthenticated admin request", async () => {
    vi.mocked(diagnosticAuthorization).mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
    expect(await fetchPlayerServerDiagnostics("https://example.test")).toMatchObject({ ok: false, error: expect.stringContaining("No signed-in user") });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an unexpected successful HTTP response as a collection failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>game fallback</html>", { status: 200 })));
    await expect(fetchPlayerServerDiagnostics("https://example.test")).resolves.toEqual({ ok: false, status: 200, error: "Server diagnostics returned an unexpected response" });
  });

  it("still completes collection when Firebase token refresh never settles", async () => {
    vi.useFakeTimers();
    vi.mocked(diagnosticAuthorization).mockReturnValue(new Promise<string | undefined>(() => undefined));
    vi.stubGlobal("fetch", vi.fn());
    const pending = fetchPlayerServerDiagnostics("https://example.test");
    await vi.advanceTimersByTimeAsync(4001);
    await expect(pending).resolves.toEqual({ ok: false, error: "Diagnostic authentication timed out after 4 seconds" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves HTTP failures and does not leak failed token refresh errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect(await fetchPlayerServerDiagnostics("https://example.test")).toMatchObject({ ok: false, status: 401 });
    vi.mocked(diagnosticAuthorization).mockRejectedValue(new Error("secret-token"));
    expect(await fetchPlayerServerDiagnostics("https://example.test")).toEqual({ ok: false, error: "Unable to authenticate server diagnostics" });
  });
});
