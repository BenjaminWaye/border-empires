import { createRealtimeGatewayApp } from "./gateway-app.js";
import { parseRealtimeGatewayRuntimeEnv } from "./runtime-env.js";

const runtimeEnv = parseRealtimeGatewayRuntimeEnv(process.env);
const gateway = await createRealtimeGatewayApp({
  host: runtimeEnv.host,
  port: runtimeEnv.port,
  simulationAddress: runtimeEnv.simulationAddress,
  ...(runtimeEnv.databaseUrl ? { databaseUrl: runtimeEnv.databaseUrl } : {}),
  ...(runtimeEnv.snapshotDir ? { snapshotDir: runtimeEnv.snapshotDir } : {}),
  applySchema: runtimeEnv.applySchema,
  ...(runtimeEnv.defaultHumanPlayerId ? { defaultHumanPlayerId: runtimeEnv.defaultHumanPlayerId } : {}),
  ...(runtimeEnv.simulationSeedProfile ? { simulationSeedProfile: runtimeEnv.simulationSeedProfile } : {}),
  ...(runtimeEnv.runtimeIdentity ? { runtimeIdentity: runtimeEnv.runtimeIdentity } : {})
});

await gateway.start();
