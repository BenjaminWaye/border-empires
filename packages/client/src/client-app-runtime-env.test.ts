import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClientSocketSetup } from "./client-app-runtime-env.js";
import * as multiplexWebSocketModule from "./client-multiplex-websocket.js";

describe("client app runtime env", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
