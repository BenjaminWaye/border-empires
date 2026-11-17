import { MAX_RESOURCE_SUPPLY_AGREEMENTS, MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER, type ResourceSupplyAgreement } from "./resource-supply-trades.js";

/**
 * One wording for the supply agreement limit, shared by the simulation's
 * refusal, the gateway's offer checks and the client's disabled buttons, so a
 * player always learns whose limit blocks a deal before (not after) accepting.
 */
type AgreementRow = Pick<ResourceSupplyAgreement, "proposerId" | "targetId" | "expiresAt">;

/** Agreements `playerId` is in that have not run out by `now`. */
export const activeSupplyAgreementCount = (rows: readonly AgreementRow[] | undefined, playerId: string, now: number): number =>
  (rows ?? []).filter(row => (row.proposerId === playerId || row.targetId === playerId) && (row.expiresAt === undefined || row.expiresAt > now)).length;

export const supplyAgreementsFull = (count: number): boolean => count >= MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER;

/** `who` undefined means the reader ("You"). */
export const supplyAgreementLimitMessage = (who?: string): string => {
  const max = MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER;
  return who === undefined
    ? `You already have ${max}/${max} active supply agreements. End one to make room.`
    : `${who} already has ${max}/${max} active supply agreements and can't take on another.`;
};

export const worldSupplyAgreementLimitMessage = (): string =>
  `This world has reached its limit of ${MAX_RESOURCE_SUPPLY_AGREEMENTS} active supply agreements. Try again after one ends.`;
