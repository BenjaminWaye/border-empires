import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { SeasonArchiveRow, SeasonParticipationRow } from "@border-empires/sim-protocol";

import { publicProfileAccountState, registerPublicHouseProfileRoutes, type PublicHouseProfileRouteDeps } from "./public-house-profile-routes.js";
import { InMemoryPublicProfileLinkStore } from "./public-profile-link-store.js";

const UID = "firebaseUid0123456789abcdefgh";
const EMAIL = "owner@example.com";

const row = (overrides: Partial<SeasonParticipationRow> = {}): SeasonParticipationRow => ({
  seasonId: "s1", seasonSequence: 1, playerId: UID, playerName: "Old Name", rank: 4, score: 40, tiles: 20,
  incomePerMinute: 4, techs: 2, endedAt: 1_000, ratingBefore: 1200, ratingAfter: 1210, ...overrides
});

const archive = (overrides: Partial<SeasonArchiveRow> = {}): SeasonArchiveRow => ({
  seasonId: "s1", seasonSequence: 1, endedAt: 1_000, updatedAt: 1_000, mostTerritory: [], mostPoints: [], longestSurvivalMs: [], replayEvents: [], ...overrides
});

const charge = (title: string, held: boolean) => ({ id: `c-${title}`, kind: "SURVEY" as const, title, rarity: "RARE" as const, renown: 3, held, hoursHeld: held ? 30 : 0, size: 40 });

