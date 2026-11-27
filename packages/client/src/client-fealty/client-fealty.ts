// Fealty wording for unequal alliances (owner decision 2026-11-27). Playtesters
// read alliances with the biggest empires as cheap and generic, but an alliance
// bloc's land wins Diplomatic Dominance for its largest member only
// (season-victory-objectives.ts). So when one side is clearly the bigger
// empire, the alliance reads as fealty: the smaller House swears it, the
// larger demands it. Near-equals keep "Alliance". Wording only: the treaty,
// its rules and AI pricing are the same alliance as before.
//
// "Clearly" is FEALTY_SIZE_RATIO on the leaderboard's garrisoned (settled)
// tile count: the size the Diplomacy list shows each empire with, and the
// count AI Houses compare when deciding who leads a bloc. Sizes are read now,
// not when the alliance was made, because the victory check also reads them now.

/** One side has at least this many times the other's garrisoned tiles. */
export const FEALTY_SIZE_RATIO = 2;

/**
 * Your side of an alliance with another empire. SWEAR: you are clearly the
 * smaller and would swear fealty. DEMAND: you are clearly the larger and
 * would demand it. ALLIANCE: near-equals, or a size is unknown.
 */
export type FealtyStanding = "SWEAR" | "DEMAND" | "ALLIANCE";

export type FealtyLookup = (otherPlayerId: string | undefined) => FealtyStanding;

export const fealtyStanding = (mine: number | undefined, theirs: number | undefined): FealtyStanding => {
  if (mine === undefined || theirs === undefined) return "ALLIANCE";
  if (theirs > 0 && theirs >= mine * FEALTY_SIZE_RATIO) return "SWEAR";
  if (mine > 0 && mine >= theirs * FEALTY_SIZE_RATIO) return "DEMAND";
  return "ALLIANCE";
};

type SizedEntry = { id: string; tiles: number };
export type FealtyState = {
  me: string;
  leaderboard?: { overall: readonly SizedEntry[]; selfOverall?: SizedEntry | undefined } | undefined;
};

const tilesOf = (state: FealtyState, playerId: string): number | undefined => {
  const board = state.leaderboard;
  if (!board) return undefined;
  const entry = board.overall.find((e) => e.id === playerId) ?? (board.selfOverall?.id === playerId ? board.selfOverall : undefined);
  return entry?.tiles;
};

/** Your standing with each empire, from the client's live leaderboard. */
export const fealtyLookupFor = (state: FealtyState): FealtyLookup => (otherPlayerId) =>
  !otherPlayerId || !state.me || otherPlayerId === state.me ? "ALLIANCE" : fealtyStanding(tilesOf(state, state.me), tilesOf(state, otherPlayerId));

/** The send button for an alliance offer. */
export const allianceActionLabel = (standing: FealtyStanding): string =>
  standing === "SWEAR" ? "Swear fealty" : standing === "DEMAND" ? "Demand fealty" : "Propose alliance";

/** The treaty's short name: the deal screen's button and deal line, and the Diplomacy list's offer rows. */
export const allianceTreatyLabel = (standing: FealtyStanding): string =>
  standing === "SWEAR" ? "Swear fealty" : standing === "DEMAND" ? "Demand fealty" : "Alliance";

/** "would accept ___ on these terms": the offer you are making. */
export const allianceOfferPhrase = (standing: FealtyStanding): string =>
  standing === "SWEAR" ? "your fealty" : standing === "DEMAND" ? "your demand for fealty" : "an alliance";

/** What a sender's alliance offer says to you, after their name. `standing` is yours with the sender. */
export const incomingAllianceHeadline = (standing: FealtyStanding): string =>
  standing === "SWEAR" ? "demands your fealty" : standing === "DEMAND" ? "swears fealty" : "proposes an alliance";

/** An incoming offer's short label in the Diplomacy list. */
export const incomingAllianceLabel = (standing: FealtyStanding): string =>
  standing === "SWEAR" ? "Demands fealty" : standing === "DEMAND" ? "Swears fealty" : "Alliance";

/** Your own pending offer's short label in the Diplomacy list. */
export const sentAllianceLabel = (standing: FealtyStanding): string =>
  standing === "SWEAR" ? "Fealty offered" : standing === "DEMAND" ? "Fealty demanded" : "Alliance";

/** Alert title once your offer has gone out. */
export const allianceOfferedTitle = (standing: FealtyStanding): string =>
  standing === "SWEAR" ? "Fealty offered" : standing === "DEMAND" ? "Fealty demanded" : "Alliance offered";

/** Feed line once your offer has gone out. */
export const allianceOfferedLine = (standing: FealtyStanding, targetName: string | undefined): string => {
  const to = targetName ? (standing === "DEMAND" ? ` of ${targetName}` : ` to ${targetName}`) : "";
  return `${allianceOfferedTitle(standing)}${to}.`;
};

/** An ally's status: the Diplomacy list, the deal's pact line, the tile menu and the profile. */
export const allyStatusLabel = (standing: FealtyStanding): string =>
  standing === "SWEAR" ? "Your liege" : standing === "DEMAND" ? "Sworn to you" : "Ally";
