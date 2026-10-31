import { ResourceTradeOfferSchema, type ResourceTradeOffer, ResourceSupplyAgreementSchema, ResourceSupplyOfferSchema, MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER, type ResourceSupplyOffer, type ResourceSupplyAgreementStatus } from "@border-empires/shared";
export const createInitialResourceTradeState = () => ({
  resourceTradeOffers: [] as readonly ResourceTradeOffer[],
  resourceTradeHoldings: undefined as ResourceSupplyOffer | undefined,
  resourceTradeAgreements: [] as readonly ResourceSupplyAgreementStatus[]
});
export function applyResourceTradeState(state: ReturnType<typeof createInitialResourceTradeState>, payload: Record<string, unknown>, initial = false): void {
  if (initial) { state.resourceTradeHoldings = undefined; state.resourceTradeAgreements = []; state.resourceTradeOffers = []; }
  if (Array.isArray(payload.resourceTradeOffers)) state.resourceTradeOffers = payload.resourceTradeOffers.slice(0,16).flatMap(row => { const parsed = ResourceTradeOfferSchema.safeParse(row); return parsed.success ? [parsed.data] : []; });
  if ("resourceTradeHoldings" in payload) {
    const parsed = ResourceSupplyOfferSchema.safeParse(payload.resourceTradeHoldings);
    state.resourceTradeHoldings = parsed.success ? parsed.data : undefined;
  }
  if (Array.isArray(payload.resourceTradeAgreements)) state.resourceTradeAgreements = payload.resourceTradeAgreements
    .slice(0, MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER).flatMap(raw => {
      const row = ResourceSupplyAgreementSchema.safeParse(raw);
      return row.success ? [{ ...row.data, fulfilled: raw.fulfilled === true }] : [];
    });
}
