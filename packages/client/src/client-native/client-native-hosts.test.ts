import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { isLocalDevHostname, resolveDevAuthPlayerId } from "../client-app-runtime-env/client-dev-auth-bypass.js";
import { tileSyncDebugEnabled } from "../client-debug/client-debug.js";
import { createOwnershipDebugEmitter } from "../client-map-3d-ownership-debug/client-map-3d-ownership-debug.js";
import { rallyApiOrigin, rallyShareUrl } from "../client-rally-links/client-rally-links.js";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: vi.fn(() => true) } }));

describe("native WebView host boundaries", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.stubGlobal("window", { location: { hostname: "localhost" }, localStorage: { getItem: () => null } });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("does not enable development authentication on the native local origin", () => {
    expect(isLocalDevHostname("localhost")).toBe(false);
    expect(resolveDevAuthPlayerId("localhost", "?devPlayerId=player-1")).toBeUndefined();
  });
  it("does not automatically enable tile logging", () => {
    expect(tileSyncDebugEnabled()).toBe(false);
  });
  it("does not emit 3D ownership debug payloads in the app", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    createOwnershipDebugEmitter()({ x: 1 });
    expect(log).not.toHaveBeenCalled();
  });
  it.each([
    ["wss://api.borderempires.com/ws", "https://api.borderempires.com"],
    ["wss://api-staging.borderempires.com/ws", "https://api-staging.borderempires.com"]
  ])("creates rally links through the selected remote gateway (%s)", (ws, origin) => {
    expect(rallyApiOrigin(ws!, { hostname: "localhost", protocol: "https:" }, {})).toBe(origin);
  });
  it.each(["https://localhost", "null"])("shares public staging links from native origin %s", (origin) => {
    vi.stubEnv("VITE_NATIVE_PUBLIC_ORIGIN", "https://staging.borderempires.com");
    expect(rallyShareUrl({ code: "r_abc-123", url: "https://play.borderempires.com/r/r_abc-123" }, { origin }))
      .toBe("https://staging.borderempires.com/r/r_abc-123");
  });
});
