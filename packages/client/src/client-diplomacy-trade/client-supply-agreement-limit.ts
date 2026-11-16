import { MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER, activeSupplyAgreementCount, supplyAgreementLimitMessage, supplyAgreementsFull,
  type ResourceSupplyAgreementStatus } from "@border-empires/shared";
import { resourceTradeServerNow } from "./client-resource-deadline.js";

// Playtest 2026-11-16: the supply agreement limit was invisible until an
// accept failed with "Too many active resource agreements". These helpers
// show the count and block Accept / Send before the server would refuse.

/** Highlighted from this many in use. */
const NEAR_LIMIT = MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER - 2;

export const ownSupplyAgreementCount = (rows: readonly ResourceSupplyAgreementStatus[] | undefined, ownId: string | undefined, now = resourceTradeServerNow()): number =>
  ownId ? activeSupplyAgreementCount(rows, ownId, now) : 0;

/** Why you can't take on another supply agreement, or undefined. */
export const ownSupplyLimitReason = (count: number): string | undefined => (supplyAgreementsFull(count) ? supplyAgreementLimitMessage() : undefined);

export const supplyAgreementUsageHtml = (count: number): string => {
  const max = MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER;
  const tone = supplyAgreementsFull(count) ? "bad" : count >= NEAR_LIMIT ? "warn" : "neutral";
  const note = tone === "bad" ? " · Full: end one to make a new deal" : tone === "warn" ? " · Nearly full" : "";
  return `<p class="diplomacy-resource-limit" data-supply-agreement-usage data-tone="${tone}">Supply agreements in use: ${count}/${max}${note}</p>`;
};
