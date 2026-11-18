// House Charge cards (docs/house-charges-plan.md, "Card design"): every
// fulfilled charge becomes a collectible trading card. Data comes from the
// public GET /hq/house-charges/cards/by-player/:playerId route; the art is the
// real shape the House held (shared house-charge-art.ts), drawn as an SVG grid.
import { HOUSE_CHARGE_KINDS, RELIC_DEFINITIONS, decodeChargeArt, type HouseChargeKind, type HouseChargeRarity, type NaturalWonderType } from "@border-empires/shared";
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { HOUSE_CHARGE_KIND_LABEL } from "./client-house-charges-labels.js";

export type HouseChargeCardView = {
  id: string;
  kind: HouseChargeKind;
  title: string;
  rarity: HouseChargeRarity;
  renown: number;
  held: boolean;
  hoursHeld: number;
  size: number;
  places?: string[];
  art?: string;
  relicType?: string;
  seasonId: string;
  seasonSequence: number;
  endedAt: number | null;
  playerId: string;
  playerName: string;
  collectorNumber: number;
  collectorTotal: number;
  foil: boolean;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const hash = (text: string): number => {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
};

/** What the House achieved, in one line. */
export const houseChargeCardRule = (card: Pick<HouseChargeCardView, "kind" | "places" | "relicType">): string => {
  const [first = "the target", second = "the second town"] = card.places ?? [];
  switch (card.kind) {
    case "CHARTER":
      return `Connected ${first} and ${second} with an unbroken road and held it to the end of the contest.`;
    case "SEAT":
      return `Raised ${first} to a City and held it to the end of the contest.`;
    case "SURVEY":
      return `Kept the House's name in the Court's charts for ${first} to the end of the contest.`;
    case "DESERT":
    case "TUNDRA":
      return `Garrisoned ${first} and held it to the end of the contest.`;
    case "RELIC":
      return `Kept ${card.relicType && card.relicType in RELIC_DEFINITIONS ? `the ${RELIC_DEFINITIONS[card.relicType as NaturalWonderType].name}` : "a Concordance installation"} in service to the end of the contest.`;
  }
};

const FLAVOUR: Readonly<Record<HouseChargeKind, readonly string[]>> = {
  CHARTER: ["The merchant families paid for every milestone.", "A road is a promise kept one garrison at a time.", "Caravans came the day the last gap closed."],
  SEAT: ["The cadet line arrived to a city worthy of its name.", "The elders asked for a seat. The House built a throne room.", "Stone by stone, a town became a claim."],
  SURVEY: ["The cartographers allowed a day. The House needed less.", "A name in the charts outlasts the hand that wrote it.", "Every acre garrisoned, every coastline charted."],
  DESERT: ["Salvage crews said the sand ate their tracks by noon. The garrisons stayed anyway.", "Nothing grows here but resolve.", "The waste was named on the charts long before anyone held it."],
  TUNDRA: ["The frost took the banners. The garrisons kept the ground.", "A hardship posting, held to the last day.", "Ice remembers who stood on it."],
  RELIC: ["The machinery was ready long before anyone came to wake it.", "The Wardens noticed. The House held anyway.", "Old aether, new masters."]
};

const flavourFor = (card: Pick<HouseChargeCardView, "kind" | "id" | "seasonId">): string => {
  const lines = FLAVOUR[card.kind];
  return lines[hash(`${card.seasonId}:${card.id}`) % lines.length]!;
};

/** The card's art: the held shape as an SVG grid, or an emblem when there is no shape (Seat, relic). */
export const houseChargeCardArtSvg = (card: Pick<HouseChargeCardView, "kind" | "art">): string => {
  const bitmap = decodeChargeArt(card.art);
  if (bitmap) {
    const cells = bitmap.cells
      .map((on, index) => (on ? `<rect x="${index % bitmap.width}" y="${Math.floor(index / bitmap.width)}" width="1" height="1"/>` : ""))
      .join("");
    return `<svg class="hc-art-svg" viewBox="-1 -1 ${bitmap.width + 2} ${bitmap.height + 2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="hc-art-cells">${cells}</g></svg>`;
  }
  if (card.kind === "RELIC") {
    return `<svg class="hc-art-svg" viewBox="0 0 24 16" aria-hidden="true"><rect class="hc-art-beam" x="11.3" y="0" width="1.4" height="9"/><g class="hc-art-cells"><rect x="7" y="13" width="10" height="2"/><rect x="8.5" y="11" width="7" height="2"/><rect x="10" y="9" width="4" height="2"/></g></svg>`;
  }
  return `<svg class="hc-art-svg" viewBox="0 0 24 16" aria-hidden="true"><g class="hc-art-cells"><rect x="6" y="7" width="12" height="7"/><polygon points="5,7 12,2 19,7"/><rect class="hc-art-gate" x="10.5" y="10" width="3" height="4"/></g></svg>`;
};

/** One trading card. */
export const houseChargeCardHtml = (card: HouseChargeCardView): string => {
  const pips = "◆".repeat(Math.max(1, Math.min(4, card.renown)));
  const size = card.kind === "RELIC" ? "I" : String(card.size);
  return `<article class="hc-card kind-${card.kind.toLowerCase()} rarity-${card.rarity.toLowerCase()}${card.foil ? " is-foil" : ""}" aria-label="${esc(card.title)} card">
    ${card.foil ? '<span class="hc-foil-tag">Foil · season winner</span>' : ""}
    <div class="hc-frame">
      <div class="hc-bar"><span class="hc-name">${esc(card.title)}</span><span class="hc-pips" aria-label="Difficulty ${Math.max(1, Math.min(4, card.renown))} of 4">${pips}</span></div>
      <div class="hc-art">${houseChargeCardArtSvg(card)}</div>
      <div class="hc-bar hc-type"><span>${HOUSE_CHARGE_KIND_LABEL[card.kind]}</span><span class="hc-set" title="Contest ${card.seasonSequence} · ${card.rarity.toLowerCase()}">✦ ${card.seasonSequence}</span></div>
      <div class="hc-text"><p>${esc(houseChargeCardRule(card))}</p><p class="hc-flavour">"${esc(flavourFor(card))}"</p></div>
      <div class="hc-footer">${card.collectorNumber}/${card.collectorTotal} · ${esc(card.playerName)}</div>
    </div>
    <div class="hc-stats" title="Size / hours held">${esc(size)} / ${card.hoursHeld}</div>
  </article>`;
};

/** A player's card collection for their profile; `undefined`/"loading" while fetching. */
export const houseChargeCollectionHtml = (cards: HouseChargeCardView[] | "loading" | undefined, isSelf: boolean): string => {
  if (cards === "loading" || cards === undefined) return `<p class="v2p-none">Loading…</p>`;
  if (cards.length === 0) {
    return `<p class="v2p-none">${isSelf ? "No charge cards yet. Fulfil a House Charge and hold it until a Sector Contest is decided to earn one." : "No charge cards yet."}</p>`;
  }
  return `<div class="hc-collection">${cards.map(houseChargeCardHtml).join("")}</div>`;
};

const RARITIES: readonly HouseChargeRarity[] = ["COMMON", "RARE", "MYTHIC"];
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** A card from the server, or undefined when it is malformed or of a kind this client does not know (a newer server). */
export const parseHouseChargeCard = (value: unknown): HouseChargeCardView | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const kind = HOUSE_CHARGE_KINDS.find((entry) => entry === raw.kind);
  const rarity = RARITIES.find((entry) => entry === raw.rarity);
  if (!kind || !rarity || typeof raw.id !== "string" || typeof raw.title !== "string" || typeof raw.seasonId !== "string" || typeof raw.playerId !== "string") return undefined;
  const places = Array.isArray(raw.places) ? raw.places.filter((place): place is string => typeof place === "string") : undefined;
  return {
    id: raw.id,
    kind,
    title: raw.title,
    rarity,
    renown: finite(raw.renown, 1),
    held: raw.held === true,
    hoursHeld: finite(raw.hoursHeld),
    size: finite(raw.size),
    ...(places ? { places } : {}),
    ...(typeof raw.art === "string" ? { art: raw.art } : {}),
    ...(typeof raw.relicType === "string" ? { relicType: raw.relicType } : {}),
    seasonId: raw.seasonId,
    seasonSequence: finite(raw.seasonSequence),
    endedAt: typeof raw.endedAt === "number" ? raw.endedAt : null,
    playerId: raw.playerId,
    playerName: typeof raw.playerName === "string" ? raw.playerName : raw.playerId,
    collectorNumber: finite(raw.collectorNumber),
    collectorTotal: finite(raw.collectorTotal),
    foil: raw.foil === true
  };
};

export const fetchHouseChargeCards = async (playerId: string, wsUrl: string): Promise<HouseChargeCardView[] | undefined> => {
  try {
    const response = await fetch(`${rallyApiOrigin(wsUrl)}/hq/house-charges/cards/by-player/${encodeURIComponent(playerId)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return undefined;
    const body = (await response.json().catch(() => undefined)) as { cards?: unknown } | undefined;
    return Array.isArray(body?.cards) ? body.cards.slice(0, 500).map(parseHouseChargeCard).filter((card): card is HouseChargeCardView => Boolean(card)) : undefined;
  } catch {
    return undefined;
  }
};