const build = (overrides: Partial<PublicHouseProfileRouteDeps> = {}) => {
  const store = new InMemoryPublicProfileLinkStore();
  const app = Fastify();
  registerPublicHouseProfileRoutes(app, {
    store,
    authenticateBearer: async (header) =>
      header === "Bearer owner" ? { playerId: UID, playerName: "Varn", authUid: UID, authEmail: EMAIL }
        : header === "Bearer guest" ? { playerId: "guest-1", playerName: "Guest", isGuest: true }
          : undefined,
    accountState: async () => "active",
    getDisplayName: async () => "Varn",
    getSeasonParticipationForPlayer: async (playerId) => (playerId === UID ? [
      row(),
      row({ seasonId: "s2", seasonSequence: 2, rank: 1, score: 90, endedAt: 2_000, ratingBefore: 1210, ratingAfter: 1240 })
    ] : []),
    listSeasonArchives: async () => [
      archive({
        seasonId: "s2", seasonSequence: 2, endedAt: 2_000,
        winner: { playerId: UID, playerName: "Varn", crownedAt: 2_000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" } as SeasonArchiveRow["winner"] & object,
        finalStandings: [1, 2, 3].map((rank) => ({ id: `x${rank}`, name: "n", rank, score: 1, tiles: 1, incomePerMinute: 1, techs: 1 })),
        houseCharges: [
          { playerId: UID, playerName: "Varn", charges: [charge("Survey Claim", true), charge("Lost Charge", false)] },
          { playerId: "rival", playerName: "Rival", charges: [charge("Rival Charge", true)] }
        ],
        awards: [
          { kind: "NEVER_GAVE_UP", playerId: "rival", playerName: "Rival", redeploys: 6 },
          { kind: "COMEBACK_KID", playerId: UID, playerName: "Varn", redeploys: 2, rank: 1 }
        ],
        seasonStats: {
          longestRoad: { tileCount: 31, playerId: UID, playerName: "Varn", fromCity: { x: 1, y: 1, name: "Aln" }, toCity: { x: 9, y: 9, name: "Bel" } },
          mostDeadlyTile: { x: 5, y: 6, manpowerLost: 900, mostLossesPlayer: { playerId: "rival", playerName: "Rival", manpowerLost: 500 } }
        }
      }),
      archive()
    ],
    now: () => 5,
    ...overrides
  });
  return { app, store };
};

const mint = async (app: ReturnType<typeof build>["app"]): Promise<string> => {
  const response = await app.inject({ method: "POST", url: "/hq/public-profile/link", headers: { authorization: "Bearer owner" } });
  return (response.json() as { publicId: string }).publicId;
};

describe("public House profile routes", () => {
  it("serves contests, rating, held charges, records and wins to anyone with the link", async () => {
    const { app } = build();
    const publicId = await mint(app);
    const response = await app.inject({ method: "GET", url: `/public/house/${publicId}` });
    expect(response.statusCode).toBe(200);
    const view = response.json();
    expect(view).toMatchObject({ ok: true, name: "Varn", rating: 1240, lastRatingDelta: 30, peakRating: 1240, contestsPlayed: 2, bestRank: 1, wins: 1 });
    expect(view.contests).toEqual([
      { seasonSequence: 2, endedAt: 2_000, rank: 1, houses: 3, score: 90, tiles: 20, ratingAfter: 1240, ratingDelta: 30, won: true, victoryPath: "Town Control" },
      { seasonSequence: 1, endedAt: 1_000, rank: 4, houses: null, score: 40, tiles: 20, ratingAfter: 1210, ratingDelta: 10, won: false }
    ]);
    expect(view.charges).toEqual([{ title: "Survey Claim", kind: "SURVEY", rarity: "RARE", renown: 3, hoursHeld: 30, seasonSequence: 2, foil: true }]);
    expect(view.records).toEqual([{ kind: "LONGEST_ROAD", seasonSequence: 2, tiles: 31, from: "Aln", to: "Bel" }]);
    // Only this House's awards, without the id the archive stores them under.
    expect(view.awards).toEqual([{ kind: "COMEBACK_KID", seasonSequence: 2, redeploys: 2, rank: 1 }]);
  });

  it("never puts the player id, auth id or email in the public response", async () => {
    const { app } = build();
    const publicId = await mint(app);
    const body = (await app.inject({ method: "GET", url: `/public/house/${publicId}` })).body;
    expect(body).not.toContain(UID);
    expect(body).not.toContain(EMAIL);
    expect(body).not.toMatch(/playerId|authUid|email/i);
    expect(publicId).not.toContain(UID);
  });

  it.each(["deleting", "missing"] as const)("answers 404 once the account is %s", async (state) => {
    const { app } = build({ accountState: async () => state });
    const publicId = await mint(app);
    const response = await app.inject({ method: "GET", url: `/public/house/${publicId}` });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false, error: "not_found" });
  });

  it("answers 404 for unknown and malformed ids, including a raw player id", async () => {
    const { app } = build();
    await mint(app);
    for (const id of ["AAAAAAAAAAAAAAAA", UID, "x"]) {
      expect((await app.inject({ method: "GET", url: `/public/house/${id}` })).statusCode).toBe(404);
    }
  });

  it("lets only a signed-in, non-guest owner make a link, and stops sharing on delete", async () => {
    const { app } = build();
    expect((await app.inject({ method: "POST", url: "/hq/public-profile/link" })).statusCode).toBe(401);
    const guest = await app.inject({ method: "POST", url: "/hq/public-profile/link", headers: { authorization: "Bearer guest" } });
    expect(guest.statusCode).toBe(403);
    expect(guest.json()).toEqual({ ok: false, error: "account_required" });

    const own = { authorization: "Bearer owner" };
    expect((await app.inject({ method: "GET", url: "/hq/public-profile/link", headers: own })).json()).toEqual({ ok: true, publicId: null });
    const publicId = await mint(app);
    expect(await mint(app)).toBe(publicId);
    expect((await app.inject({ method: "GET", url: "/hq/public-profile/link", headers: own })).json()).toEqual({ ok: true, publicId });

    expect((await app.inject({ method: "DELETE", url: "/hq/public-profile/link", headers: own })).json()).toEqual({ ok: true, publicId: null });
    expect((await app.inject({ method: "GET", url: `/public/house/${publicId}` })).statusCode).toBe(404);
  });

  it("builds the view at most once a minute per House, but re-checks the link and deletion on every hit", async () => {
    let clock = 1_000;
    let archiveCalls = 0;
    let state: "active" | "deleting" = "active";
    const { app } = build({ now: () => clock, accountState: async () => state, listSeasonArchives: async () => { archiveCalls += 1; return []; } });
    const publicId = await mint(app);
    const get = () => app.inject({ method: "GET", url: `/public/house/${publicId}` });
    expect((await get()).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(200);
    expect(archiveCalls).toBe(1);
    clock += 60_001;
    expect((await get()).statusCode).toBe(200);
    expect(archiveCalls).toBe(2);
    state = "deleting";
    expect((await get()).statusCode).toBe(404);
    expect(archiveCalls).toBe(2);
  });

  it("answers 503 in the usual shape when the store or the simulation fails", async () => {
    const { app } = build({ getSeasonParticipationForPlayer: async () => { throw new Error("sim down"); } });
    const publicId = await mint(app);
    const response = await app.inject({ method: "GET", url: `/public/house/${publicId}` });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("publicProfileAccountState", () => {
  const bindings = (blocked: boolean | undefined, bound = true) => ({
    getByPlayerId: async () => (bound ? { uid: "uid-1" } : undefined),
    ...(blocked === undefined ? {} : { accountDeletion: { isBlocked: async (uid: string) => uid === "uid-1" && blocked } })
  });

  it("is active only for a bound account with no deletion request", async () => {
    expect(await publicProfileAccountState(bindings(false), "p")).toBe("active");
    expect(await publicProfileAccountState(bindings(undefined), "p")).toBe("active");
    expect(await publicProfileAccountState(bindings(true), "p")).toBe("deleting");
    expect(await publicProfileAccountState(bindings(false, false), "p")).toBe("missing");
  });

  it("shows the title the account holds, and no title field without one", async () => {
    const titled = build({ getTitle: async () => "Count" });
    const titledId = await mint(titled.app);
    expect((await titled.app.inject({ method: "GET", url: `/public/house/${titledId}` })).json()).toMatchObject({ name: "Varn", title: "Count" });

    const plain = build();
    const plainId = await mint(plain.app);
    expect((await plain.app.inject({ method: "GET", url: `/public/house/${plainId}` })).json()).not.toHaveProperty("title");
  });
});
