import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { FirebaseTokenVerifier } from "../auth-identity/firebase-token-verifier.js";
import type { GatewayCommandStore } from "../command-store/command-store.js";
import type { EmailAlertConfig } from "../email-alerts/email-alerts.js";
import type { GalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import type { GalaxyEndorsementStore } from "../galaxy-endorsement-store/galaxy-endorsement-store.js";
import type { GalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";
import type { GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import type { GatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import type { PlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";
import type { SimulationSeedProfile } from "../seed-fallback.js";
import type { createSimulationClient } from "../sim-client/sim-client.js";
import type { wireGalaxyEconomy } from "../galaxy-economy-wiring/galaxy-economy-wiring.js";
import type { wireGalaxyFleets } from "../galaxy-fleet-wiring/galaxy-fleet-wiring.js";
import type { wireGalaxySenate } from "../galaxy-senate-wiring/galaxy-senate-wiring.js";

type SimulationClient = ReturnType<typeof createSimulationClient>;

export type RealtimeGatewayAppOptions = {
  host?: string; port?: number; logger?: boolean; simulationAddress?: string; simulationWakeAddress?: string;
  simulationClient?: SimulationClient; commandStore?: GatewayCommandStore; profileStore?: GatewayPlayerProfileStore;
  growthBaselineStore?: PlayerGrowthBaselineStore; authBindingStore?: GatewayAuthBindingStore;
  galaxyPlanetStore?: GalaxyPlanetStore; galaxyEconomyStore?: Awaited<ReturnType<typeof wireGalaxyEconomy>>["galaxyEconomyStore"]; galaxySenateStore?: Awaited<ReturnType<typeof wireGalaxySenate>>["galaxySenateStore"];
  galaxyEndorsementStore?: GalaxyEndorsementStore; galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore; galaxyFleetStore?: Awaited<ReturnType<typeof wireGalaxyFleets>>["galaxyFleetStore"]; galaxyBattleLogStore?: GalaxyBattleLogStore; galaxyExplorationStore?: GalaxyExplorationStore;
  socialStore?: import("../social-store/social-store.js").GatewaySocialStore; sqlitePath?: string; applySchema?: boolean;
  defaultHumanPlayerId?: string; firebaseProjectId?: string; firebaseTokenVerifier?: FirebaseTokenVerifier;
  simulationSeedProfile?: SimulationSeedProfile; allowNonAuthoritativeInitialState?: boolean;
  aiPlayerCount?: number; snapshotDir?: string; createCommandId?: () => string; now?: () => number;
  simulationPrepareTimeoutMs?: number; simulationSubscribeTimeoutMs?: number; simulationSubmitTimeoutMs?: number;
  simulationRpcRetryAttempts?: number; adminApiToken?: string; adminEmail?: string; emailAlerts?: EmailAlertConfig;
  playOrigin?: string; simMetricsUrl?: string; simDiagnostics?: () => unknown[]; wsHeartbeatIntervalMs?: number;
};
