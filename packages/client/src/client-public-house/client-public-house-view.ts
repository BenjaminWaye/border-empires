// The public House profile page (/house.html?h=<public id>, docs/gdd.md §7):
// read-only, no login, phone first. This module only parses the gateway's
// GET /public/house/:publicId reply and renders it to HTML, so it can be
// tested without a browser. Mirrors PublicHouseProfileView in
// apps/realtime-gateway/src/public-house-profile/public-house-profile-view.ts.
export type PublicHouseContest = {
  seasonSequence: number;
  endedAt: number;
  rank: number;
  houses: number | null;
  score: number;
  tiles: number;
  ratingAfter?: number;
  ratingDelta?: number;
  won: boolean;
  victoryPath?: string;
};

export type PublicHouseCharge = { title: string; rarity: string; renown: number; hoursHeld: number; places?: string[]; seasonSequence: number; foil: boolean };

export type PublicHouseRecord =
  | { kind: "LONGEST_ROAD"; seasonSequence: number; tiles: number; from?: string; to?: string }
  | { kind: "MOST_DEADLY_TILE"; seasonSequence: number; x: number; y: number; manpowerLost: number };

export type PublicHouseAward = { kind: "NEVER_GAVE_UP" | "COMEBACK_KID"; seasonSequence: number; redeploys: number; rank?: number };

export type PublicHouseProfile = {
  name: string;
  rating: number | null;
  lastRatingDelta: number | null;
  peakRating: number | null;
  contestsPlayed: number;
  bestRank: number | null;
  wins: number;
  contests: PublicHouseContest[];
  charges: PublicHouseCharge[];
  records: PublicHouseRecord[];
  awards: PublicHouseAward[];
};

const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const numOrNull = (value: unknown): number | null => (num(value) ? value : null);
const str = (value: unknown): value is string => typeof value === "string";
const list = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];

const parseRecord = (entry: Record<string, unknown>): PublicHouseRecord | undefined => {
  if (!num(entry.seasonSequence)) return undefined;
  if (entry.kind === "LONGEST_ROAD" && num(entry.tiles)) {
    return { kind: "LONGEST_ROAD", seasonSequence: entry.seasonSequence, tiles: entry.tiles, ...(str(entry.from) ? { from: entry.from } : {}), ...(str(entry.to) ? { to: entry.to } : {}) };
  }
  if (entry.kind === "MOST_DEADLY_TILE" && num(entry.x) && num(entry.y) && num(entry.manpowerLost)) {
    return { kind: "MOST_DEADLY_TILE", seasonSequence: entry.seasonSequence, x: entry.x, y: entry.y, manpowerLost: entry.manpowerLost };
  }
  return undefined;
};

