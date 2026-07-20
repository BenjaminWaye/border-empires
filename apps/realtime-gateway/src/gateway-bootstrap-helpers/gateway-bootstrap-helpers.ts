// Small, self-contained payload/bootstrap helpers used by gateway-app.ts's
// message handling and login (AUTH) flow. Extracted verbatim out of
// gateway-app.ts (which is already over the repo's 500-line file cap and may
// not grow) to make room for login-phase progress instrumentation without
// increasing gateway-app.ts's own line count. None of these close over any
// gateway-app.ts factory state — they take everything as explicit params.
import { unwrapPayloadSource } from "../broadcast-payload/broadcast-payload.js";
import type { createPlayerProfileOverrides } from "../player-profile-overrides.js";
import type { GatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import type { SimulationClientEvent } from "../sim-client/sim-client.js";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

export const jsonSafeTileDeltaBatch = (
  tileDeltas: Array<
    | NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number]
    | NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>
  >
): Array<Record<string, unknown>> =>
  tileDeltas.map((tileDelta) => ({
    ...tileDelta,
    ...("ownerId" in tileDelta && tileDelta.ownerId === undefined ? { ownerId: null } : {}),
    ...("ownershipState" in tileDelta && tileDelta.ownershipState === undefined ? { ownershipState: null } : {}),
    ...("frontierDecayAt" in tileDelta && tileDelta.frontierDecayAt === undefined ? { frontierDecayAt: null } : {}),
    ...("frontierDecayKind" in tileDelta && tileDelta.frontierDecayKind === undefined ? { frontierDecayKind: null } : {}),
    ...("breachShockUntil" in tileDelta && tileDelta.breachShockUntil === undefined ? { breachShockUntil: null } : {}),
    ...("fortJson" in tileDelta && tileDelta.fortJson === undefined ? { fortJson: "" } : {}),
    ...("observatoryJson" in tileDelta && tileDelta.observatoryJson === undefined ? { observatoryJson: "" } : {}),
    ...("siegeOutpostJson" in tileDelta && tileDelta.siegeOutpostJson === undefined ? { siegeOutpostJson: "" } : {}),
    ...("economicStructureJson" in tileDelta && tileDelta.economicStructureJson === undefined
      ? { economicStructureJson: "" }
      : {}),
    ...("sabotageJson" in tileDelta && tileDelta.sabotageJson === undefined ? { sabotageJson: "" } : {}),
    ...("shardSiteJson" in tileDelta && tileDelta.shardSiteJson === undefined ? { shardSiteJson: "" } : {}),
    ...("musterJson" in tileDelta && tileDelta.musterJson === undefined ? { musterJson: "" } : {}),
    ...("ownershipClearOnly" in tileDelta && tileDelta.ownershipClearOnly ? { ownershipClearOnly: true } : {})
  }));

export const optionalCommandMetadata = (message: unknown): { commandId?: string; clientSeq?: number } => {
  if (!message || typeof message !== "object") return {};
  const candidate = message as { commandId?: unknown; clientSeq?: unknown };
  return {
    ...(typeof candidate.commandId === "string" ? { commandId: candidate.commandId } : {}),
    ...(typeof candidate.clientSeq === "number" ? { clientSeq: candidate.clientSeq } : {})
  };
};

export const readPayloadType = (payload: unknown): string | undefined => {
  const source = unwrapPayloadSource(payload);
  if (!source || typeof source !== "object") return undefined;
  const candidate = source as { type?: unknown };
  return typeof candidate.type === "string" ? candidate.type : undefined;
};

export const readPayloadCommandId = (payload: unknown): string | undefined => {
  const source = unwrapPayloadSource(payload);
  if (!source || typeof source !== "object") return undefined;
  const candidate = source as { commandId?: unknown };
  return typeof candidate.commandId === "string" ? candidate.commandId : undefined;
};

export const readPayloadTarget = (payload: unknown): { x: number; y: number } | undefined => {
  const source = unwrapPayloadSource(payload);
  if (!source || typeof source !== "object") return undefined;
  const candidate = source as { target?: unknown };
  if (!candidate.target || typeof candidate.target !== "object") return undefined;
  const target = candidate.target as { x?: unknown; y?: unknown };
  return typeof target.x === "number" && typeof target.y === "number" ? { x: target.x, y: target.y } : undefined;
};

const visibleBootstrapPlayerIds = (snapshot: PlayerSubscriptionSnapshot | undefined): string[] => {
  const playerIds = new Set<string>();
  const worldStatus = snapshot?.worldStatus;
  const leaderboard = worldStatus?.leaderboard;
  if (leaderboard) {
    for (const entry of leaderboard.overall) playerIds.add(entry.id);
    for (const entry of leaderboard.byTiles) playerIds.add(entry.id);
    for (const entry of leaderboard.byIncome) playerIds.add(entry.id);
    for (const entry of leaderboard.byTechs) playerIds.add(entry.id);
    if (leaderboard.selfOverall) playerIds.add(leaderboard.selfOverall.id);
    if (leaderboard.selfByTiles) playerIds.add(leaderboard.selfByTiles.id);
    if (leaderboard.selfByIncome) playerIds.add(leaderboard.selfByIncome.id);
    if (leaderboard.selfByTechs) playerIds.add(leaderboard.selfByTechs.id);
  }
  for (const objective of worldStatus?.seasonVictory ?? []) {
    if (objective.leaderPlayerId) playerIds.add(objective.leaderPlayerId);
  }
  return [...playerIds];
};

export const hydrateVisibleLeaderboardProfileOverrides = async (
  snapshot: PlayerSubscriptionSnapshot | undefined,
  profileStore: GatewayPlayerProfileStore,
  profileOverrides: ReturnType<typeof createPlayerProfileOverrides>
): Promise<void> => {
  const visiblePlayerProfiles = await profileStore.getMany(visibleBootstrapPlayerIds(snapshot));
  for (const profile of visiblePlayerProfiles) {
    profileOverrides.upsert(profile.playerId, {
      ...(profile.name ? { name: profile.name } : {}),
      ...(profile.tileColor ? { tileColor: profile.tileColor } : {}),
      ...(typeof profile.profileComplete === "boolean" ? { profileComplete: profile.profileComplete } : {})
    });
  }
};
