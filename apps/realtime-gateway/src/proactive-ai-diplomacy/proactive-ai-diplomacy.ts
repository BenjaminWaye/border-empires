import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { type AiDiplomacySnapshot } from "../ai-diplomacy-stance/ai-diplomacy-stance-input.js";
import { evaluateAiDiplomacy, type AiDiplomacyContext } from "../ai-diplomacy-stance/ai-diplomacy-evaluation.js";
import type { SocialState } from "../social-state/social-state.js";
import { extractAllianceRequestFromPayloads, extractTruceRequestFromPayloads, type SeededAiDiplomacyResponder } from "../seeded-ai-diplomacy-responder/seeded-ai-diplomacy-responder.js";

type Tile = Pick<PlayerSubscriptionSnapshot["tiles"][number], "x" | "y" | "ownerId">;
const neighbors = (tile: Tile): string[] => [
  `${wrapX(tile.x + 1, WORLD_WIDTH)},${tile.y}`, `${wrapX(tile.x - 1, WORLD_WIDTH)},${tile.y}`,
  `${tile.x},${wrapY(tile.y + 1, WORLD_HEIGHT)}`, `${tile.x},${wrapY(tile.y - 1, WORLD_HEIGHT)}`
];

export function aiDiplomacyNeighbors(tiles: readonly Tile[], playerId: string): string[] {
  const owners = new Map(tiles.map(tile => [`${tile.x},${tile.y}`, tile.ownerId]));
  const ids = new Set<string>();
  for (const tile of tiles) {
    if (tile.ownerId !== playerId) continue;
    for (const key of neighbors(tile)) {
      const owner = owners.get(key);
      if (owner && owner !== playerId && !owner.startsWith("barbarian-")) ids.add(owner);
    }
  }
  return [...ids].sort();
}

export function haveSharedVisibleEnemy(tiles: readonly Tile[], aiId: string, targetId: string, friendly: ReadonlySet<string>): boolean {
  const owners = new Map(tiles.map(tile => [`${tile.x},${tile.y}`, tile.ownerId]));
  const aiEnemies = new Set<string>(), targetEnemies = new Set<string>();
  for (const tile of tiles) {
    if (tile.ownerId !== aiId && tile.ownerId !== targetId) continue;
    const enemies = tile.ownerId === aiId ? aiEnemies : targetEnemies;
    for (const key of neighbors(tile)) {
      const owner = owners.get(key);
      if (owner && owner !== aiId && owner !== targetId && !friendly.has(owner)) enemies.add(owner);
    }
  }
  return [...aiEnemies].some(id => targetEnemies.has(id));
}

export type ProactiveAiDiplomacyDeps = {
  socialState: SocialState;
  aiPlayerIds: ReadonlySet<string>;
  fetchSnapshot: (id: string) => Promise<AiDiplomacySnapshot | undefined>;
  hasLiveSocket: (id: string) => boolean;
  nameForPlayerId?: (id: string) => Promise<string | undefined>;
  responder: SeededAiDiplomacyResponder;
  diplomacyContext: (requesterId: string, aiPlayerId: string) => AiDiplomacyContext;
  syncForcedTruce?: (playerId: string, targetPlayerId: string) => Promise<void>;
  fanout: (payloads: Map<string, unknown[]>) => void;
  recordEvent: (level: "info" | "warn" | "error", name: string, payload?: Record<string, unknown>) => void;
};

/** One AI and at most one offer per tick. No per-player timers/caches;
 * pending requests, cooldowns and relationships belong to durable SocialState. */
