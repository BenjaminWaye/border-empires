import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import type { FastifyInstance } from "fastify";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GalaxySenateProposalType, GalaxySenateStore } from "../galaxy-senate-store/galaxy-senate-store.js";
import { resolveGalaxyHoldingsByOwner } from "../galaxy-holdings/galaxy-holdings.js";
import { resolveGalaxyDominionWeights } from "../galaxy-dominion-weight/galaxy-dominion-weight.js";
import { GALAXY_SENATE_ACTIONS, MIN_DISTINCT_VOTERS, currentGlobalCycleIndex, isTargetOnCooldown } from "../galaxy-senate-tick/galaxy-senate-tick.js";
import { GALAXY_CYCLE_LENGTH_MS } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";
import { bearerHeader } from "../bearer-header/bearer-header.js";

// Kept as its own route module rather than growing galaxy-routes.ts (§4/§13
// Senate: proposals + voting) -- new gameplay surface, not a variant of the
// existing /hq/galaxy* territory endpoints.
export type RegisterGalaxySenateRoutesDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authenticateBearer?: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  authBindingStore?: GatewayAuthBindingStore;
  galaxyEconomyStore?: GalaxyEconomyStore;
  galaxySenateStore?: GalaxySenateStore;
};

const PROPOSAL_TYPES: readonly GalaxySenateProposalType[] = ["EMBARGO", "CONTEST"];

type ProposeBody = { type?: unknown; targetSeasonId?: unknown };
type VoteBody = { proposalId?: unknown };

