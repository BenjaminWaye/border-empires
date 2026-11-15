import type { PersonalActivityCard, PersonalActivityTimeline } from "@border-empires/game-domain";

// A truce or alliance offer from an empire that has just raided you must say
// so on the offer itself. Playtesters coming back to an overnight war were
// greeted by "Rowan offers a 12h truce" and accepted it blind, locking
// themselves out of retaking their own farms. Read from the 24h personal
// timeline the client already holds for the Chronicle; nothing new is fetched.

export type RecentAttackTally = {
  attacked: boolean;
  tilesLost: number;
  townsLost: string[];
  docksLost: number;
};

const emptyTally = (): RecentAttackTally => ({ attacked: false, tilesLost: 0, townsLost: [], docksLost: 0 });

/** Who attacked or took something from `me` in the timeline, and what they took. */
export const recentAttacksOnMe = (timeline: PersonalActivityTimeline | undefined, me: string): Map<string, RecentAttackTally> => {
  const byAttacker = new Map<string, RecentAttackTally>();
  if (!timeline || !me) return byAttacker;
  const tally = (id: string | undefined): RecentAttackTally | undefined => {
    if (!id || id === me) return undefined;
    let entry = byAttacker.get(id);
    if (!entry) byAttacker.set(id, (entry = emptyTally()));
    return entry;
  };
  const flipTiles = new Map<string, number>();
  const addFlip = (id: string, count: number): void => void flipTiles.set(id, (flipTiles.get(id) ?? 0) + count);
  for (const card of timeline.cards as readonly PersonalActivityCard[]) {
    switch (card.kind) {
      case "COMBAT":
        if (card.defenderId === me) {
          const entry = tally(card.attackerId);
          if (entry) entry.attacked = true;
          if (entry && card.attackerWon) addFlip(card.attackerId, 1);
        }
        break;
      case "COMBAT_GROUP":
        if (card.role === "DEFENDER") {
          const attackerId = card.counterpartyPlayerId;
          const entry = tally(attackerId);
          if (entry) entry.attacked = true;
          if (entry && attackerId && card.captures > 0) addFlip(attackerId, card.captures);
        }
        break;
      case "SIEGE":
        for (const id of card.attackerIds) {
          const entry = tally(id);
          if (entry) entry.attacked = true;
        }
        if (card.outcome === "FELL" && card.capturedBy && tally(card.capturedBy)) addFlip(card.capturedBy, 1);
        break;
      case "TERRITORY_FLIP_GROUP":
        if (card.direction === "LOST" && card.counterpartyPlayerId && tally(card.counterpartyPlayerId)) {
          addFlip(card.counterpartyPlayerId, card.tileCount);
        }
        break;
      case "TOWN_LOST": {
        const entry = tally(card.counterpartyPlayerId);
        if (entry) entry.townsLost.push(card.townName ?? "a town");
        break;
      }
      case "DOCK_LOST": {
        const entry = tally(card.counterpartyPlayerId);
        if (entry) entry.docksLost += 1;
        break;
      }
      default:
        break;
    }
  }
  // The rival tally counts distinct tiles; the cards are the fallback for an empire past the rival cap
  // (or an older simulation without rivals). Flip cards only carry flips no combat explains, so combat
  // and siege captures are added too, or a raid would read "you held your ground".
  const rivalTiles = new Map((timeline.rivals ?? []).map((rival) => [rival.playerId, rival.tilesLost]));
  for (const [id, entry] of byAttacker) entry.tilesLost = rivalTiles.get(id) ?? flipTiles.get(id) ?? 0;
  for (const [id, entry] of byAttacker) {
    if (!entry.attacked && entry.tilesLost === 0 && entry.townsLost.length === 0 && entry.docksLost === 0) byAttacker.delete(id);
  }
  return byAttacker;
};

const listAnd = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** "Attacked you in the last day · took 11 tiles and your Dock", or undefined for an empire that did not. */
export const attackerNoteText = (entry: RecentAttackTally | undefined): string | undefined => {
  if (!entry) return undefined;
  const taken: string[] = [];
  if (entry.tilesLost > 0) taken.push(`${entry.tilesLost} tile${entry.tilesLost === 1 ? "" : "s"}`);
  taken.push(...entry.townsLost);
  if (entry.docksLost > 0) taken.push(entry.docksLost === 1 ? "your Dock" : `${entry.docksLost} Docks`);
  return taken.length > 0
    ? `Attacked you in the last day · took ${listAnd(taken)}`
    : "Attacked you in the last day · you held your ground";
};
