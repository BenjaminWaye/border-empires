// The action cards of Space View (design doc §30), built from the Duke status.
// Two hands, two places: decrees (one a day, for the whole empire) are played
// in the galaxy view; orders (one a day per system) in that system's view.
// Answering the Court's offer or a Writ is free and shows in both. Pure.
import { formatDuration } from "../client-duke-panel/client-duke-format.js";
import type { DukeBuildBody } from "../client-duke-panel/client-duke-api.js";
import type { DukeStatus, DukeSystemView } from "../client-duke-panel/client-duke-types.js";

export type CardIcon = "crown" | "court" | "scroll" | "flag" | "shield" | "probe" | "planet" | "wrench" | "wall" | "sword" | "eye" | "lend";

export type CardAction =
  | { kind: "HOLD_COURT" }
  | { kind: "WAGER"; influence: number }
  | { kind: "DECLARE"; targetSeasonId: string }
  | { kind: "LEND"; fromSeasonId: string }
  | { kind: "ANSWER_WRIT"; accept: boolean }
  | { kind: "ANSWER_OFFER"; accept: boolean }
  | { kind: "BUILD"; seasonId: string; body: DukeBuildBody }
  | { kind: "LAUNCH"; seasonId: string; order: "PROBE" | "RAID"; targetSeasonId: string };

export type SpaceCard = {
  id: string;
  icon: CardIcon;
  title: string;
  gain: string;
  cost: string;
  // A short badge: how soon a threat lands, or how long the build takes.
  badge: string | null;
  urgent: boolean;
  // Free cards (answering an offer) do not spend the day's order or decree.
  free: boolean;
  verb: string;
  action: CardAction;
  // A second, quieter choice on the same card (refusing an offer).
  alt: { verb: string; action: CardAction } | null;
  // Why the card cannot be played now, or null.
  disabledReason: string | null;
};

const MAX_HAND = 5;
const hours = (ms: number): string => `${Math.max(1, Math.round(ms / 3_600_000))}h`;

const card = (c: Partial<SpaceCard> & Pick<SpaceCard, "id" | "icon" | "title" | "gain" | "cost" | "verb" | "action">): SpaceCard => ({
  badge: null,
  urgent: false,
  free: false,
  alt: null,
  disabledReason: null,
  ...c
});

// Free reaction cards: the Court's one-time offer and a pending Writ.
export const reactionCards = (status: DukeStatus, now: number): SpaceCard[] => {
  const cards: SpaceCard[] = [];
  if (status.court.offer.status === "PENDING") {
    cards.push(card({ id: "offer", icon: "court", title: "Court protection", gain: "30 days safe", cost: "No wagers 90d", verb: "Accept", free: true, badge: "Free", action: { kind: "ANSWER_OFFER", accept: true }, alt: { verb: "Decline", action: { kind: "ANSWER_OFFER", accept: false } } }));
  }
  const writ = status.politics?.writ;
  if (writ) {
    const strike = writ.kind === "STRIKE";
    cards.push(card({ id: "writ", icon: "scroll", title: strike ? `Writ: raid ${writ.targetLabel ?? "a rival"}` : "Writ: a Fighter", gain: strike ? "Free raid" : "Free Fighter", cost: "Court +3", verb: "Take", free: true, badge: formatDuration(writ.expiresAt - now), action: { kind: "ANSWER_WRIT", accept: true }, alt: { verb: "Refuse", action: { kind: "ANSWER_WRIT", accept: false } } }));
  }
  return cards;
};

