// The goodwill a gift of returned towns earns with an AI: the same coin value
// the AI puts on getting each of its own towns back in a truce
// (ai-town-return-value.ts). A town it never lost counts nothing.
import { townsValueToAi, type DiplomacyTownRef, type ReturnableTown } from "@border-empires/shared";

import { REPARATION_HOURS_PER_TILE } from "../ai-diplomacy-stance/ai-diplomacy-pricing.js";
import { aiTemperamentForId } from "../ai-diplomacy-stance/ai-diplomacy-temperament.js";
import { pricedReturnableTowns } from "../ai-diplomacy-stance/ai-town-return-value.js";

export const createTownGiftValue = (deps: {
  returnableTownsOf: (playerId: string) => Promise<readonly ReturnableTown[]>;
  aiIncomePerMinute: (aiId: string) => Promise<number | undefined>;
}) => async (payerId: string, aiId: string, towns: readonly DiplomacyTownRef[]): Promise<number> => {
  const [held, income] = await Promise.all([deps.returnableTownsOf(payerId), deps.aiIncomePerMinute(aiId)]);
  const priced = pricedReturnableTowns(held, aiId, income ?? 0, aiTemperamentForId(aiId), REPARATION_HOURS_PER_TILE);
  return townsValueToAi(priced, towns);
};
