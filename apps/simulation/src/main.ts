// Standalone simulation entry — runs the simulation service as its own OS
// process (the pre-merged deployment shape, still used for integration tests
// and the legacy two-process Fly app). The combined deployment spawns the
// simulation in a worker thread instead; see worker-main.ts.
//
// Setup is shared with worker-main.ts via bootstrapSimulationProcess(); this
// file only wires the POSIX signal lifecycle and uncaught-error handlers,
// which are meaningful for a process root but not for a worker.
import { bootstrapSimulationProcess } from "./process-bootstrap.js";

const { runtimeEnv, binding, beginShutdown } = await bootstrapSimulationProcess();

console.info(
  {
    grpcAddress: binding.address,
    metricsAddress: `${runtimeEnv.metricsHost}:${runtimeEnv.metricsPort}`,
    healthProbeIntervalMs: runtimeEnv.healthProbeIntervalMs,
    healthProbeTimeoutMs: runtimeEnv.healthProbeTimeoutMs,
    healthFailureThreshold: runtimeEnv.healthFailureThreshold
  },
  "simulation process listeners ready"
);

process.once("SIGTERM", () => {
  void beginShutdown("SIGTERM");
});
process.once("SIGINT", () => {
  void beginShutdown("SIGINT");
});
process.once("uncaughtException", (error) => {
  console.error({ err: error }, "simulation process uncaught exception");
  process.exitCode = 1;
  void beginShutdown("uncaughtException");
});
process.once("unhandledRejection", (reason) => {
  console.error({ err: reason }, "simulation process unhandled rejection");
  process.exitCode = 1;
  void beginShutdown("unhandledRejection");
});