export const registerGalaxySenateRoutes = (app: FastifyInstance, deps: RegisterGalaxySenateRoutesDeps): void => {
  const unavailable = (): boolean =>
    !deps.authenticateBearer || !deps.authBindingStore || !deps.galaxyEconomyStore || !deps.galaxySenateStore;

  app.post("/hq/galaxy/senate/propose", async (request, reply) => {
    if (unavailable()) {
      reply.code(503);
      return { ok: false, error: "galaxy senate is unavailable" };
    }
    const authBindingStore = deps.authBindingStore!;
    const galaxyEconomyStore = deps.galaxyEconomyStore!;
    const galaxySenateStore = deps.galaxySenateStore!;

    const identity = await deps.authenticateBearer!(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const proposerAuthUid = identity.authUid;

    const body = request.body && typeof request.body === "object" ? (request.body as ProposeBody) : {};
    const type = typeof body.type === "string" ? (body.type as GalaxySenateProposalType) : undefined;
    const targetSeasonId = typeof body.targetSeasonId === "string" ? body.targetSeasonId : undefined;
    if (!type || !PROPOSAL_TYPES.includes(type) || !targetSeasonId) {
      reply.code(400);
      return { ok: false, error: `type must be one of ${PROPOSAL_TYPES.join("/")}, and targetSeasonId is required` };
    }

    const holdingsByOwner = await resolveGalaxyHoldingsByOwner({
      listSeasonArchives: deps.listSeasonArchives,
      ...(deps.getCurrentSeasonSummary ? { getCurrentSeasonSummary: deps.getCurrentSeasonSummary } : {}),
      authBindingStore
    });

    // §4: "Any Planet-holding empire can raise a proposal" -- Outposts alone
    // don't qualify, matching Space View's own Planet-only eligibility gate.
    const proposerHoldsPlanet = (holdingsByOwner.get(proposerAuthUid) ?? []).some((t) => t.tier === "PLANET");
    if (!proposerHoldsPlanet) {
      reply.code(403);
      return { ok: false, error: "only a Planet-holding empire may raise a Senate proposal" };
    }

    let targetAuthUid: string | undefined;
    for (const [authUid, territories] of holdingsByOwner) {
      if (territories.some((t) => t.seasonId === targetSeasonId)) {
        targetAuthUid = authUid;
        break;
      }
    }
    if (!targetAuthUid) {
      reply.code(404);
      return { ok: false, error: "targetSeasonId is not a currently held territory" };
    }

    const nowMs = Date.now();
    const currentCycleIndex = currentGlobalCycleIndex(nowMs);

    const latestResolved = await galaxySenateStore.getLatestResolvedProposal(targetAuthUid, type);
    const latestResolvedCycleIndex = latestResolved?.resolvedAt !== undefined ? currentGlobalCycleIndex(latestResolved.resolvedAt) : undefined;
    if (isTargetOnCooldown(type, latestResolvedCycleIndex, currentCycleIndex)) {
      reply.code(409);
      return { ok: false, error: "this target is on cooldown for this action" };
    }

    const cost = GALAXY_SENATE_ACTIONS[type].influenceCost;
    const balance = await galaxyEconomyStore.getBalance(proposerAuthUid);
    if ((balance?.influence ?? 0) < cost) {
      reply.code(402);
      return { ok: false, error: `raising a ${type} proposal costs ${cost} Influence` };
    }

    // Create the proposal before deducting the cost: if the store write
    // fails, the proposer is out nothing rather than having paid for a
    // proposal that never got created. targetSeasonId is only stored for
    // CONTEST (the specific territory it forces open) -- EMBARGO targets
    // the whole empire, per galaxy-senate-store.ts's own field docs. The
    // route still requires it from the caller either way, purely as how a
    // client identifies the target empire (there's no other authUid-free
    // way to name it), but that's an addressing detail, not part of what
    // EMBARGO's effect acts on.
    const proposal = await galaxySenateStore.createProposal({
      type,
      proposerAuthUid,
      targetAuthUid,
      ...(type === "CONTEST" ? { targetSeasonId } : {}),
      createdAt: nowMs,
      createdAtCycleIndex: currentCycleIndex
    });
    await galaxyEconomyStore.upsertBalance({
      authUid: proposerAuthUid,
      influence: balance!.influence - cost,
      production: balance!.production,
      lastCycleAt: balance!.lastCycleAt
    });
    return { ok: true, proposal };
  });

  app.post("/hq/galaxy/senate/vote", async (request, reply) => {
    if (unavailable()) {
      reply.code(503);
      return { ok: false, error: "galaxy senate is unavailable" };
    }
    const authBindingStore = deps.authBindingStore!;
    const galaxyEconomyStore = deps.galaxyEconomyStore!;
    const galaxySenateStore = deps.galaxySenateStore!;

    const identity = await deps.authenticateBearer!(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const voterAuthUid = identity.authUid;

    const body = request.body && typeof request.body === "object" ? (request.body as VoteBody) : {};
    const proposalId = typeof body.proposalId === "string" ? body.proposalId : undefined;
    if (!proposalId) {
      reply.code(400);
      return { ok: false, error: "proposalId is required" };
    }

    const proposal = await galaxySenateStore.getProposal(proposalId);
    if (!proposal) {
      reply.code(404);
      return { ok: false, error: "proposal not found" };
    }
    if (proposal.status !== "PENDING") {
      reply.code(409);
      return { ok: false, error: "proposal has already resolved" };
    }
    if (await galaxySenateStore.hasVoted(proposalId, voterAuthUid)) {
      reply.code(409);
      return { ok: false, error: "already voted on this proposal" };
    }

    const weights = await resolveGalaxyDominionWeights({
      listSeasonArchives: deps.listSeasonArchives,
      ...(deps.getCurrentSeasonSummary ? { getCurrentSeasonSummary: deps.getCurrentSeasonSummary } : {}),
      authBindingStore,
      galaxyEconomyStore
    });
    const weight = weights.get(voterAuthUid) ?? 0;
    if (weight <= 0) {
      reply.code(403);
      return { ok: false, error: "only a territory-holding empire may vote" };
    }

    await galaxySenateStore.addVote({ proposalId, voterAuthUid, weight, castAt: Date.now() });
    return { ok: true, weight };
  });

  // §4/§13's "carries votes from at least a quorum % of total galaxy
  // weight, from at least 3 distinct voters" is otherwise invisible until a
  // proposal resolves -- this decorates each proposal with the live tally
  // (castWeight/totalWeight/distinctVoters) and the quorum/voter floor it
  // needs to clear, so a client can render real progress toward passing
  // instead of a bare PENDING/PASSED/FAILED label. Read-only and cheap
  // enough to compute on every listing: the same weights the resolution
  // scheduler already recomputes every poll.
  app.get("/hq/galaxy/senate", async (_request, reply) => {
    if (!deps.galaxySenateStore) {
      reply.code(503);
      return { ok: false, error: "galaxy senate is unavailable" };
    }
    const proposals = await deps.galaxySenateStore.listRecentProposals(50);
    const weightByAuthUid =
      deps.authBindingStore && deps.galaxyEconomyStore
        ? await resolveGalaxyDominionWeights({
            listSeasonArchives: deps.listSeasonArchives,
            ...(deps.getCurrentSeasonSummary ? { getCurrentSeasonSummary: deps.getCurrentSeasonSummary } : {}),
            authBindingStore: deps.authBindingStore,
            galaxyEconomyStore: deps.galaxyEconomyStore
          })
        : undefined;
    const totalWeight = weightByAuthUid ? [...weightByAuthUid.values()].reduce((sum, w) => sum + w, 0) : 0;
    const decorated = await Promise.all(
      proposals.map(async (proposal) => {
        const votes = await deps.galaxySenateStore!.getVotesForProposal(proposal.id);
        const castWeight = votes.reduce((sum, v) => sum + v.weight, 0);
        const config = GALAXY_SENATE_ACTIONS[proposal.type];
        return {
          ...proposal,
          castWeight,
          totalWeight,
          quorumPct: config.quorumPct,
          distinctVoters: new Set(votes.map((v) => v.voterAuthUid)).size,
          minDistinctVoters: MIN_DISTINCT_VOTERS,
          resolvesAt: (proposal.createdAtCycleIndex + 1) * GALAXY_CYCLE_LENGTH_MS
        };
      })
    );
    return { ok: true, proposals: decorated };
  });
};
