import { applySeasonErrorCodes } from "../client-join-season-errors/client-season-error-codes.js";
import { settleCrestSaveFromError } from "../client-profile-edit-crest/client-profile-edit-crest.js";
import { clearTechCommissionOnError } from "../client-tech-commission/client-tech-commission.js";

type ErrorSideEffectState = Parameters<typeof applySeasonErrorCodes>[0] & Parameters<typeof clearTechCommissionOnError>[0];

/**
 * The feature-specific reactions to a gateway ERROR that client-network.ts
 * runs before its generic action-failure path: season-flow codes, a waiting
 * crest save (only for a refusal naming the crest slot), and a pending tech
 * commission. None of them swallows the ERROR.
 */
export const applyServerErrorSideEffects = (
  state: ErrorSideEffectState,
  msg: Record<string, unknown>,
  code: string,
  message: string,
  renderHud: () => void
): void => {
  applySeasonErrorCodes(state, code, message, renderHud);
  settleCrestSaveFromError(code, message, msg.slot);
  clearTechCommissionOnError(state, code);
};
