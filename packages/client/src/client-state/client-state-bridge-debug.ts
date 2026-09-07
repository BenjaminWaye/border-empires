// Extracted from client-state.ts's createInitialState (which is over the
// 500-line file-size limit) to keep that file from growing further.
export const createBridgeDebugInitialState = () => ({
  activeBackend: "legacy" as "legacy" | "gateway",
  bridgeDebugMode: "unknown" as "unknown" | "legacy-server" | "rewrite-gateway",
  bridgeDebugBootstrap: "pending" as "pending" | "legacy-init" | "rewrite-init",
  bridgeDebugWsUrl: "",
  bridgeDebugSeasonId: "",
  bridgeDebugRuntimeFingerprint: "",
  bridgeDebugSnapshotLabel: "",
  // Set from INIT.serverBuildSha. Empty string means the gateway was started
  // without BUILD_SHA in its environment (local dev, ad-hoc machine start
  // without a deploy) — the HUD renders that as "dev".
  bridgeDebugServerBuildSha: "",
  bridgeDebugInitialTileCount: 0,
  bridgeDebugSupportedMessageCount: 0,
  bridgeDebugAcceptLatencyP95Ms: 0
});
