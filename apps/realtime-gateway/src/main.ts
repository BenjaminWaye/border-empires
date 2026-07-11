import { createRealtimeGatewayApp } from "./gateway-app/gateway-app.js";
import { parseRealtimeGatewayRuntimeEnv } from "./runtime-env/runtime-env.js";

const runtimeEnv = parseRealtimeGatewayRuntimeEnv(process.env);
const gateway = await createRealtimeGatewayApp({
  host: runtimeEnv.host,
  port: runtimeEnv.port,
  simulationAddress: runtimeEnv.simulationAddress,
  ...(runtimeEnv.simulationWakeAddress ? { simulationWakeAddress: runtimeEnv.simulationWakeAddress } : {}),
  ...(runtimeEnv.sqlitePath ? { sqlitePath: runtimeEnv.sqlitePath } : {}),
  ...(runtimeEnv.snapshotDir ? { snapshotDir: runtimeEnv.snapshotDir } : {}),
  applySchema: runtimeEnv.applySchema,
  ...(runtimeEnv.defaultHumanPlayerId ? { defaultHumanPlayerId: runtimeEnv.defaultHumanPlayerId } : {}),
  simulationSeedProfile: runtimeEnv.simulationSeedProfile,
  allowNonAuthoritativeInitialState: runtimeEnv.allowNonAuthoritativeInitialState,
  ...(runtimeEnv.adminApiToken ? { adminApiToken: runtimeEnv.adminApiToken } : {}),
  ...(runtimeEnv.fogAdminEmail ? { fogAdminEmail: runtimeEnv.fogAdminEmail } : {}),
  ...(runtimeEnv.aiPlayerCount ? { aiPlayerCount: runtimeEnv.aiPlayerCount } : {}),
  emailAlerts: runtimeEnv.emailAlerts
});

await gateway.start();
