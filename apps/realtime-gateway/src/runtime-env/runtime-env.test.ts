import { describe, expect, it } from "vitest";

import { parseRealtimeGatewayRuntimeEnv } from "./runtime-env.js";

describe("realtime gateway runtime env", () => {
  it("allows local defaults without database configuration", () => {
    expect(parseRealtimeGatewayRuntimeEnv({})).toEqual({
      host: "127.0.0.1",
      port: 3101,
      simulationAddress: "127.0.0.1:50051",
      applySchema: false,
      defaultHumanPlayerId: "player-1",
      simulationSeedProfile: "default",
      allowNonAuthoritativeInitialState: true,
      fogAdminEmail: "bw199005@gmail.com",
      emailAlerts: {
        from: "Border Empires <alerts@borderempires.com>",
        appUrl: "https://staging.borderempires.com"
      }
    });
  });

  it("requires durable database and simulation address settings in managed runtime", () => {
    expect(() => parseRealtimeGatewayRuntimeEnv({ NODE_ENV: "production" })).toThrow(
      "realtime gateway requires GATEWAY_SQLITE_PATH/SQLITE_PATH in managed runtime"
    );
    expect(() =>
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        SQLITE_PATH: "/data/gateway.db"
      })
    ).toThrow("realtime gateway requires SIMULATION_ADDRESS in managed runtime");
    expect(() =>
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        SQLITE_PATH: "/data/gateway.db",
        SIMULATION_ADDRESS: "border-empires-simulation.internal:50051"
      })
    ).toThrow("realtime gateway requires SIMULATION_SEED_PROFILE or SIMULATION_RULESET_ID in managed runtime");
  });

  it("parses explicit production configuration", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "8080",
        SQLITE_PATH: "/data/gateway.db",
        SIMULATION_ADDRESS: "border-empires-simulation.internal:50051",
        SIMULATION_SEED_PROFILE: "season-20ai",
        GATEWAY_DB_APPLY_SCHEMA: "1"
      })
    ).toEqual({
      host: "0.0.0.0",
      port: 8080,
      simulationAddress: "border-empires-simulation.internal:50051",
      simulationWakeAddress: "border-empires-simulation.flycast:50051",
      sqlitePath: "/data/gateway.db",
      applySchema: true,
      simulationSeedProfile: "season-20ai",
      allowNonAuthoritativeInitialState: false,
      fogAdminEmail: "bw199005@gmail.com",
      emailAlerts: {
        from: "Border Empires <alerts@borderempires.com>",
        appUrl: "https://staging.borderempires.com"
      }
    });
  });

  it("accepts the season-20ai seed profile locally", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        SIMULATION_SEED_PROFILE: "season-20ai"
      })
    ).toEqual({
      host: "127.0.0.1",
      port: 3101,
      simulationAddress: "127.0.0.1:50051",
      applySchema: false,
      defaultHumanPlayerId: "player-1",
      simulationSeedProfile: "season-20ai",
      allowNonAuthoritativeInitialState: true,
      fogAdminEmail: "bw199005@gmail.com",
      emailAlerts: {
        from: "Border Empires <alerts@borderempires.com>",
        appUrl: "https://staging.borderempires.com"
      }
    });
  });

  it("parses explicit fog admin email override", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        FOG_ADMIN_EMAIL: "  me@example.com  "
      })
    ).toEqual({
      host: "127.0.0.1",
      port: 3101,
      simulationAddress: "127.0.0.1:50051",
      applySchema: false,
      defaultHumanPlayerId: "player-1",
      simulationSeedProfile: "default",
      allowNonAuthoritativeInitialState: true,
      fogAdminEmail: "me@example.com",
      emailAlerts: {
        from: "Border Empires <alerts@borderempires.com>",
        appUrl: "https://staging.borderempires.com"
      }
    });
  });

  it("allows explicit override for non-authoritative fallback mode", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        SQLITE_PATH: "/data/gateway.db",
        SIMULATION_ADDRESS: "border-empires-simulation.internal:50051",
        SIMULATION_SEED_PROFILE: "season-20ai",
        GATEWAY_ALLOW_NON_AUTHORITATIVE_INITIAL_STATE: "1"
      })
    ).toEqual({
      host: "127.0.0.1",
      port: 3101,
      simulationAddress: "border-empires-simulation.internal:50051",
      simulationWakeAddress: "border-empires-simulation.flycast:50051",
      sqlitePath: "/data/gateway.db",
      applySchema: false,
      simulationSeedProfile: "season-20ai",
      allowNonAuthoritativeInitialState: true,
      fogAdminEmail: "bw199005@gmail.com",
      emailAlerts: {
        from: "Border Empires <alerts@borderempires.com>",
        appUrl: "https://staging.borderempires.com"
      }
    });
  });

  it("ignores GATEWAY_DEFAULT_HUMAN_PLAYER_ID in managed runtime without explicit opt-in", () => {
    // Regression test: staging previously had GATEWAY_DEFAULT_HUMAN_PLAYER_ID=player-1
    // set as a stray secret, which silently collapsed every distinct Firebase user
    // without an existing binding onto the same "player-1" account. The default
    // fallback must never activate in a managed runtime unless a second, explicit
    // flag confirms the operator intends it.
    expect(
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        SQLITE_PATH: "/data/gateway.db",
        SIMULATION_ADDRESS: "border-empires-simulation.internal:50051",
        SIMULATION_SEED_PROFILE: "season-20ai",
        GATEWAY_DEFAULT_HUMAN_PLAYER_ID: "player-1"
      }).defaultHumanPlayerId
    ).toBeUndefined();
  });

  it("honors GATEWAY_DEFAULT_HUMAN_PLAYER_ID in managed runtime when explicitly opted in", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        SQLITE_PATH: "/data/gateway.db",
        SIMULATION_ADDRESS: "border-empires-simulation.internal:50051",
        SIMULATION_SEED_PROFILE: "season-20ai",
        GATEWAY_DEFAULT_HUMAN_PLAYER_ID: "player-1",
        GATEWAY_ALLOW_DEFAULT_HUMAN_PLAYER_ID_IN_MANAGED_RUNTIME: "1"
      }).defaultHumanPlayerId
    ).toBe("player-1");
  });

  it("parses gameplay email alert settings", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        GATEWAY_EMAIL_ALERTS_RESEND_API_KEY: "re_test",
        GATEWAY_EMAIL_ALERTS_FROM: "alerts@example.com",
        GATEWAY_EMAIL_ALERTS_REPLY_TO: "support@example.com",
        GATEWAY_EMAIL_ALERTS_APP_URL: "https://play.example",
        GATEWAY_EMAIL_ALERTS_DAILY_LIMIT: "2"
      }).emailAlerts
    ).toEqual({
      resendApiKey: "re_test",
      from: "alerts@example.com",
      replyTo: "support@example.com",
      appUrl: "https://play.example",
      dailyLimit: 2
    });
  });
});
