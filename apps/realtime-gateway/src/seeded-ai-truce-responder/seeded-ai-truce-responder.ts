import type { DomainPlayer } from "@border-empires/game-domain";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { SimulationSeedWorld } from "../../../simulation/src/seed-state/seed-state.js";
import type { SocialTruceRequest } from "../social-state/social-state.js";

export const extractTruceRequestFromPayloads = (
  payloadsByPlayerId: Map<string, unknown[]>,
  playerId: string
): SocialTruceRequest | undefined => {
  for (const payload of payloadsByPlayerId.get(playerId) ?? []) {
    if (!payload || typeof payload !== "object") continue;
    const typed = payload as { type?: unknown; request?: unknown };
    if (typed.type !== "TRUCE_REQUESTED" || !typed.request || typeof typed.request !== "object") continue;
    return typed.request as SocialTruceRequest;
  }
  return undefined;
};

const adjacentKeysForTile = (x: number, y: number): string[] => [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`];

const seededAiTruceDecisionFromSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  request: SocialTruceRequest,
  economyStrained = false
): "accept" | "reject" => {
  const tilesByKey = new Map<string, PlayerSubscriptionSnapshot["tiles"][number]>(
    snapshot.tiles.map((tile: PlayerSubscriptionSnapshot["tiles"][number]) => [`${tile.x},${tile.y}`, tile] as const)
  );
  let pressuredBorderTiles = 0;
  let pressuredTownTiles = 0;
  for (const tile of snapshot.tiles) {
    if (tile.ownerId !== request.toPlayerId || tile.terrain !== "LAND") continue;
    const hasRequesterNeighbor = adjacentKeysForTile(tile.x, tile.y).some((key) => tilesByKey.get(key)?.ownerId === request.fromPlayerId);
    if (!hasRequesterNeighbor) continue;
    pressuredBorderTiles += 1;
    if (tile.townType || tile.townJson) pressuredTownTiles += 1;
  }
  const coreThreatened = pressuredTownTiles > 0;
  if (pressuredBorderTiles <= 0) return "reject";
  if (coreThreatened && !economyStrained) return "reject";
  if (request.durationHours === 12) return "accept";
  return economyStrained ? "accept" : "reject";
};

const seededAiEconomyStrained = (
  player:
    | PlayerSubscriptionSnapshot["player"]
    | {
        strategicResources?: Partial<Record<"FOOD", number>>;
        strategicProductionPerMinute?: Partial<Record<"FOOD", number>>;
      }
    | undefined
): boolean => {
  if (!player) return false;
  const incomePerMinute = "incomePerMinute" in player ? player.incomePerMinute : 0;
  const foodStock = player.strategicResources?.FOOD ?? 0;
  const foodProduction = player.strategicProductionPerMinute?.FOOD ?? 0;
  return incomePerMinute < 40 || foodStock < 50 || foodProduction < 0;
};

const playerSubscriptionSnapshotFromSeedWorld = (
  seedWorld: SimulationSeedWorld,
  playerId: string
): PlayerSubscriptionSnapshot => ({
  playerId,
  tiles: [...seedWorld.tiles.values()].map((tile) => ({
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain,
    ...(tile.resource ? { resource: tile.resource } : {}),
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
    ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
    ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
    ...(typeof tile.breachShockUntil === "number" ? { breachShockUntil: tile.breachShockUntil } : {}),
    ...(tile.town?.type ? { townType: tile.town.type } : {}),
    ...(tile.town?.name ? { townName: tile.town.name } : {}),
    ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {})
  }))
});

type SocialTruceActionResult =
  | { ok: true; payloadsByPlayerId: Map<string, unknown[]> }
  | { ok: false; code: string; message: string };

export type SeededAiTruceResponderDeps = {
  seededAiPlayerIds: ReadonlySet<string>;
  seedPlayers: Map<string, DomainPlayer>;
  seedWorld: SimulationSeedWorld;
  snapshotForPlayer: (playerId: string) => PlayerSubscriptionSnapshot | undefined;
  acceptTruce: (playerId: string, requestId: string) => SocialTruceActionResult;
  rejectTruce: (
    playerId: string,
    requestId: string,
    announcementByPlayerId?: Partial<Record<string, string>>
  ) => SocialTruceActionResult;
  syncPlayers: (playerIds: string[]) => { payloadsByPlayerId: Map<string, unknown[]> };
  fanoutPlayerPayloads: (payloadsByPlayerId: Map<string, unknown[]>) => void;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
};

export const createSeededAiTruceResponder = (deps: SeededAiTruceResponderDeps) => ({
  maybeAutoRespondToSeededAiTruce: async (request: SocialTruceRequest | undefined): Promise<void> => {
    if (!request || !deps.seededAiPlayerIds.has(request.toPlayerId)) return;
    const decisionSnapshot = deps.snapshotForPlayer(request.fromPlayerId);
    const targetDecisionSnapshot = deps.snapshotForPlayer(request.toPlayerId);
    const economyStrained = seededAiEconomyStrained(targetDecisionSnapshot?.player ?? deps.seedPlayers.get(request.toPlayerId));
    const seedDecisionSnapshot = playerSubscriptionSnapshotFromSeedWorld(deps.seedWorld, request.fromPlayerId);
    const liveSnapshotHasTargetTiles = Boolean(
      decisionSnapshot?.tiles.some((tile: PlayerSubscriptionSnapshot["tiles"][number]) => tile.ownerId === request.toPlayerId)
    );
    const liveDecision = decisionSnapshot ? seededAiTruceDecisionFromSnapshot(decisionSnapshot, request, economyStrained) : "reject";
    const seedDecision = seededAiTruceDecisionFromSnapshot(seedDecisionSnapshot, request, economyStrained);
    const decision = liveSnapshotHasTargetTiles ? liveDecision : seedDecision;
    if (!decisionSnapshot) {
      deps.recordGatewayEvent("warn", "gateway_ai_truce_snapshot_failed", {
        aiPlayerId: request.toPlayerId,
        fromPlayerId: request.fromPlayerId,
        error: "requester snapshot unavailable"
      });
    }

    const aiName = request.toName ?? request.toPlayerId;
    const response =
      decision === "accept"
        ? deps.acceptTruce(request.toPlayerId, request.id)
        : deps.rejectTruce(request.toPlayerId, request.id, {
            [request.fromPlayerId]: `${aiName} declined your truce offer.`,
            [request.toPlayerId]: `You declined ${request.fromName ?? request.fromPlayerId}'s truce offer.`
          });
    if (!response.ok) {
      deps.recordGatewayEvent("warn", "gateway_ai_truce_response_failed", {
        aiPlayerId: request.toPlayerId,
        fromPlayerId: request.fromPlayerId,
        decision,
        code: response.code,
        message: response.message
      });
      deps.fanoutPlayerPayloads(deps.syncPlayers([request.fromPlayerId, request.toPlayerId]).payloadsByPlayerId);
      return;
    }
    deps.recordGatewayEvent("info", "gateway_ai_truce_response", {
      aiPlayerId: request.toPlayerId,
      fromPlayerId: request.fromPlayerId,
      decision,
      durationHours: request.durationHours
    });
    deps.fanoutPlayerPayloads(response.payloadsByPlayerId);
  }
});
