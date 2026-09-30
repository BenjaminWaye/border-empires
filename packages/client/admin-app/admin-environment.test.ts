import { describe, expect, it } from "vitest";

import { PRODUCTION_ADMIN_URL, STAGING_ADMIN_URL, resolveAdminEnvironment } from "./admin-environment.js";

describe("resolveAdminEnvironment", () => {
  it("points each deployment's /admin at its own gateway and offers the other one", () => {
    expect(resolveAdminEnvironment("play.borderempires.com", undefined)).toEqual({
      label: "Production",
      gatewayOrigin: "https://border-empires-combined.fly.dev",
      otherAdminUrl: STAGING_ADMIN_URL
    });
    expect(resolveAdminEnvironment("staging.borderempires.com", undefined)).toEqual({
      label: "Staging",
      gatewayOrigin: "https://border-empires-combined-staging.fly.dev",
      otherAdminUrl: PRODUCTION_ADMIN_URL
    });
  });

  it("uses the local gateway on localhost and honours an explicit gateway URL", () => {
    expect(resolveAdminEnvironment("localhost", undefined)).toEqual({ label: "Local", gatewayOrigin: "http://127.0.0.1:3101", otherAdminUrl: undefined });
    expect(resolveAdminEnvironment("play.borderempires.com", "wss://gw.example.test/ws").gatewayOrigin).toBe("https://gw.example.test");
  });
});
