import type { PersonalActivitySiegeCard, PersonalActivityTileFeature } from "@border-empires/game-domain";

import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import { nonEmptyFeatureCounts } from "./personal-activity-features.js";

type CapturedFeatures = ReadonlyMap<CombatManpowerLoss, readonly PersonalActivityTileFeature[]>;

// A lull this long between assaults on the same tile ends the siege: two raids
// half a day apart are separate stories, not one long siege.
export const SIEGE_MAX_GAP_MS = 3 * 60 * 60_000;
// One assault is just a combat card; a siege needs at least a second attempt.
const SIEGE_MIN_ASSAULTS = 2;

export type PersonalActivitySieges = {
  cards: PersonalActivitySiegeCard[];
  // The combat entries folded into a siege card, so the caller can drop their
  // per-attack COMBAT cards instead of showing the same fight twice.
  consumed: ReadonlySet<CombatManpowerLoss>;
};

const siegeCard = (assaults: readonly CombatManpowerLoss[], originSeized: ReadonlySet<CombatManpowerLoss>, capturedFeatures: CapturedFeatures): PersonalActivitySiegeCard => {
  const first = assaults[0]!;
  const last = assaults[assaults.length - 1]!;
  // Only the breaking assault captured anything: a siege closes on capture.
  const captured = last.attackerWon ? nonEmptyFeatureCounts(capturedFeatures.get(last) ?? []) : undefined;
  const attackerIds: string[] = [];
  for (const assault of assaults) if (!attackerIds.includes(assault.attackerId)) attackerIds.push(assault.attackerId);
  return {
    kind: "SIEGE",
    id: `siege:${first.x}:${first.y}:${first.at}`,
    occurredAt: last.at,
    startedAt: first.at,
    x: first.x,
    y: first.y,
    outcome: last.attackerWon ? "FELL" : "HOLDING",
    assaultsRepelled: assaults.filter((assault) => !assault.attackerWon).length,
    originsSeized: assaults.filter((assault) => originSeized.has(assault)).length,
    attackerIds,
    manpowerSpentAgainst: assaults.reduce((sum, assault) => sum + assault.manpowerLoss, 0),
    ...(last.defenseVariant ? { defenseVariant: last.defenseVariant } : {}),
    ...(last.attackerWon ? { capturedBy: last.attackerId } : {}),
    ...(captured ? { capturedFeatures: captured } : {})
  };
};

// Folds the assaults on each of the player's tiles into sieges: consecutive
// attacks on one tile (no lull longer than SIEGE_MAX_GAP_MS) up to and
// including the one that captured it. A capture always closes the siege, so
// a retaken-then-reattacked tile starts a fresh one.
export const siegeCardsForDefender = (
  playerId: string,
  combat: readonly CombatManpowerLoss[],
  originSeized: ReadonlySet<CombatManpowerLoss> = new Set(),
  capturedFeatures: CapturedFeatures = new Map()
): PersonalActivitySieges => {
  const byTile = new Map<string, CombatManpowerLoss[]>();
  for (const loss of combat) {
    if (loss.defenderId !== playerId) continue;
    const key = `${loss.x},${loss.y}`;
    const list = byTile.get(key);
    if (list) list.push(loss);
    else byTile.set(key, [loss]);
  }
  const cards: PersonalActivitySiegeCard[] = [];
  const consumed = new Set<CombatManpowerLoss>();
  const close = (segment: CombatManpowerLoss[]): void => {
    if (segment.length < SIEGE_MIN_ASSAULTS) return;
    cards.push(siegeCard(segment, originSeized, capturedFeatures));
    for (const assault of segment) consumed.add(assault);
  };
  for (const assaults of byTile.values()) {
    let segment: CombatManpowerLoss[] = [];
    for (const assault of [...assaults].sort((a, b) => a.at - b.at)) {
      const previous = segment[segment.length - 1];
      if (previous && assault.at - previous.at > SIEGE_MAX_GAP_MS) {
        close(segment);
        segment = [];
      }
      segment.push(assault);
      if (assault.attackerWon) {
        close(segment);
        segment = [];
      }
    }
    close(segment);
  }
  return { cards, consumed };
};
