// Which unlocks deserve a celebration card (client-unlock-celebration.ts). Owner
// request after the 2026-11-25 playtest: earning an achievement or completing a
// House Charge happened silently. Pure apart from the small "seen" set, which
// keeps a reload from replaying a card already shown in this browser.
//
// The first update of a page (prev undefined) is the baseline: badges and held
// charges the House already had when the session started are never celebrated.
import { ACHIEVEMENTS, type AchievementId, type AchievementsView, type HouseChargeView, type HouseChargesPayload } from "@border-empires/shared";

const SEEN_STORAGE_KEY = "border-empires.unlock-celebrations.seen.v1";
/** Old keys drop off first; a season has six achievements and a handful of charges. */
const SEEN_LIMIT = 200;

/** An achievement is earned once per contest, so its server earned time names that one unlock. */
export const achievementSeenKey = (id: AchievementId, earnedAt: number): string => `ach:${id}:${earnedAt}`;
/** A charge celebrates the first time it is held in a deal, not again each time a broken road is mended. */
export const chargeSeenKey = (dealtAt: number, chargeId: string): string => `charge:${dealtAt}:${chargeId}`;

export const readSeenUnlocks = (): Set<string> => {
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : []);
  } catch {
    return new Set();
  }
};

export const markUnlockSeen = (key: string): void => {
  try {
    const keys = [...readSeenUnlocks()].filter((existing) => existing !== key);
    keys.push(key);
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(keys.slice(-SEEN_LIMIT)));
  } catch {
    // Storage blocked (private mode): the session baseline still stops replays within this page.
  }
};

/** Achievements earned since the previous PLAYER_UPDATE, in badge order. */
export const newAchievementUnlocks = (
  prev: AchievementsView | undefined,
  next: AchievementsView | undefined,
  seen: ReadonlySet<string>
): { id: AchievementId; seenKey: string }[] => {
  if (!prev || !next) return [];
  const out: { id: AchievementId; seenKey: string }[] = [];
  for (const achievement of ACHIEVEMENTS) {
    const earnedAt = next.earned[achievement.id];
    if (earnedAt === undefined || prev.earned[achievement.id] !== undefined) continue;
    const seenKey = achievementSeenKey(achievement.id, earnedAt);
    if (!seen.has(seenKey)) out.push({ id: achievement.id, seenKey });
  }
  return out;
};

/** Kept charges that became held since the previous HOUSE_CHARGES push of the same deal. */
export const newlyHeldCharges = (
  prev: HouseChargesPayload | undefined,
  next: HouseChargesPayload | undefined,
  seen: ReadonlySet<string>
): { charge: HouseChargeView; seenKey: string }[] => {
  if (!prev || !next || prev.dealtAt !== next.dealtAt) return [];
  const wasHeld = new Set(prev.charges.filter((charge) => charge.held).map((charge) => charge.id));
  return next.charges
    .filter((charge) => charge.kept && charge.held && !wasHeld.has(charge.id))
    .map((charge) => ({ charge, seenKey: chargeSeenKey(next.dealtAt, charge.id) }))
    .filter((entry) => !seen.has(entry.seenKey));
};
