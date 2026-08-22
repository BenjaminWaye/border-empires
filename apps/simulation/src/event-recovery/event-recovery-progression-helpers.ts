import { isChosenTrickleResource } from "@border-empires/shared";

import { parseOptionalJson } from "./event-recovery-town-helpers.js";

type ProgressionUpdatePayload = {
  techIds?: unknown;
  domainIds?: unknown;
  gold?: unknown;
  chosenTrickleResource?: unknown;
};

type RecoveredProgressionPlayer = {
  techIds?: string[];
  domainIds?: string[];
  points?: number;
  chosenTrickleResource?: unknown;
};

export const applyProgressionUpdateToRecoveredPlayer = (
  player: RecoveredProgressionPlayer,
  payloadJson: string
): void => {
  const payload = parseOptionalJson<ProgressionUpdatePayload>(payloadJson);
  if (!payload) return;
  if (Array.isArray(payload.techIds) && payload.techIds.every((id) => typeof id === "string")) {
    player.techIds = payload.techIds as string[];
  }
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
