// Aether Tower shot charges: every ability cast from a tower (or a Watchtower
// Engine / Concordance Resonator acting as one) spends one of that tower's
// shots. Each shot comes back AETHER_TOWER_SHOT_REFILL_MS after it was fired,
// so a tower fires at most `maxShots` times in any rolling 24h window.
//
// Nothing ticks: the tower stores only the fire times still inside the
// window (`shotsUsedAt`, at most AETHER_TOWER_SHOT_HISTORY_CAP entries), and
// remaining shots / next refill are derived from them on read.
//
// `cooldownUntil` is kept on the tower as "the earliest time it can fire
// again" (absent while it has a shot left), written whenever a shot is
// spent, so the shield rule, the AI and the map badges keep reading a
// single field.

export const AETHER_TOWER_BASE_SHOTS = 3;
export const AETHER_TOWER_SHOT_REFILL_MS = 24 * 60 * 60_000;
/** Bound on the stored fire history; the largest shot capacity must fit under it. */
export const AETHER_TOWER_SHOT_HISTORY_CAP = 12;

export type AetherTowerShotView = { readonly shotsUsedAt?: readonly number[] | undefined };

/** Shots a tower holds for an owner whose `observatoryShotsMult` effects multiply to `shotsMult`. */
export const aetherTowerMaxShots = (shotsMult: number): number =>
  Math.min(AETHER_TOWER_SHOT_HISTORY_CAP, Math.max(1, Math.round(AETHER_TOWER_BASE_SHOTS * shotsMult)));

/** Fire times still inside the refill window, oldest first. */
export const liveAetherTowerShots = (tower: AetherTowerShotView, now: number): number[] =>
  (tower.shotsUsedAt ?? []).filter((firedAt) => firedAt + AETHER_TOWER_SHOT_REFILL_MS > now).sort((a, b) => a - b);

export const aetherTowerShotsRemaining = (tower: AetherTowerShotView, maxShots: number, now: number): number =>
  Math.max(0, maxShots - liveAetherTowerShots(tower, now).length);

/** When the tower next has a shot: `now` if it has one already. */
export const aetherTowerNextShotAt = (tower: AetherTowerShotView, maxShots: number, now: number): number => {
  const live = liveAetherTowerShots(tower, now);
  if (live.length < maxShots) return now;
  // Enough of the oldest shots must refill to bring the count under maxShots.
  return (live[live.length - maxShots] ?? now) + AETHER_TOWER_SHOT_REFILL_MS;
};

/** When the tower's next spent shot comes back, or undefined when it is full. */
export const aetherTowerNextRefillAt = (tower: AetherTowerShotView, now: number): number | undefined => {
  const oldest = liveAetherTowerShots(tower, now)[0];
  return oldest === undefined ? undefined : oldest + AETHER_TOWER_SHOT_REFILL_MS;
};

/** The tower fields to write when it fires one shot at `now`. */
export const spendAetherTowerShot = (
  tower: AetherTowerShotView,
  maxShots: number,
  now: number
): { shotsUsedAt: number[]; cooldownUntil: number | undefined } => {
  const shotsUsedAt = [...liveAetherTowerShots(tower, now), now].slice(-AETHER_TOWER_SHOT_HISTORY_CAP);
  const nextShotAt = aetherTowerNextShotAt({ shotsUsedAt }, maxShots, now);
  return { shotsUsedAt, cooldownUntil: nextShotAt > now ? nextShotAt : undefined };
};
