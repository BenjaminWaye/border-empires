import type { FastifyInstance } from "fastify";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GalaxyFleetStore } from "../galaxy-fleet-store/galaxy-fleet-store.js";
import { bearerHeader } from "../bearer-header/bearer-header.js";
import { resolveGalaxyHoldingsByOwner } from "../galaxy-holdings/galaxy-holdings.js";
import {
  FLEET_HULL_CLASS_IDS,
  computeFleetProductionCost,
  computeFleetTravelTimeMs,
  isValidFleetComposition,
  type FleetComposition,
  type FleetWeaponEmphasis
} from "../galaxy-fleet-config/galaxy-fleet-config.js";

const WEAPON_EMPHASES: readonly FleetWeaponEmphasis[] = ["KINETIC", "ENERGY", "MISSILE"];

export type RegisterGalaxyFleetRoutesDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authenticateBearer?: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  authBindingStore?: GatewayAuthBindingStore;
  galaxyEconomyStore?: GalaxyEconomyStore;
  galaxyFleetStore?: GalaxyFleetStore;
  galaxyBattleLogStore?: GalaxyBattleLogStore;
  now?: () => number;
};

type SaveBlueprintBody = { name?: unknown; composition?: unknown; weaponEmphasis?: unknown };
type SendFleetBody = { targetSeasonId?: unknown; composition?: unknown; weaponEmphasis?: unknown };
type GarrisonInvestBody = { seasonId?: unknown; amount?: unknown };

const parseComposition = (value: unknown): FleetComposition | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const composition: FleetComposition = {};
  for (const [hullId, count] of Object.entries(value as Record<string, unknown>)) {
    if (!FLEET_HULL_CLASS_IDS.includes(hullId as (typeof FLEET_HULL_CLASS_IDS)[number])) return undefined;
    if (typeof count !== "number") return undefined;
    composition[hullId as keyof FleetComposition] = count;
  }
  return composition;
};

const parseWeaponEmphasis = (value: unknown): FleetWeaponEmphasis | undefined =>
  typeof value === "string" && WEAPON_EMPHASES.includes(value as FleetWeaponEmphasis) ? (value as FleetWeaponEmphasis) : undefined;

