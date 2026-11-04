// The broken-pact part of an AI's diplomacy context, read from the
// requester's social snapshot: whether they broke a truce with this AI
// (a season-long grudge), how many truces they broke with others recently,
// and whether they started breaking an alliance with this AI recently.
import { brokenPactStillRemembered } from "@border-empires/shared";

import type { SocialSnapshot } from "../social-state/social-state-types.js";

export type AiDiplomacyGrudges = {
  requesterBrokeTruceWithAi: boolean;
  /** Truces the requester broke with anyone else within BROKEN_PACT_OPINION_WINDOW_MS. */
  requesterTruceBreaksWithOthers: number;
  /** The requester started breaking an alliance with this AI within BROKEN_PACT_OPINION_WINDOW_MS. */
  requesterBrokeAllianceWithAi: boolean;
};

export const aiDiplomacyGrudges = (
  snapshot: Pick<SocialSnapshot, "truceBreaksThisSeason" | "activeAllianceBreaks" | "recentAllianceBreaks">,
  requesterId: string,
  aiPlayerId: string,
  now: number
): AiDiplomacyGrudges => {
  const breaks = snapshot.truceBreaksThisSeason;
  const allianceBreaks = [...snapshot.activeAllianceBreaks, ...snapshot.recentAllianceBreaks];
  return {
    requesterBrokeTruceWithAi: breaks.some((record) => record.targetPlayerId === aiPlayerId),
    requesterTruceBreaksWithOthers: breaks.filter((record) => record.targetPlayerId !== aiPlayerId && brokenPactStillRemembered(record.brokenAt, now)).length,
    requesterBrokeAllianceWithAi: allianceBreaks.some(
      (notice) => notice.otherPlayerId === aiPlayerId && notice.createdByPlayerId === requesterId && brokenPactStillRemembered(notice.startedAt, now)
    )
  };
};
