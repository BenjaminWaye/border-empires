import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClientSocketSetup } from "./client-app-runtime-env.js";
import * as multiplexWebSocketModule from "./client-multiplex-websocket.js";

// Both cases below assert the fallback behavior when no baked gateway env
// var is present. Local-dev .env.local files ship those vars set to staging
// (so the dev client can talk to staging by default) which would otherwise
// short-circuit the fallback under test. Save + clear in beforeEach,
// restore in afterEach so the assertions actually exercise the code path
// the test names claim.
const ENV_KEYS_TO_ISOLATE = ["VITE_GATEWAY_WS_URL", "VITE_WS_URL"] as const;

describe("client app runtime env", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    const env = import.meta.env as Record<string, string | undefined>;
    for (const key of ENV_KEYS_TO_ISOLATE) {
      savedEnv[key] = env[key];
      delete env[key];
    }
  });

  afterEach(() => {
    const env = import.meta.env as Record<string, string | undefined>;
    for (const key of ENV_KEYS_TO_ISOLATE) {
      if (savedEnv[key] === undefined) delete env[key];
      else env[key] = savedEnv[key];
    }
  });

  it("defaults localhost websocket traffic to the rewrite gateway host binding", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "localhost",
        protocol: "http:"
      }
    });

    const state = {
      localhostDevAetherWall: false,
      bridgeDebugWsUrl: "",
      bridgeDebugMode: "unknown"
    };
    const socket = { close: () => undefined };
    const createMultiplexWebSocket = vi.spyOn(
      multiplexWebSocketModule,
      "createMultiplexWebSocket"
    ).mockReturnValue(socket as ReturnType<typeof multiplexWebSocketModule.createMultiplexWebSocket>);

    const setup = createClientSocketSetup(state as never);

    expect(createMultiplexWebSocket).toHaveBeenCalledWith("ws://127.0.0.1:3101/ws");
    expect(setup.wsUrl).toBe("ws://127.0.0.1:3101/ws");
    expect(state.localhostDevAetherWall).toBe(true);
    expect(state.bridgeDebugWsUrl).toBe("ws://127.0.0.1:3101/ws");
    expect(state.bridgeDebugMode).toBe("rewrite-gateway");
  });

  it("defaults staging hostname websocket traffic to the staging gateway even without a baked gateway env var", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "staging.borderempires.com",
        protocol: "https:"
      }
    });

    const state = {
      localhostDevAetherWall: false,
      bridgeDebugWsUrl: "",
      bridgeDebugMode: "unknown"
    };
    const socket = { close: () => undefined };
    const createMultiplexWebSocket = vi.spyOn(
      multiplexWebSocketModule,
      "createMultiplexWebSocket"
    ).mockReturnValue(socket as ReturnType<typeof multiplexWebSocketModule.createMultiplexWebSocket>);

    const setup = createClientSocketSetup(state as never);

    expect(createMultiplexWebSocket).toHaveBeenCalledWith("wss://border-empires-combined-staging.fly.dev/ws");
    expect(setup.wsUrl).toBe("wss://border-empires-combined-staging.fly.dev/ws");
    expect(state.localhostDevAetherWall).toBe(false);
    expect(state.bridgeDebugWsUrl).toBe("wss://border-empires-combined-staging.fly.dev/ws");
    expect(state.bridgeDebugMode).toBe("rewrite-gateway");
  });

  it("defaults play.borderempires.com websocket traffic to the prod combined gateway when no baked gateway env var is present", () => {
    // Regression: the legacy `border-empires.fly.dev` Fly app was retired and
    // its DNS record stopped resolving. Before this guard, prod clients fell
    // through to the dead legacy URL whenever VITE_GATEWAY_WS_URL was missing
    // from the Vercel build env, hanging every login on "Securing session".
    vi.stubGlobal("window", {
      location: {
        hostname: "play.borderempires.com",
        protocol: "https:"
      }
    });

    const state = {
      localhostDevAetherWall: false,
      bridgeDebugWsUrl: "",
      bridgeDebugMode: "unknown"
    };
    const socket = { close: () => undefined };
    const createMultiplexWebSocket = vi.spyOn(
      multiplexWebSocketModule,
      "createMultiplexWebSocket"
    ).mockReturnValue(socket as ReturnType<typeof multiplexWebSocketModule.createMultiplexWebSocket>);

    const setup = createClientSocketSetup(state as never);

    expect(createMultiplexWebSocket).toHaveBeenCalledWith("wss://border-empires-combined.fly.dev/ws");
    expect(setup.wsUrl).toBe("wss://border-empires-combined.fly.dev/ws");
    expect(state.localhostDevAetherWall).toBe(false);
    expect(state.bridgeDebugWsUrl).toBe("wss://border-empires-combined.fly.dev/ws");
    expect(state.bridgeDebugMode).toBe("rewrite-gateway");
  });
});
