import type { NetworkSiteCounts } from "../resource-networks/resource-networks.js";
import type { SlotResource } from "../structure-slots/structure-slots.js";
import type { ResourceSupplyAgreement, ResourceSupplyOffer } from "./resource-supply-trades.js";
export type ResourceSupplyAgreementStatus = ResourceSupplyAgreement & { fulfilled: boolean };
/** Server export projection; only the holdings and this player's agreements go to the client. */
export type ResourceSupplyPlayerState = {
  resourceTradeHoldings?: ResourceSupplyOffer;
  resourceTradeAgreements?: readonly ResourceSupplyAgreementStatus[];
  effectiveResourceSupply?: Record<SlotResource, number>;
  effectiveNetworkSupply?: NetworkSiteCounts;
};