// §6/§12 v2a: Fleets. New route module rather than growing galaxy-routes.ts,
// same reasoning galaxy-senate-routes.ts gives -- new gameplay surface, not
// a variant of the existing /hq/galaxy* territory endpoints.
export const registerGalaxyFleetRoutes = (app: FastifyInstance, deps: RegisterGalaxyFleetRoutesDeps): void => {
  const now = deps.now ?? (() => Date.now());
  const unavailable = (): boolean => !deps.authenticateBearer || !deps.authBindingStore || !deps.galaxyEconomyStore || !deps.galaxyFleetStore;

  app.post("/hq/galaxy/fleets/blueprints", async (request, reply) => {
    if (unavailable()) {
      reply.code(503);
      return { ok: false, error: "fleets are unavailable" };
    }
    const identity = await deps.authenticateBearer!(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const body = request.body && typeof request.body === "object" ? (request.body as SaveBlueprintBody) : {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const composition = parseComposition(body.composition);
    const weaponEmphasis = parseWeaponEmphasis(body.weaponEmphasis);
    if (!name || !composition || !isValidFleetComposition(composition) || !weaponEmphasis) {
      reply.code(400);
      return { ok: false, error: "name, a valid composition, and weaponEmphasis are required" };
    }
    const blueprint = await deps.galaxyFleetStore!.saveBlueprint({ ownerAuthUid: identity.authUid, name, composition, weaponEmphasis, createdAt: now() });
    return { ok: true, blueprint };
  });

  app.get("/hq/galaxy/fleets/blueprints", async (request, reply) => {
    if (unavailable()) {
      reply.code(503);
      return { ok: false, error: "fleets are unavailable" };
    }
    const identity = await deps.authenticateBearer!(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const blueprints = await deps.galaxyFleetStore!.listBlueprints(identity.authUid);
    return { ok: true, blueprints };
  });

  app.delete("/hq/galaxy/fleets/blueprints/:id", async (request, reply) => {
    if (unavailable()) {
      reply.code(503);
      return { ok: false, error: "fleets are unavailable" };
    }
    const identity = await deps.authenticateBearer!(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const id = (request.params as { id?: string }).id;
    if (!id) {
      reply.code(400);
      return { ok: false, error: "id is required" };
    }
    await deps.galaxyFleetStore!.deleteBlueprint(id, identity.authUid);
    return { ok: true };
  });

  app.post("/hq/galaxy/fleets/send", async (request, reply) => {
    if (unavailable()) {
      reply.code(503);
      return { ok: false, error: "fleets are unavailable" };
    }
    const authBindingStore = deps.authBindingStore!;
    const galaxyEconomyStore = deps.galaxyEconomyStore!;
    const galaxyFleetStore = deps.galaxyFleetStore!;

    const identity = await deps.authenticateBearer!(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const ownerAuthUid = identity.authUid;

    const body = request.body && typeof request.body === "object" ? (request.body as SendFleetBody) : {};
    const targetSeasonId = typeof body.targetSeasonId === "string" ? body.targetSeasonId : undefined;
    const composition = parseComposition(body.composition);
    const weaponEmphasis = parseWeaponEmphasis(body.weaponEmphasis);
    if (!targetSeasonId || !composition || !isValidFleetComposition(composition) || !weaponEmphasis) {
      reply.code(400);
      return { ok: false, error: "targetSeasonId, a valid composition, and weaponEmphasis are required" };
    }

    const holdingsByOwner = await resolveGalaxyHoldingsByOwner({
      listSeasonArchives: deps.listSeasonArchives,
      ...(deps.getCurrentSeasonSummary ? { getCurrentSeasonSummary: deps.getCurrentSeasonSummary } : {}),
      authBindingStore
    });
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

    const cost = computeFleetProductionCost(composition);
    const balance = await galaxyEconomyStore.getBalance(ownerAuthUid);
    if ((balance?.production ?? 0) < cost) {
      reply.code(402);
      return { ok: false, error: `sending this fleet costs ${cost} Production` };
    }

    // Create the order before deducting cost, same ordering fix as Senate's
    // propose route: if the store write fails, the sender is out nothing
    // rather than having paid for a fleet that never launched.
    const sentAt = now();
    const order = await galaxyFleetStore.createOrder({
      ownerAuthUid,
      targetAuthUid,
      targetSeasonId,
      composition,
      weaponEmphasis,
      sentAt,
      arrivesAt: sentAt + computeFleetTravelTimeMs(composition)
    });
    await galaxyEconomyStore.upsertBalance({
      authUid: ownerAuthUid,
      influence: balance!.influence,
      production: balance!.production - cost,
      lastCycleAt: balance!.lastCycleAt
    });
    return { ok: true, order };
  });

  app.get("/hq/galaxy/fleets", async (request, reply) => {
    if (unavailable()) {
      reply.code(503);
      return { ok: false, error: "fleets are unavailable" };
    }
    const identity = await deps.authenticateBearer!(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const orders = await deps.galaxyFleetStore!.listOrdersForOwner(identity.authUid);
    return { ok: true, orders };
  });

  app.get("/hq/galaxy/fleets/log", async (_request, reply) => {
    if (!deps.galaxyBattleLogStore) {
      reply.code(503);
      return { ok: false, error: "fleets are unavailable" };
    }
    const entries = await deps.galaxyBattleLogStore.listRecent(50);
    return { ok: true, entries };
  });

  app.post("/hq/galaxy/garrison/invest", async (request, reply) => {
    if (unavailable()) {
      reply.code(503);
      return { ok: false, error: "fleets are unavailable" };
    }
    const authBindingStore = deps.authBindingStore!;
    const galaxyEconomyStore = deps.galaxyEconomyStore!;

    const identity = await deps.authenticateBearer!(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const authUid = identity.authUid;

    const body = request.body && typeof request.body === "object" ? (request.body as GarrisonInvestBody) : {};
    const seasonId = typeof body.seasonId === "string" ? body.seasonId : undefined;
    const amount = typeof body.amount === "number" ? body.amount : undefined;
    if (!seasonId || !amount || amount <= 0 || !Number.isInteger(amount)) {
      reply.code(400);
      return { ok: false, error: "seasonId and a positive integer amount are required" };
    }

    const holdingsByOwner = await resolveGalaxyHoldingsByOwner({
      listSeasonArchives: deps.listSeasonArchives,
      ...(deps.getCurrentSeasonSummary ? { getCurrentSeasonSummary: deps.getCurrentSeasonSummary } : {}),
      authBindingStore
    });
    const holdsTerritory = (holdingsByOwner.get(authUid) ?? []).some((t) => t.seasonId === seasonId);
    if (!holdsTerritory) {
      reply.code(404);
      return { ok: false, error: "seasonId is not a territory you currently hold" };
    }

    const balance = await galaxyEconomyStore.getBalance(authUid);
    if ((balance?.production ?? 0) < amount) {
      reply.code(402);
      return { ok: false, error: `investing this much Garrison costs ${amount} Production` };
    }

    // Ensures the territory has a Stability row before investing -- an
    // Outpost/Planet resolved via holdings always should, but this keeps
    // the invariant explicit rather than assumed.
    const tier = (holdingsByOwner.get(authUid) ?? []).find((t) => t.seasonId === seasonId)!.tier;
    await galaxyEconomyStore.ensureStability({ authUid, seasonId, tier });
    await galaxyEconomyStore.addGarrison(authUid, seasonId, amount);
    await galaxyEconomyStore.upsertBalance({
      authUid,
      influence: balance!.influence,
      production: balance!.production - amount,
      lastCycleAt: balance!.lastCycleAt
    });
    const territory = await galaxyEconomyStore.getStability(authUid, seasonId);
    return { ok: true, territory };
  });
};
