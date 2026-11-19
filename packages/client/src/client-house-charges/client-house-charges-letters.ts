// The House's reason behind each charge (owner 2026-11-19: "the quotes on the
// cards should instead be your House's reason for entrusting you with this
// charge", with enough variance that each card feels unique). Who speaks
// follows the lore (docs/lore/galactic-lore.md, "House Charges"): trading
// families want roads, elders want seats, surveyors want charts, scholars want
// installations woken. Each kind has several letters, picked by the charge id,
// so a charge always reads the same and two charges of a kind rarely match.
import { HOUSE_CHARGE_METROPOLIS_COUNT, houseStyledName, type HouseChargeKind, type HouseChargeView } from "@border-empires/shared";

/** Why a rival House is named in a Writ of Correction: one offence per charge, fixed by its id. */
export const CORRECTION_OFFENCES: readonly string[] = [
  "sold our landing charts before the last Proclamation's feast was cleared",
  "turned our envoys away at the gate and named it caution",
  "struck our House's name from a chart we paid to survey",
  "took a convoy under our seal and called it salvage"
];

type Places = { a: string; b: string };
type Letter = (places: Places) => string;

const LETTERS: Readonly<Record<Exclude<HouseChargeKind, "CORRECTION" | "RELIC">, readonly Letter[]>> = {
  CHARTER: [
    ({ a, b }) => `Our trading families have goods waiting in ${a} and buyers in ${b}. They trust you to give them a road no one can cut.`,
    ({ a, b }) => `The merchant families will pay for every milestone between ${a} and ${b}, but only for a road the House still holds when the campaign is decided.`,
    ({ a, b }) => `Caravans from ${a} have been turned back twice on the way to ${b}. The trading families ask for a road garrisoned end to end.`,
    ({ a, b }) => `${a} sends grain and ${b} sends tools, and today both pay tolls to strangers. The trading families want that road under our banner.`,
    ({ a, b }) => `Our factors in ${b} write that the way to ${a} is no safer than it was. Make the road ours and they will trade again.`
  ],
  SEAT: [
    ({ a }) => `The elders want ${a} raised into a city fit to seat a cadet line. You are on the ground, so the House looks to you.`,
    ({ a }) => `A cadet line has waited three generations for a seat. The elders have chosen ${a}. Make it a city worthy of them.`,
    ({ a }) => `${a} appears in our oldest landing reports as a market worth watching. The elders want it walled, fed and grown into a city.`,
    ({ a }) => `The elders promised a younger branch of the House a city of its own. They have chosen ${a}: grow it for them.`,
    ({ a }) => `Our heralds already write ${a} in the House's rolls. The elders want the town to deserve it: raise it into a city and keep it.`
  ],
  SURVEY: [
    ({ a }) => `Our surveyors have staked their name on ${a}. Garrison every acre so the Court's charts carry the House's name.`,
    ({ a }) => `The Court's cartographers will chart ${a} under whoever holds all of it. The surveyors want that name to be ours.`,
    ({ a }) => `Our surveyors have pored over the Court's charts of ${a} for years. Garrison it whole, so the charts carry our name.`,
    ({ a }) => `Whoever holds all of ${a} will name it in the Court's charts. Our surveyors ask you to make sure that name is ours.`,
    ({ a }) => `The surveyors say ${a} is small enough to hold and large enough to matter. They want every tile of it garrisoned.`
  ],
  DESERT: [
    ({ a }) => `Our surveyors want ${a} entered in the charts under the House's name. No one else will hold that sand for us. You can.`,
    ({ a }) => `Salvage crews say ${a} eats their tracks by noon. The surveyors want garrisons there anyway, and the charts to say whose they are.`,
    ({ a }) => `Nothing grows in ${a}, but the Court's charts do not care. The surveyors want the waste held and named for the House.`,
    ({ a }) => `The elders laughed when the surveyors asked for ${a}. Hold it, and let the charts answer them.`,
    ({ a }) => `Every House that landed near ${a} has skirted it. The surveyors ask you to be the one that stays.`
  ],
  TUNDRA: [
    ({ a }) => `Our surveyors want ${a} entered in the charts under the House's name. It is a hard posting, and the elders chose you for it.`,
    ({ a }) => `The frost in ${a} takes banners and keeps the ground. The surveyors want our garrisons to keep it instead.`,
    ({ a }) => `Nobody fights over ${a} until somebody holds it. The surveyors want that somebody to be the House.`,
    ({ a }) => `The surveyors marked ${a} in the first landing reports and have asked after it ever since. Garrison the ice and they will stop asking.`,
    ({ a }) => `Ice remembers who stood on it. The surveyors want ${a} to remember us.`
  ],
  METROPOLIS: [
    ({ a }) => `The elders want three cadet lines seated on ${a}, each in a city great enough to carry the House's name. Take the towns early, feed them, and keep the fighting away from their walls.`,
    ({ a }) => `Three cadet lines are waiting for seats, and the elders want all three on ${a}. Grow ${HOUSE_CHARGE_METROPOLIS_COUNT} of its towns into Metropolises and hold them.`,
    ({ a }) => `The elders do not want a city on ${a}. They want a province: three Metropolises, held together, carrying the House's name.`
  ]
};

