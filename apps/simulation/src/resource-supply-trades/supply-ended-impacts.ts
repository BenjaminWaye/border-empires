import type { PersonalActivitySupplyEndedReason } from "@border-empires/game-domain";
import type { ResourceSupplyAgreement } from "@border-empires/shared";

import type { PersonalImpactSupplyEnded } from "../personal-impact-log/personal-impact-log.js";

// A resource supply deal ending, as a Chronicle "Yours" card for each House in
// it. Persona playtest: an ally's food supply stopped overnight with no word
// anywhere, the newest town went unfed, and the player only found out by
// comparing Economy numbers to their notes. Rollbacks of a settlement that
// never went through (cancelRefunded) are not deals ending and are not logged.

export const supplyEndedImpacts = (
  agreement: ResourceSupplyAgreement,
  reason: PersonalActivitySupplyEndedReason,
  byPlayerId: string | undefined,
  occurredAt: number
): PersonalImpactSupplyEnded[] =>
  [
    { playerId: agreement.proposerId, counterpartyPlayerId: agreement.targetId, youGave: agreement.proposerGives, youGot: agreement.targetGives },
    { playerId: agreement.targetId, counterpartyPlayerId: agreement.proposerId, youGave: agreement.targetGives, youGot: agreement.proposerGives }
  ].map((side) => ({
    id: reason === "SUSPENDED" ? `supply-suspended:${agreement.id}:${side.playerId}:${occurredAt}` : `supply-ended:${agreement.id}:${side.playerId}`,
    kind: "SUPPLY_ENDED",
    occurredAt,
    reason,
    ...(byPlayerId ? { byPlayerId } : {}),
    ...side,
    youGave: { ...side.youGave },
    youGot: { ...side.youGot }
  }));