// The decree hand, played in the galaxy view.
export const decreeCards = (status: DukeStatus, now: number): SpaceCard[] => {
  const notReady = status.decree.ready ? null : `Next decree in ${formatDuration((status.decree.readyAt ?? now) - now)}`;
  const politics = status.politics;
  const cards: SpaceCard[] = [];
  if (politics?.favor.revoked) {
    const lender = status.systems.find((s) => s.fighters.some((h) => h > 0));
    cards.push(card({ id: "lend", icon: "lend", title: "Lend a Fighter", gain: "Court's Favor back", cost: "1 Fighter · 7d", verb: "Lend", urgent: true, action: { kind: "LEND", fromSeasonId: lender?.seasonId ?? "" }, disabledReason: notReady ?? (lender ? null : "No Fighter at home to lend") }));
  }
  const target = politics?.rivals.find((r) => r.revoked) ?? politics?.rivals[0];
  if (politics && target && !politics.grievance) {
    const cost = target.grievanceCost === 0 ? "Free" : `${target.grievanceCost} Influence`;
    cards.push(card({ id: `declare:${target.seasonId}`, icon: "flag", title: `Grievance: ${target.label}`, gain: `${target.revoked ? 6 : 3} Domain / hit`, cost, verb: "Declare", action: { kind: "DECLARE", targetSeasonId: target.seasonId }, disabledReason: notReady ?? (status.influence < target.grievanceCost ? "Not enough Influence" : null) }));
  }
  const wager = Math.min(10, Math.floor(status.influence / 5) * 5);
  cards.push(card({
    id: "wager",
    icon: "crown",
    title: "Weaken the Court",
    gain: `${Math.max(1, wager / 5)} Domain`,
    cost: `${Math.max(status.court.minWager, wager)} Influence`,
    verb: "Wager",
    action: { kind: "WAGER", influence: Math.max(status.court.minWager, wager) },
    disabledReason: notReady ?? (!status.court.canMoveAgainstCourt ? "Locked by the Court" : status.influence < status.court.minWager ? `Needs ${status.court.minWager} Influence` : null)
  }));
  cards.push(card({ id: "hold", icon: "court", title: "Hold Court", gain: "1 Influence", cost: "Nothing", verb: "Hold", action: { kind: "HOLD_COURT" }, disabledReason: notReady }));
  return withReactions(cards, reactionCards(status, now));
};

// Urgent cards come first so they are never pushed off a phone's screen, then
// the free answers, then the rest.
const withReactions = (cards: ReadonlyArray<SpaceCard>, reactions: ReadonlyArray<SpaceCard>): SpaceCard[] =>
  [...cards.filter((c) => c.urgent), ...reactions, ...cards.filter((c) => !c.urgent)].slice(0, MAX_HAND);

const developCards = (s: DukeSystemView, notReady: string | null): SpaceCard[] =>
  s.bodies
    .filter((b) => b.option)
    .map((b) =>
      card({
        id: `develop:${b.index}`,
        icon: "planet",
        title: b.option!.label,
        gain: (b.option!.summary.split(":")[0] ?? b.option!.summary).replace(/^\+/, ""),
        cost: s.freeDevelopmentUsed ? "1 Influence / Cycle" : "Free",
        badge: hours(b.option!.durationMs),
        verb: "Build",
        action: { kind: "BUILD", seasonId: s.seasonId, body: { kind: "DEVELOP", bodyIndex: b.index } },
        disabledReason: notReady ?? (b.option!.blockedBy ? blocked(b.option!.blockedBy) : null)
      })
    );

const blocked = (code: string): string =>
  ({ SLOT_BUSY: "Already building", FIGHTER_CAP: "3 Fighters is the most", PROBE_STOCK_CAP: "3 Probes is the most", NOTHING_TO_REPAIR: "Nothing to repair" })[code] ?? "Not available";

