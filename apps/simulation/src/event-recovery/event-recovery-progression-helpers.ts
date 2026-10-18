import { applyRecoveredAfcState } from "./event-recovery-afc-state.js";
import type { RecoveredPlayerState } from "./event-recovery-player-state.js";
import { isChosenTrickleResource } from "@border-empires/shared";

import { parseOptionalJson } from "./event-recovery-town-helpers.js";

export const applyProgressionUpdateToRecoveredPlayer = (
  player: RecoveredPlayerState,
  payloadJson: string
): void => {
  const payload = parseOptionalJson<Record<string, unknown>>(payloadJson);
  if (!payload) return;
  applyRecoveredAfcState(player, payload);
  if (Array.isArray(payload.techIds) && payload.techIds.every((id) => typeof id === "string")) {
    player.techIds = payload.techIds as string[];
  }
  if (payload.afcUpgradeRuleset === "afc-v1") player.afcUpgradeRuleset = payload.afcUpgradeRuleset;
  if (Array.isArray(payload.domainIds) && payload.domainIds.every((id) => typeof id === "string")) {
    player.domainIds = payload.domainIds as string[];
  }
  if (typeof payload.gold === "number") {
    player.points = payload.gold;
  }
  if (isChosenTrickleResource(payload.chosenTrickleResource)) {
    player.chosenTrickleResource = payload.chosenTrickleResource;
  }
};
