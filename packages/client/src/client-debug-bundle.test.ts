import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClientDebugBundle, serverHttpOriginFromWsUrl } from "./client-debug-bundle.js";
import { recordClientDebugEvent } from "./client-debug.js";

describe("client debug bundle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("derives the server origin from websocket URLs", () => {
    expect(serverHttpOriginFromWsUrl("wss://border-empires.fly.dev/ws")).toBe("https://border-empires.fly.dev");
    expect(serverHttpOriginFromWsUrl("ws://localhost:3001/ws")).toBe("http://localhost:3001");
    expect(serverHttpOriginFromWsUrl("wss://example.test/realtime/ws?channel=control")).toBe("https://example.test");
  });

  it("builds a bundle with client events and fetched server diagnostics", async () => {
    recordClientDebugEvent("warn", "attack-sync", "action-accept-timeout", { targetKey: "12,34" });
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
            recentServerEvents: [{ event: "frontier_action_received" }],
            attackTraces: [
              {
                traceId: "trace-1",
                firstAt: 1,
                lastAt: 2,
                events: [{ event: "frontier_action_received" }]
              }
            ],
            attackDebug: {
              controlPath: [{ event: "frontier_action_accept_timing" }],
              hotPath: [{ event: "player_update_timing" }],
              slowOrWarn: [{ event: "slow_player_update" }]
            }
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
        actionCurrent: { x: 12, y: 34, retries: 0, mode: "normal" },
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
      wsUrl: "wss://border-empires.fly.dev/ws",
      serverOrigin: "https://border-empires.fly.dev",
      attackDebug: {
        client: {
          timeouts: [expect.objectContaining({ event: "action-accept-timeout" })]
        },
        server: {
          timeline: {
            controlPath: [{ event: "frontier_action_accept_timing" }],
            hotPath: [{ event: "player_update_timing" }],
            slowOrWarn: [{ event: "slow_player_update" }]
          },
          traces: [
            expect.objectContaining({
              traceId: "trace-1"
            })
          ]
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
          recentServerEvents: [{ event: "frontier_action_received" }],
          attackDebug: expect.any(Object),
          attackTraces: expect.any(Array)
        }
      }
    });
    expect((bundle.clientEvents as Array<{ event: string }>).some((event) => event.event === "action-accept-timeout")).toBe(true);
  });
});
