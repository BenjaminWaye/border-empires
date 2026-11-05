import type { PersonalActivitySiegeCard } from "@border-empires/game-domain";

import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import { NO_COMBAT_TILE_FEATURES, viewerFeatureCounts, type CombatTileFeatures } from "./personal-activity-features.js";

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
  // Tile-loss flips that closed a siege none of whose own assaults won, so
  // the caller drops their separate "−1 tile lost" row.
  consumedFlips: ReadonlySet<TerritoryFlip>;
};

const siegeCard = (assaults: readonly CombatManpowerLoss[], originSeized: ReadonlySet<CombatManpowerLoss>, tileFeatures: CombatTileFeatures, fall: TerritoryFlip | undefined): PersonalActivitySiegeCard => {
  const first = assaults[0]!;
  const last = assaults[assaults.length - 1]!;
  // Only the breaking assault captured anything: a siege closes on capture.
  // Sieges are only ever the defender's view: they lost the tile and took the
  // seized launch tiles. `fall` is a capture no logged winning assault
  // explains: a Breakthrough, a barbarian take, the seized launch tile of the
  // defender's own failed counter-attack, or a win whose flip landed too late
  // to match it. (A capture with no flip at all still can't close a siege.)
  const fell = last.attackerWon || fall !== undefined;
  const capturedBy = last.attackerWon ? last.attackerId : fall?.toOwner;
  const captured = last.attackerWon ? viewerFeatureCounts(tileFeatures.captured.get(last), false) : fall ? viewerFeatureCounts(fall.features, false) : undefined;
  const seized = viewerFeatureCounts(assaults.flatMap((assault) => tileFeatures.seizedOrigin.get(assault) ?? []), true);
  const attackerIds: string[] = [];
  for (const assault of assaults) if (!attackerIds.includes(assault.attackerId)) attackerIds.push(assault.attackerId);
  return {
    kind: "SIEGE",
    id: `siege:${first.x}:${first.y}:${first.at}`,
    occurredAt: fall && !last.attackerWon ? fall.at : last.at,
    startedAt: first.at,
    x: first.x,
    y: first.y,
    outcome: fell ? "FELL" : "HOLDING",
    assaultsRepelled: assaults.filter((assault) => !assault.attackerWon).length,
    originsSeized: assaults.filter((assault) => originSeized.has(assault)).length,
    attackerIds,
    manpowerSpentAgainst: assaults.reduce((sum, assault) => sum + assault.manpowerLoss, 0),
    ...(last.defenseVariant ? { defenseVariant: last.defenseVariant } : {}),
    ...(capturedBy ? { capturedBy } : {}),
    ...(captured ? { capturedFeatures: captured } : {}),
    ...(seized ? { seizedOriginFeatures: seized } : {})
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
  tileFeatures: CombatTileFeatures = NO_COMBAT_TILE_FEATURES,
  // The player's tile losses no winning assault explains (see the caller).
  lossFlips: readonly TerritoryFlip[] = []
): PersonalActivitySieges => {
  const byTile = new Map<string, CombatManpowerLoss[]>();
  for (const loss of combat) {
    if (loss.defenderId !== playerId) continue;
    const key = `${loss.x},${loss.y}`;
    const list = byTile.get(key);
    if (list) list.push(loss);
    else byTile.set(key, [loss]);
  }
  const lossFlipsByTile = new Map<string, TerritoryFlip[]>();
  for (const flip of lossFlips) {
    if (flip.fromOwner !== playerId || flip.toOwner === undefined) continue;
    const key = `${flip.x},${flip.y}`;
    const list = lossFlipsByTile.get(key);
    if (list) list.push(flip);
    else lossFlipsByTile.set(key, [flip]);
  }
  const cards: PersonalActivitySiegeCard[] = [];
  const consumed = new Set<CombatManpowerLoss>();
  const consumedFlips = new Set<TerritoryFlip>();
  // The tile changed hands after a repelled assault, before the next assault
  // on it and inside the siege gap: the siege fell to that capture. Checked
  // between every pair of assaults, so a loss retaken before the next attack
  // still ends the siege it belongs to.
  const fallAfter = (previous: CombatManpowerLoss, nextAt: number): TerritoryFlip | undefined => {
    if (previous.attackerWon) return undefined;
    return lossFlipsByTile.get(`${previous.x},${previous.y}`)?.find((flip) => !consumedFlips.has(flip) &&
      flip.at >= previous.at && flip.at < nextAt && flip.at - previous.at <= SIEGE_MAX_GAP_MS);
  };
  // A fall only leaves the tile-lost rows when a siege card tells it: after a
  // lone repelled attack it keeps its own row.
  const close = (segment: CombatManpowerLoss[], fall: TerritoryFlip | undefined): void => {
    if (segment.length < SIEGE_MIN_ASSAULTS) return;
    if (fall) consumedFlips.add(fall);
    cards.push(siegeCard(segment, originSeized, tileFeatures, fall));
    for (const assault of segment) consumed.add(assault);
  };
  for (const assaults of byTile.values()) {
    let segment: CombatManpowerLoss[] = [];
    for (const assault of [...assaults].sort((a, b) => a.at - b.at)) {
      const previous = segment[segment.length - 1];
      if (previous) {
        const fall = fallAfter(previous, assault.at);
        if (fall || assault.at - previous.at > SIEGE_MAX_GAP_MS) {
          close(segment, fall);
          segment = [];
        }
      }
      segment.push(assault);
      if (assault.attackerWon) {
        close(segment, undefined);
        segment = [];
      }
    }
    const last = segment[segment.length - 1];
    close(segment, last ? fallAfter(last, Number.POSITIVE_INFINITY) : undefined);
  }
  return { cards, consumed, consumedFlips };
};
