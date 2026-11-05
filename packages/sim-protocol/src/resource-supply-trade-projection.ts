import { MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER, ResourceSupplyAgreementSchema, ResourceSupplyOfferSchema, type ResourceSupplyAgreementStatus, type ResourceSupplyPlayerState } from "@border-empires/shared";
export function mergeResourceTradeHoldings(payload: Record<string, unknown>): Pick<ResourceSupplyPlayerState, "resourceTradeHoldings"> | undefined {
  const parsed = ResourceSupplyOfferSchema.safeParse(payload.resourceTradeHoldings);
  return parsed.success ? { resourceTradeHoldings: parsed.data } : undefined;
}
export function mergeResourceTradeAgreements(payload: Record<string, unknown>): Pick<ResourceSupplyPlayerState, "resourceTradeAgreements"> | undefined {
  if (!Array.isArray(payload.resourceTradeAgreements) || payload.resourceTradeAgreements.length > MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER) return undefined;
  const rows: ResourceSupplyAgreementStatus[] = [];
  for (const raw of payload.resourceTradeAgreements) {
    const parsed = ResourceSupplyAgreementSchema.safeParse(raw);
    if (!parsed.success || !raw || typeof raw.fulfilled !== "boolean") return undefined;
    rows.push({ ...parsed.data, fulfilled: raw.fulfilled });
  }
  return { resourceTradeAgreements: rows };
}
