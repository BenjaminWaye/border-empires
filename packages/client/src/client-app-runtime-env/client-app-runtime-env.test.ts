import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as multiplexWebSocketModule from "../client-multiplex-websocket/client-multiplex-websocket.js";
import { createClientSocketSetup } from "./client-app-runtime-env.js";

vi.mock("firebase/app", () => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn((config: unknown) => config)
}));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: vi.fn(function GoogleAuthProviderMock(this: unknown) {
    return this;
  }),
  getAuth: vi.fn(() => ({}))
}));

// Both cases below assert the fallback behavior when no baked gateway env
// var is present. Local-dev .env.local files ship those vars set to staging
// (so the dev client can talk to staging by default) which would otherwise
// short-circuit the fallback under test. Save + clear in beforeEach,
// restore in afterEach so the assertions actually exercise the code path
// the test names claim.
const ENV_KEYS_TO_ISOLATE = ["VITE_GATEWAY_WS_URL", "VITE_WS_URL", "VITE_FIREBASE_AUTH_DOMAIN"] as const;

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

  describe("Firebase authDomain (root cause of the mobile Chrome auth/missing-initial-state error)", () => {
    // border-empires.firebaseapp.com is a different origin than the app
    // (play.borderempires.com / staging.borderempires.com). Google
    // sign-in's OAuth handshake needs sessionStorage on whichever origin
    // serves /__/auth/handler, and mobile browsers increasingly
    // partition/block storage for that kind of third-party context —
    // surfacing as Firebase's raw "auth/missing-initial-state" error.
    // vercel.json proxies /__/auth/* and /__/firebase/* back to
    // firebaseapp.com so defaulting authDomain to the current hostname on
    // deployed hosts makes that handler traffic first-party instead.
    it("defaults authDomain to the current hostname on a deployed host", async () => {
      vi.stubGlobal("window", { location: { hostname: "play.borderempires.com", protocol: "https:" } });
      const { initializeApp } = await import("firebase/app");
      const { createClientFirebaseSetup } = await import("./client-app-runtime-env.js");

      createClientFirebaseSetup();

      expect(initializeApp).toHaveBeenCalledWith(expect.objectContaining({ authDomain: "play.borderempires.com" }));
    });

    it("defaults authDomain to the current hostname on staging too", async () => {
      vi.stubGlobal("window", { location: { hostname: "staging.borderempires.com", protocol: "https:" } });
      const { initializeApp } = await import("firebase/app");
      const { createClientFirebaseSetup } = await import("./client-app-runtime-env.js");

      createClientFirebaseSetup();

      expect(initializeApp).toHaveBeenCalledWith(
        expect.objectContaining({ authDomain: "staging.borderempires.com" })
      );
    });

    it("falls back to the border-empires.firebaseapp.com authDomain on localhost, where vercel.json's proxy does not exist", async () => {
      vi.stubGlobal("window", { location: { hostname: "localhost", protocol: "http:" } });
      const { initializeApp } = await import("firebase/app");
      const { createClientFirebaseSetup } = await import("./client-app-runtime-env.js");

      createClientFirebaseSetup();

      expect(initializeApp).toHaveBeenCalledWith(
        expect.objectContaining({ authDomain: "border-empires.firebaseapp.com" })
      );
    });

    it("respects an explicit VITE_FIREBASE_AUTH_DOMAIN override on a deployed host", async () => {
      const env = import.meta.env as Record<string, string | undefined>;
      env.VITE_FIREBASE_AUTH_DOMAIN = "custom-auth-domain.example.com";
      vi.stubGlobal("window", { location: { hostname: "play.borderempires.com", protocol: "https:" } });
      const { initializeApp } = await import("firebase/app");
      const { createClientFirebaseSetup } = await import("./client-app-runtime-env.js");

      createClientFirebaseSetup();

      expect(initializeApp).toHaveBeenCalledWith(
        expect.objectContaining({ authDomain: "custom-auth-domain.example.com" })
      );
    });
  });
});
