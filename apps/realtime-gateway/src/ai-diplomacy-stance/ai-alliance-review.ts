// Periodically has each seeded AI leave alliances it no longer leads: once its
// bloc nears Dominance size (ALLIANCE_LEAVE_LAND_SHARE of the world's land) and a
// partner (or anyone in the bloc reached through them) is at least as large as
// the AI, staying would help that player toward the Diplomatic Dominance win.
// Uses the normal 24h break notice, so the partner sees it coming.
//
// Sizes come from the simulation's cached season leaderboard, fetched once
// per run -- not from a subscription as each AI, which would hold a full
// player snapshot per allied AI for the rest of the season.
import { alliancesAiShouldLeave, dominanceSizingFor, tileLookupFor, type AllyLookup, type SeasonSizes } from "./ai-alliance-bloc.js";
import { weakNeighboursToLeave, type AiAllianceView } from "./ai-alliance-conquest-review.js";

/** How often the review actually runs (it is called from the gateway's 60s alliance-break task). */
export const AI_ALLIANCE_REVIEW_INTERVAL_MS = 5 * 60_000;
/** Each AI re-weighs its weak-neighbour allies at most this often (owner call: every 4h is enough). */
export const AI_WEAK_NEIGHBOUR_RECHECK_MS = 4 * 60 * 60_000;

type BreakResult = { ok: true; payloadsByPlayerId: Map<string, unknown[]> } | { ok: false; code: string; message: string };

export type AiAllianceReviewDeps = {
  seededAiPlayerIds: ReadonlySet<string>;
  /** A seeded AI identity claimed by a live human decides for itself. */
  hasLiveSocket: (playerId: string) => boolean;
  alliesOf: AllyLookup;
  /** Allies the AI already gave notice to leave. */
  pendingBreaksOf: (playerId: string) => readonly string[];
  /** Every competitive player's tile count (the season summary's overall leaderboard) and the world's land count. */
  fetchLeaderboard: () => Promise<SeasonSizes>;
  playerName: (playerId: string) => string;
  breakAlliance: (playerId: string, targetPlayerId: string, announcementByPlayerId: Partial<Record<string, string>>) => BreakResult;
  fanoutPlayerPayloads: (payloadsByPlayerId: Map<string, unknown[]>) => void;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  now: () => number;
  /**
   * One AI's own map view (a one-off export: AIs hold no subscription). Re-checks weak neighbours it allied
   * (ai-alliance-conquest-review.ts): one AI per run, each at most every AI_WEAK_NEIGHBOUR_RECHECK_MS, so at
   * most one export every AI_ALLIANCE_REVIEW_INTERVAL_MS: per-AI view exports have stalled the simulation before.
   */
  fetchAiView?: (playerId: string) => Promise<AiAllianceView | undefined>;
  /** Whether the AI is at war with a player: the fronts it already fights on (ai-war-fronts.ts). */
  atWarWith?: (aiId: string, playerId: string) => boolean;
};

export const createAiAllianceReview = (deps: AiAllianceReviewDeps): (() => Promise<void>) => {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let running = false;
  // When each AI last re-weighed its weak-neighbour allies. Keyed by seeded AI id only, so bounded by that set.
  const lastViewCheckAt = new Map<string, number>();
  return async () => {
    if (running || deps.now() - lastRunAt < AI_ALLIANCE_REVIEW_INTERVAL_MS) return;
    running = true;
    lastRunAt = deps.now();
    try {
      let sizes: SeasonSizes | undefined;
      // The AI longest without a re-check, once its 4h are up: never more than one view export per run.
      const viewAi = [...deps.seededAiPlayerIds]
        .filter((aiId) => !deps.hasLiveSocket(aiId) && deps.alliesOf(aiId).length > 0)
        .filter((aiId) => lastRunAt - (lastViewCheckAt.get(aiId) ?? Number.NEGATIVE_INFINITY) >= AI_WEAK_NEIGHBOUR_RECHECK_MS)
        .sort((a, b) => (lastViewCheckAt.get(a) ?? Number.NEGATIVE_INFINITY) - (lastViewCheckAt.get(b) ?? Number.NEGATIVE_INFINITY))[0];
      for (const aiId of deps.seededAiPlayerIds) {
        if (deps.hasLiveSocket(aiId)) continue;
        const pending = new Set(deps.pendingBreaksOf(aiId));
        if (deps.alliesOf(aiId).every((allyId) => pending.has(allyId))) continue;
        sizes ??= await deps.fetchLeaderboard().catch(() => ({ tiles: [] }));
        // No size for the AI: don't leave an alliance on a guess.
        const tilesOf = tileLookupFor(sizes.tiles, aiId);
        if (!tilesOf) continue;
        for (const allyId of alliancesAiShouldLeave(aiId, deps.alliesOf, tilesOf, dominanceSizingFor(sizes))) {
          if (pending.has(allyId)) continue;
          const aiName = deps.playerName(aiId);
          const result = deps.breakAlliance(aiId, allyId, {
            [allyId]: `${aiName} started a 24h notice to leave your alliance: it no longer leads an alliance this large, and won't help anyone else toward Diplomatic Dominance.`,
            [aiId]: `You started a 24h notice to leave your alliance with ${deps.playerName(allyId)}.`
          });
          deps.recordGatewayEvent(result.ok ? "info" : "warn", "gateway_ai_alliance_left", {
            aiPlayerId: aiId,
            allyId,
            aiTiles: tilesOf(aiId),
            allyTiles: tilesOf(allyId),
            ...(result.ok ? {} : { code: result.code })
          });
          if (result.ok) deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
          pending.add(allyId);
        }
        if (aiId === viewAi && deps.fetchAiView) {
          lastViewCheckAt.set(aiId, lastRunAt);
          const view = await deps.fetchAiView(aiId).catch(() => undefined);
          const stillAllied = deps.alliesOf(aiId).filter((allyId) => !pending.has(allyId));
          const atWarWith = (playerId: string): boolean => deps.atWarWith?.(aiId, playerId) ?? false;
          for (const allyId of view ? weakNeighboursToLeave(aiId, stillAllied, tilesOf, view, atWarWith) : []) {
            const aiName = deps.playerName(aiId);
            const result = deps.breakAlliance(aiId, allyId, {
              [allyId]: `${aiName} started a 24h notice to leave your alliance: it would rather take your land. Fortify the towns and resources on your border with them to keep the alliance.`,
              [aiId]: `You started a 24h notice to leave your alliance with ${deps.playerName(allyId)}.`
            });
            deps.recordGatewayEvent(result.ok ? "info" : "warn", "gateway_ai_alliance_left_weak_neighbour", {
              aiPlayerId: aiId,
              allyId,
              aiTiles: tilesOf(aiId),
              allyTiles: tilesOf(allyId),
              ...(result.ok ? {} : { code: result.code })
            });
            if (result.ok) deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
          }
        }
      }
    } finally {
      running = false;
    }
  };
};
