// Where unlocks are noticed: PLAYER_UPDATE `achievements` (client-network.ts)
// and the HOUSE_CHARGES push (client-map-push-messages.ts). Each compares the
// state before and after the update and queues a celebration card per new unlock.
import { achievementById, houseChargeDomain, type AchievementsView, type HouseChargeView, type HouseChargesPayload } from "@border-empires/shared";
import { applyPlayerUpdateAchievements } from "../client-achievements/client-achievements-state.js";
import { houseChargeCardArtSvg } from "../client-house-charges/client-house-charge-cards.js";
import { markUnlockSeen, newAchievementUnlocks, newlyHeldCharges, readSeenUnlocks } from "./client-unlock-celebration-detect.js";
import { queueUnlockCelebration, type UnlockCelebration } from "./client-unlock-celebration.js";

export const achievementCelebration = (achievement: { name: string; goal: string }): UnlockCelebration => ({
  kind: "achievement",
  eyebrow: "Achievement earned",
  title: achievement.name,
  line: achievement.goal,
  iconHtml: "★"
});

export const chargeCelebration = (charge: Pick<HouseChargeView, "kind" | "title" | "rarity" | "renown" | "difficultyScored">): UnlockCelebration => ({
  kind: "charge",
  eyebrow: "Charge complete",
  title: charge.title,
  line: `Hold it to the crowning: +${houseChargeDomain(charge)} Domain`,
  iconHtml: houseChargeCardArtSvg({ kind: charge.kind })
});

/** Queues a card for every achievement in `next` that `prev` did not have. `prev` undefined is the session baseline. */
export const celebrateNewAchievements = (prev: AchievementsView | undefined, next: AchievementsView | undefined): void => {
  for (const { id, seenKey } of newAchievementUnlocks(prev, next, readSeenUnlocks())) {
    markUnlockSeen(seenKey);
    queueUnlockCelebration(achievementCelebration(achievementById(id)));
  }
};

/** Queues a card for every kept charge that became held. `prev` undefined (or another deal) is the baseline. */
export const celebrateNewlyHeldCharges = (prev: HouseChargesPayload | undefined, next: HouseChargesPayload | undefined): void => {
  for (const { charge, seenKey } of newlyHeldCharges(prev, next, readSeenUnlocks())) {
    markUnlockSeen(seenKey);
    queueUnlockCelebration(chargeCelebration(charge));
  }
};

type AchievementsHolder = Parameters<typeof applyPlayerUpdateAchievements>[0];

/** applyPlayerUpdateAchievements, then a celebration for each badge this update newly earned. */
export const applyPlayerUpdateAchievementsAndCelebrate = (state: AchievementsHolder, msg: { readonly achievements?: unknown }): void => {
  const prev = state.achievements;
  applyPlayerUpdateAchievements(state, msg);
  if (state.achievements !== prev) celebrateNewAchievements(prev, state.achievements);
};
