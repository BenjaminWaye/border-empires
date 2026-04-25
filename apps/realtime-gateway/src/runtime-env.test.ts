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
      disableFog: false
    });
  });

  it("requires durable database and simulation address settings in managed runtime", () => {
    expect(() => parseRealtimeGatewayRuntimeEnv({ NODE_ENV: "production" })).toThrow(
      "realtime gateway requires GATEWAY_DATABASE_URL or DATABASE_URL in managed runtime"
    );
    expect(() =>
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://gateway"
      })
    ).toThrow("realtime gateway requires SIMULATION_ADDRESS in managed runtime");
    expect(() =>
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://gateway",
        SIMULATION_ADDRESS: "border-empires-simulation.internal:50051"
      })
    ).toThrow("realtime gateway requires SIMULATION_SEED_PROFILE in managed runtime");
  });

  it("parses explicit production configuration", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "8080",
        DATABASE_URL: "postgres://gateway",
        SIMULATION_ADDRESS: "border-empires-simulation.internal:50051",
        SIMULATION_SEED_PROFILE: "season-20ai",
        GATEWAY_DB_APPLY_SCHEMA: "1"
      })
    ).toEqual({
      host: "0.0.0.0",
      port: 8080,
      simulationAddress: "border-empires-simulation.internal:50051",
      simulationWakeAddress: "border-empires-simulation.flycast:50051",
      databaseUrl: "postgres://gateway",
      applySchema: true,
      simulationSeedProfile: "season-20ai",
      allowNonAuthoritativeInitialState: false,
      disableFog: false
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
      disableFog: false
    });
  });

  it("allows explicit override for non-authoritative fallback mode", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://gateway",
        SIMULATION_ADDRESS: "border-empires-simulation.internal:50051",
        SIMULATION_SEED_PROFILE: "season-20ai",
        GATEWAY_ALLOW_NON_AUTHORITATIVE_INITIAL_STATE: "1"
      })
    ).toEqual({
      host: "127.0.0.1",
      port: 3101,
      simulationAddress: "border-empires-simulation.internal:50051",
      simulationWakeAddress: "border-empires-simulation.flycast:50051",
      databaseUrl: "postgres://gateway",
      applySchema: false,
      simulationSeedProfile: "season-20ai",
      allowNonAuthoritativeInitialState: true,
      disableFog: false
    });
  });

  it("parses a staging fog-disable override", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        GATEWAY_DISABLE_FOG: "1"
      })
    ).toEqual({
      host: "127.0.0.1",
      port: 3101,
      simulationAddress: "127.0.0.1:50051",
      applySchema: false,
      defaultHumanPlayerId: "player-1",
      simulationSeedProfile: "default",
      allowNonAuthoritativeInitialState: true,
      disableFog: true
    });
  });
});