export const parsePublicHouseProfile = (body: unknown): PublicHouseProfile | undefined => {
  if (!body || typeof body !== "object") return undefined;
  const raw = body as Record<string, unknown>;
  if (raw.ok !== true || !str(raw.name)) return undefined;
  return {
    name: raw.name,
    rating: numOrNull(raw.rating),
    lastRatingDelta: numOrNull(raw.lastRatingDelta),
    peakRating: numOrNull(raw.peakRating),
    contestsPlayed: num(raw.contestsPlayed) ? raw.contestsPlayed : 0,
    bestRank: numOrNull(raw.bestRank),
    wins: num(raw.wins) ? raw.wins : 0,
    contests: list(raw.contests).flatMap((entry): PublicHouseContest[] =>
      num(entry.seasonSequence) && num(entry.endedAt) && num(entry.rank)
        ? [{
            seasonSequence: entry.seasonSequence,
            endedAt: entry.endedAt,
            rank: entry.rank,
            houses: numOrNull(entry.houses),
            score: num(entry.score) ? entry.score : 0,
            tiles: num(entry.tiles) ? entry.tiles : 0,
            ...(num(entry.ratingAfter) ? { ratingAfter: entry.ratingAfter } : {}),
            ...(num(entry.ratingDelta) ? { ratingDelta: entry.ratingDelta } : {}),
            won: entry.won === true,
            ...(str(entry.victoryPath) ? { victoryPath: entry.victoryPath } : {})
          }]
        : []),
    charges: list(raw.charges).flatMap((entry): PublicHouseCharge[] =>
      str(entry.title) && num(entry.seasonSequence)
        ? [{
            title: entry.title,
            rarity: str(entry.rarity) ? entry.rarity : "COMMON",
            renown: num(entry.renown) ? entry.renown : 1,
            hoursHeld: num(entry.hoursHeld) ? entry.hoursHeld : 0,
            ...(Array.isArray(entry.places) ? { places: entry.places.filter(str) } : {}),
            seasonSequence: entry.seasonSequence,
            foil: entry.foil === true
          }]
        : []),
    records: list(raw.records).flatMap((entry) => parseRecord(entry) ?? []),
    awards: list(raw.awards).flatMap((entry): PublicHouseAward[] =>
      (entry.kind === "NEVER_GAVE_UP" || entry.kind === "COMEBACK_KID") && num(entry.seasonSequence) && num(entry.redeploys)
        ? [{ kind: entry.kind, seasonSequence: entry.seasonSequence, redeploys: entry.redeploys, ...(num(entry.rank) ? { rank: entry.rank } : {}) }]
        : [])
  };
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const int = (value: number): string => Math.round(value).toLocaleString("en-US");
const signed = (value: number): string => `${value >= 0 ? "+" : "−"}${int(Math.abs(value))}`;
const day = (ms: number): string => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const contestLabel = (sequence: number): string => `Sector Contest ${int(sequence)}`;
const rarityLabel = (rarity: string): string => (rarity === "MYTHIC" ? "Mythic" : rarity === "RARE" ? "Rare" : "Common");

const stat = (label: string, value: string, note = ""): string =>
  `<div class="ph-stat"><span>${label}</span><b>${value}</b>${note ? `<i>${note}</i>` : ""}</div>`;

const section = (title: string, body: string): string => `<section class="ph-section"><h2>${title}</h2>${body}</section>`;

const recordHtml = (record: PublicHouseRecord): string => {
  if (record.kind === "LONGEST_ROAD") {
    const ends = record.from && record.to ? ` from ${esc(record.from)} to ${esc(record.to)}` : "";
    return `<li><b>Longest Road</b><span>${int(record.tiles)} tiles${ends}</span><i>${contestLabel(record.seasonSequence)}</i></li>`;
  }
  return `<li><b>Most Deadly Tile</b><span>Lost ${int(record.manpowerLost)} manpower at (${int(record.x)}, ${int(record.y)}), more than any other House</span><i>${contestLabel(record.seasonSequence)}</i></li>`;
};

const times = (count: number): string => (count === 1 ? "once" : `${int(count)} times`);

const awardHtml = (award: PublicHouseAward): string =>
  award.kind === "NEVER_GAVE_UP"
    ? `<li><b>Never Gave Up</b><span>Knocked out and redeployed ${times(award.redeploys)}, more than any other House</span><i>${contestLabel(award.seasonSequence)}</i></li>`
    : `<li><b>Comeback Kid</b><span>Knocked out and redeployed ${times(award.redeploys)}, and still finished${award.rank !== undefined ? ` #${int(award.rank)}` : " in the top 5"}</span><i>${contestLabel(award.seasonSequence)}</i></li>`;

const contestHtml = (contest: PublicHouseContest): string => {
  const of = contest.houses ? ` of ${int(contest.houses)}` : "";
  const rating = contest.ratingAfter !== undefined
    ? `<span class="ph-rating">${int(contest.ratingAfter)}${contest.ratingDelta !== undefined ? ` <em class="${contest.ratingDelta >= 0 ? "ph-up" : "ph-down"}">${signed(contest.ratingDelta)}</em>` : ""}</span>`
    : "";
  return `<li class="ph-contest${contest.won ? " ph-won" : ""}">
    <div class="ph-place"><b>#${int(contest.rank)}</b><span>${of.trim()}</span></div>
    <div class="ph-contest-main"><b>${contestLabel(contest.seasonSequence)}${contest.won ? ` <span class="ph-tag">Won${contest.victoryPath ? ` · ${esc(contest.victoryPath)}` : ""}</span>` : ""}</b>
      <span>${day(contest.endedAt)} · score ${int(contest.score)} · ${int(contest.tiles)} tiles</span></div>
    ${rating}
  </li>`;
};

const chargeHtml = (charge: PublicHouseCharge): string =>
  `<li class="ph-charge${charge.foil ? " ph-foil" : ""}"><b>${esc(charge.title)}</b>
    <span>${"◆".repeat(Math.max(1, Math.min(4, Math.round(charge.renown))))} ${rarityLabel(charge.rarity)}${charge.places?.length ? ` · ${charge.places.map(esc).join(", ")}` : ""}</span>
    <i>${contestLabel(charge.seasonSequence)} · held ${int(charge.hoursHeld)}h${charge.foil ? " · won this contest" : ""}</i></li>`;

export const publicHouseHtml = (profile: PublicHouseProfile): string => {
  const initial = (profile.name.trim()[0] ?? "?").toUpperCase();
  const rating = profile.rating !== null
    ? stat("Rating", int(profile.rating), profile.lastRatingDelta !== null ? `${signed(profile.lastRatingDelta)} last contest` : "")
    : stat("Rating", "—", "after a first contest");
  return `<header class="ph-hero"><span class="ph-crest" aria-hidden="true">${esc(initial)}</span>
    <div><p class="ph-kicker">Border Empires · House profile</p><h1>${esc(profile.name)}</h1></div></header>
  <div class="ph-stats">
    ${rating}
    ${stat("Sector Contests", int(profile.contestsPlayed))}
    ${stat("Best finish", profile.bestRank !== null ? `#${int(profile.bestRank)}` : "—")}
    ${stat("Contests won", int(profile.wins))}
  </div>
  ${profile.rating !== null ? `<p class="ph-note">Rating moves with final placement in each Sector Contest. Every House starts at 1,200${profile.peakRating !== null ? `; this House peaked at ${int(profile.peakRating)}` : ""}.</p>` : ""}
  ${profile.awards.length ? section("Awards", `<ul class="ph-list">${profile.awards.map(awardHtml).join("")}</ul>`) : ""}
  ${profile.records.length ? section("Records held", `<ul class="ph-list">${profile.records.map(recordHtml).join("")}</ul>`) : ""}
  ${section("Contest history", profile.contests.length
    ? `<ul class="ph-contests">${profile.contests.map(contestHtml).join("")}</ul>`
    : `<p class="ph-empty">No finished Sector Contest yet.</p>`)}
  ${section("House Charges held", profile.charges.length
    ? `<ul class="ph-list">${profile.charges.map(chargeHtml).join("")}</ul>`
    : `<p class="ph-empty">No House Charge held at a crowning yet.</p>`)}`;
};

export const publicHouseMessageHtml = (title: string, body: string): string =>
  `<header class="ph-hero"><div><p class="ph-kicker">Border Empires · House profile</p><h1>${esc(title)}</h1></div></header><p class="ph-empty">${esc(body)}</p>`;

export const PUBLIC_HOUSE_NOT_FOUND_HTML = publicHouseMessageHtml("Profile not found", "This House profile link is no longer shared, or it never existed.");