export function createProactiveAiDiplomacy(deps: ProactiveAiDiplomacyDeps): { tick: () => Promise<void>; stop: () => void } {
  let cursor = 0;
  let running = false;
  let stopped = false;
  return { stop: () => { stopped = true; }, tick: async () => {
    if (stopped || running || deps.aiPlayerIds.size === 0) return;
    running = true;
    try {
      const ids = [...deps.aiPlayerIds];
      const round = Math.floor(cursor / ids.length);
      const aiId = ids[cursor % ids.length]!;
      cursor = (cursor + 1) % (ids.length * 1000);
      if (deps.hasLiveSocket(aiId)) return;
      const ai = await deps.fetchSnapshot(aiId);
      if (stopped || !ai?.player || deps.hasLiveSocket(aiId)) return;
      const social = deps.socialState.snapshotForPlayer(aiId);
      if (social.incomingTruceRequests[0]) {
        await deps.responder.maybeAutoRespondToSeededAiTruce(social.incomingTruceRequests[0]);
        return;
      }
      if (social.incomingAllianceRequests[0]) {
        await deps.responder.maybeAutoRespondToSeededAiAlliance(social.incomingAllianceRequests[0]);
        return;
      }
      if (social.outgoingAllianceRequests.length || social.outgoingTruceRequests.length) return;
      const friendly = new Set([...social.allies, ...social.activeTruces.map(t => t.otherPlayerId)]);
      const candidates = aiDiplomacyNeighbors(ai.tiles, aiId).filter(id => !friendly.has(id) &&
        !social.truceBreaksThisSeason.some(record => record.targetPlayerId === id) &&
        !social.activeAllianceBreaks.some(record => record.otherPlayerId === id) &&
        !social.offerCooldowns.some(cooldown => cooldown.targetPlayerId === id && cooldown.until > Date.now()));
      const targetId = candidates[round % candidates.length];
      if (!targetId) return;
      const target = await deps.fetchSnapshot(targetId);
      const targetName = await deps.nameForPlayerId?.(targetId) ?? target?.player?.name;
      if (stopped || !target?.player || !targetName || deps.hasLiveSocket(aiId)) return;
      const targetSocial = deps.socialState.snapshotForPlayer(targetId);
      const evaluation = evaluateAiDiplomacy({ aiPlayerId: aiId, aiName: ai.player.name ?? aiId,
        aiSnapshot: ai, requesterId: targetId, requesterSnapshot: target,
        ...deps.diplomacyContext(targetId, aiId) });
      if (!evaluation) return;
      const { stance } = evaluation;
      const aiLand = ai.tiles.filter(tile => tile.ownerId === aiId).length;
      const targetLand = target.tiles.filter(tile => tile.ownerId === targetId).length;
      // Alliances need a common enemy and cannot knowingly concede bloc
      // leadership to a larger partner. A threatened AI asks for peace instead.
      const alliance = !evaluation.allianceRefusal && social.allies.length < 2 && aiLand >= targetLand && targetLand > 0 &&
        stance.kind !== "SEEKING_PEACE" && stance.kind !== "DISTRUSTFUL" &&
        haveSharedVisibleEnemy(ai.tiles, aiId, targetId, new Set([...friendly, ...targetSocial.allies, ...targetSocial.activeTruces.map(t => t.otherPlayerId)]));
      const peace = !evaluation.truceRefusal && (stance.kind === "SEEKING_PEACE" || stance.kind === "OUTMATCHED");
      if (!alliance && !peace) return;
      if (peace && ai.player.domainIds?.includes("afc-chancery-4") && deps.syncForcedTruce && (social.forcedTruceCooldownUntil ?? 0) <= Date.now()) {
        const forced = deps.socialState.forceTruce(aiId, targetId);
        if (forced.ok) { await deps.syncForcedTruce(aiId, targetId); deps.fanout(forced.payloadsByPlayerId); return; }
      }
      const result = alliance ? deps.socialState.requestAlliance(aiId, targetName) : deps.socialState.requestTruce(aiId, targetName, 12);
      if (!result.ok) {
        deps.recordEvent("info", "gateway_ai_diplomacy_offer_blocked", { aiPlayerId: aiId, targetId, code: result.code });
        return;
      }
      deps.recordEvent("info", "gateway_ai_diplomacy_offer", { aiPlayerId: aiId, targetId, kind: alliance ? "alliance" : "truce" });
      deps.fanout(result.payloadsByPlayerId);
      if (alliance) await deps.responder.maybeAutoRespondToSeededAiAlliance(extractAllianceRequestFromPayloads(result.payloadsByPlayerId, aiId));
      else await deps.responder.maybeAutoRespondToSeededAiTruce(extractTruceRequestFromPayloads(result.payloadsByPlayerId, aiId));
    } catch (error) {
      deps.recordEvent("warn", "gateway_ai_diplomacy_tick_failed", { error: error instanceof Error ? error.message : String(error) });
    } finally { running = false; }
  } };
}