/** Reawakening letters, before and after the House has found the installation's beacon. */
const RELIC_UNFOUND: readonly string[] = [
  "Our scholars believe a Concordance installation sleeps near your landing. They ask you to find its beacon and keep it in House hands.",
  "The scholars caught a maintenance beacon in the landing reports, faint but steady. Find the installation it belongs to and garrison it.",
  "Our scholars have spent a fortune on Concordance machinery that never woke. They believe this one will. Find it and hold it.",
  "A Concordance installation lies somewhere near your landing. The scholars ask that our garrison be standing beside it when the Core comes to look."
];
const RELIC_FOUND: readonly string[] = [
  "Our scholars have heard of the beacon you found. They ask you to garrison the installation and keep it in House hands.",
  "The machinery was ready long before anyone came to wake it. The scholars want the House to be the one that does.",
  "Our scholars have spent a fortune on Concordance machinery that never woke. They believe this one will. Garrison it and hold it.",
  "The installation is found. The scholars ask that our garrison be standing beside it when the Core comes to look."
];

/** Correction letters take the rival House and its offence. */
const CORRECTION_LETTERS: readonly ((house: string, offence: string) => string)[] = [
  (house, offence) => `${house} ${offence}. The elders have lodged the grievance with the Court's heralds. It is yours to press: take an AFC they founded and hold it until the campaign is decided, so the Core sees the wrong answered.`,
  (house, offence) => `${house} ${offence}. The Court's heralds have the grievance on record. Take an AFC ${house} founded and hold it until the campaign is decided.`,
  (house, offence) => `The elders have not forgotten that ${house} ${offence}. Take an AFC they founded and keep it to the end, so the Core sees the wrong answered.`
];

const hash = (text: string): number => {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
};

const pick = <T>(list: readonly T[], seed: string): T => list[hash(seed) % list.length]!;

/** Why the House entrusted this charge to its campaign leader, in the House's voice; shown as the card's quote. */
export const houseChargeLetter = (charge: Pick<HouseChargeView, "id" | "kind" | "targets">): string => {
  const [first, second] = charge.targets;
  if (charge.kind === "CORRECTION") {
    const house = houseStyledName(first?.name ?? "the rival");
    // The offence keeps its original seed so existing Writs keep the offence they were first shown with.
    return pick(CORRECTION_LETTERS, `${charge.id}:letter`)(house, pick(CORRECTION_OFFENCES, charge.id));
  }
  // The relic's position is withheld until its beacon is found (docs/game-mechanics.md, progressive reveal).
  if (charge.kind === "RELIC") return pick(first ? RELIC_FOUND : RELIC_UNFOUND, `${charge.id}:letter`);
  const fallback: Record<Exclude<HouseChargeKind, "CORRECTION" | "RELIC">, string> = {
    CHARTER: "one market town",
    SEAT: "this town",
    SURVEY: "this landmass",
    DESERT: "this waste",
    TUNDRA: "this ice field",
    METROPOLIS: "the landmass"
  };
  return pick(LETTERS[charge.kind], `${charge.id}:letter`)({ a: first?.name ?? fallback[charge.kind], b: second?.name ?? "the other town" });
};
