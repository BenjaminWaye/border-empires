// A verified payment event for a cosmetic order, as the webhook parser reads
// it from the order id Stripe carries on the Checkout Session and the payment.
export type CosmeticPaymentEvent =
  | { eventId: string; kind: "paid"; cosmeticOrderId: string; paymentRef?: string }
  | { eventId: string; kind: "expired"; cosmeticOrderId: string }
  | { eventId: string; kind: "refunded"; cosmeticOrderId: string; fullRefund: boolean }
  | { eventId: string; kind: "disputed"; cosmeticOrderId: string; disputeId: string }
  /** `lost`: the bank decided for the buyer, and the money is gone. */
  | { eventId: string; kind: "dispute_closed"; cosmeticOrderId: string; disputeId: string; lost: boolean };

export const isCosmeticPaymentEvent = (event: object): event is CosmeticPaymentEvent => "cosmeticOrderId" in event;