// The order hand for one system, played in that system's view.
export const orderCards = (status: DukeStatus, seasonId: string, now: number): SpaceCard[] => {
  const s = status.systems.find((x) => x.seasonId === seasonId);
  if (!s) return [];
  const notReady = s.order.ready ? null : `Next order in ${formatDuration((s.order.readyAt ?? now) - now)}`;
  const defended = s.fighters.some((h) => h > 0);
  const threat = s.incursionArrivesAt !== null && !defended ? formatDuration(s.incursionArrivesAt - now) : null;
  const fighter = s.options.find((o) => o.kind === "FIGHTER")!;
  const cards: SpaceCard[] = [
    card({ id: "fighter", icon: "shield", title: threat ? `Defend ${s.label}` : "Build Fighter", gain: "Blocks raids", cost: hours(fighter.durationMs), badge: threat, urgent: threat !== null, verb: "Build", action: { kind: "BUILD", seasonId, body: { kind: "FIGHTER" } }, disabledReason: notReady ?? (fighter.blockedBy ? blocked(fighter.blockedBy) : null) })
  ];
  if (s.stability < 100) {
    cards.push(card({ id: "fortify", icon: "wall", title: "Fortify", gain: `${s.fortify.stability} Stability`, cost: "Now", urgent: s.hitsRemaining <= 2, verb: "Fortify", action: { kind: "BUILD", seasonId, body: { kind: "FORTIFY" } }, disabledReason: notReady }));
  }
  const intel = new Map(status.intel.map((i) => [i.seasonId, i]));
  const rivals = status.politics?.rivals ?? [];
  if (s.fighters.some((h) => h > 0)) {
    for (const r of rivals.filter((x) => intel.has(x.seasonId)).slice(0, 2)) {
      const known = intel.get(r.seasonId)!;
      const onGrievance = status.politics?.grievance?.targetSeasonId === r.seasonId;
      cards.push(card({ id: `raid:${r.seasonId}`, icon: "sword", title: `Raid ${r.label}`, gain: onGrievance ? "3 Domain" : "Hit their Stability", cost: known.defenderHull === null ? "1 Fighter" : `Guarded ${known.defenderHull}%`, verb: "Launch", action: { kind: "LAUNCH", seasonId, order: "RAID", targetSeasonId: r.seasonId }, disabledReason: notReady }));
    }
  }
  if (s.probeStock > 0) {
    const unseen = rivals.find((r) => !intel.has(r.seasonId)) ?? rivals[0];
    if (unseen) cards.push(card({ id: `probe:${unseen.seasonId}`, icon: "eye", title: `Scout ${unseen.label}`, gain: "See their defence", cost: "1 Probe", verb: "Launch", action: { kind: "LAUNCH", seasonId, order: "PROBE", targetSeasonId: unseen.seasonId }, disabledReason: notReady }));
  }
  const refit = s.options.find((o) => o.kind === "REFIT")!;
  if (refit.blockedBy === null) cards.push(card({ id: "refit", icon: "wrench", title: "Refit", gain: "Fighters to 100%", cost: hours(refit.durationMs), verb: "Refit", action: { kind: "BUILD", seasonId, body: { kind: "REFIT" } }, disabledReason: notReady }));
  cards.push(...developCards(s, notReady));
  const probe = s.options.find((o) => o.kind === "PROBE")!;
  cards.push(card({ id: "probe-build", icon: "probe", title: "Build Probe", gain: "Scout a rival", cost: hours(probe.durationMs), verb: "Build", action: { kind: "BUILD", seasonId, body: { kind: "PROBE" } }, disabledReason: notReady ?? (probe.blockedBy ? blocked(probe.blockedBy) : null) }));
  const playable = [...cards].sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(a.disabledReason !== null) - Number(b.disabledReason !== null));
  return withReactions(playable, reactionCards(status, now));
};

export type SpaceStop = { mode: "galaxy" } | { mode: "system"; seasonId: string };

// Where the view goes after an action (§30): the next of your systems with an
// order ready, after the one just played; the galaxy once none is left.
export const nextStop = (status: DukeStatus, after: SpaceStop): SpaceStop => {
  const systems = status.systems;
  const start = after.mode === "system" ? systems.findIndex((s) => s.seasonId === after.seasonId) + 1 : 0;
  for (let i = 0; i < systems.length; i += 1) {
    const s = systems[(start + i) % systems.length]!;
    if (s.order.ready && !(after.mode === "system" && s.seasonId === after.seasonId)) return { mode: "system", seasonId: s.seasonId };
  }
  return { mode: "galaxy" };
};
