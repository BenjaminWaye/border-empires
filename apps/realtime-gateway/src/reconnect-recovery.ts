import type { GatewayCommandStore } from "./command-store.js";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { SeasonVictoryObjectiveView } from "@border-empires/shared";
import { buildGatewayInitPayload } from "./init-payload.js";
import type { LegacySnapshotBootstrap } from "../../simulation/src/legacy-snapshot-bootstrap.js";
import type { PlayerProfileOverrides } from "./player-profile-overrides.js";
import type { SimulationSeedProfile } from "./seed-fallback.js";
import type { SocialState } from "./social-state.js";
import { supportedClientMessageTypes } from "./supported-client-messages.js";
import { withTimeout } from "./promise-timeout.js";

const INIT_RECOVERY_TIMEOUT_MS = 1_500;

export type PendingGatewayCommand = {
  commandId: string;
  clientSeq: number;
  type: string;
  status: "QUEUED" | "ACCEPTED";
  queuedAt: number;
  acceptedAt?: number;
  payload?: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  };
};

export const buildInitMessage = (
  playerIdentity: { playerId: string; playerName: string },
  commandStore: GatewayCommandStore,
  initialState?: PlayerSubscriptionSnapshot,
  seedProfile: SimulationSeedProfile = "default",
  snapshotBootstrap?: LegacySnapshotBootstrap,
  profileOverrides?: PlayerProfileOverrides,
  socialState?: SocialState
): Promise<{
  type: "INIT";
  runtimeIdentity: {
    sourceType: "legacy-snapshot" | "seed-profile";
    seasonId: string;
    worldSeed: number;
    fingerprint: string;
    snapshotLabel?: string;
    seedProfile?: string;
    playerCount: number;
    seededTileCount: number;
  };
  player: Record<string, unknown>;
  config: { width: number; height: number; season: { seasonId: string; worldSeed: number } };
  recovery: { nextClientSeq: number; pendingCommands: PendingGatewayCommand[] };
  supportedMessageTypes: string[];
  techChoices: string[];
  techCatalog: unknown[];
  domainChoices: string[];
  domainCatalog: unknown[];
  allianceRequests: unknown[];
  outgoingAllianceRequests: unknown[];
  truceRequests: unknown[];
  outgoingTruceRequests: unknown[];
  activeTruces: unknown[];
  leaderboard: Record<string, unknown>;
  playerStyles: Array<{ id: string; name: string; tileColor: string }>;
  missions: [];
  domainIds: string[];
  seasonVictory: SeasonVictoryObjectiveView[];
  mapMeta: {
    dockCount: number;
    dockPairCount: number;
    clusterCount: number;
    townCount: number;
    dockPairs: Array<{ ax: number; ay: number; bx: number; by: number }>;
  };
  initialState?: PlayerSubscriptionSnapshot;
}> =>
  Promise.allSettled([
    withTimeout(commandStore.nextClientSeqForPlayer(playerIdentity.playerId), INIT_RECOVERY_TIMEOUT_MS, "nextClientSeqForPlayer"),
    withTimeout(commandStore.listUnresolvedForPlayer(playerIdentity.playerId), INIT_RECOVERY_TIMEOUT_MS, "listUnresolvedForPlayer")
  ]).then(
    ([nextClientSeqResult, unresolvedCommandsResult]) => {
      const nextClientSeq = nextClientSeqResult.status === "fulfilled" ? nextClientSeqResult.value : 1;
      const bootstrap = buildGatewayInitPayload(playerIdentity, initialState, seedProfile, snapshotBootstrap);
      if (
        bootstrap.runtimeIdentity.seasonId !== bootstrap.config.season.seasonId ||
        bootstrap.runtimeIdentity.worldSeed !== bootstrap.config.season.worldSeed
      ) {
        throw new Error("gateway bootstrap runtime identity does not match config season metadata");
      }
      if (
        bootstrap.runtimeIdentity.sourceType === "seed-profile" &&
        bootstrap.runtimeIdentity.seedProfile !== seedProfile
      ) {
        throw new Error("gateway bootstrap runtime identity seed profile mismatch");
      }
      const override = profileOverrides?.get(playerIdentity.playerId);
      if (override?.name) bootstrap.player.name = override.name;
      if (override?.tileColor) bootstrap.player.tileColor = override.tileColor;
      if (typeof override?.profileComplete === "boolean") {
        Object.assign(bootstrap.player, { profileNeedsSetup: !override.profileComplete });
      } else if (bootstrap.runtimeIdentity.sourceType === "seed-profile") {
        Object.assign(bootstrap.player, { profileNeedsSetup: true });
      }
      for (const style of bootstrap.playerStyles) {
        const styleOverride = profileOverrides?.get(style.id);
        if (styleOverride?.name) style.name = styleOverride.name;
        if (styleOverride?.tileColor) style.tileColor = styleOverride.tileColor;
      }
      for (const entry of bootstrap.leaderboard.overall) {
        const styleOverride = profileOverrides?.get(entry.id);
        if (styleOverride?.name) entry.name = styleOverride.name;
      }
      if (bootstrap.leaderboard.selfOverall) {
        const selfOverride = profileOverrides?.get(bootstrap.leaderboard.selfOverall.id);
        if (selfOverride?.name) bootstrap.leaderboard.selfOverall.name = selfOverride.name;
      }
      for (const list of [bootstrap.leaderboard.byTiles, bootstrap.leaderboard.byIncome, bootstrap.leaderboard.byTechs]) {
        for (const entry of list) {
          const styleOverride = profileOverrides?.get(entry.id);
          if (styleOverride?.name) entry.name = styleOverride.name;
        }
      }
      if (bootstrap.leaderboard.selfByTiles) {
        const selfOverride = profileOverrides?.get(bootstrap.leaderboard.selfByTiles.id);
        if (selfOverride?.name) bootstrap.leaderboard.selfByTiles.name = selfOverride.name;
      }
      if (bootstrap.leaderboard.selfByIncome) {
        const selfOverride = profileOverrides?.get(bootstrap.leaderboard.selfByIncome.id);
        if (selfOverride?.name) bootstrap.leaderboard.selfByIncome.name = selfOverride.name;
      }
      if (bootstrap.leaderboard.selfByTechs) {
        const selfOverride = profileOverrides?.get(bootstrap.leaderboard.selfByTechs.id);
        if (selfOverride?.name) bootstrap.leaderboard.selfByTechs.name = selfOverride.name;
      }
      const socialSnapshot = socialState?.snapshotForPlayer(playerIdentity.playerId);
      return {
      type: "INIT",
      runtimeIdentity: bootstrap.runtimeIdentity,
      player: {
        ...bootstrap.player,
        allies: socialSnapshot?.allies ?? []
      },
      config: bootstrap.config,
      supportedMessageTypes: [...supportedClientMessageTypes],
      techChoices: bootstrap.techChoices,
      techCatalog: bootstrap.techCatalog,
      domainChoices: bootstrap.domainChoices,
      domainCatalog: bootstrap.domainCatalog,
      allianceRequests: socialSnapshot?.incomingAllianceRequests ?? [],
      outgoingAllianceRequests: socialSnapshot?.outgoingAllianceRequests ?? [],
      truceRequests: socialSnapshot?.incomingTruceRequests ?? [],
      outgoingTruceRequests: socialSnapshot?.outgoingTruceRequests ?? [],
      activeTruces: socialSnapshot?.activeTruces ?? [],
      leaderboard: bootstrap.leaderboard,
      playerStyles: bootstrap.playerStyles,
      missions: bootstrap.missions,
      domainIds: bootstrap.domainIds,
      seasonVictory: bootstrap.seasonVictory,
      mapMeta: bootstrap.mapMeta,
      ...(initialState ? { initialState } : {}),
      recovery: {
        nextClientSeq,
        pendingCommands: []
      }
      };
    }
  );
