import { z } from "zod";
import { DiplomacyGoodsSchema } from "@border-empires/shared";

export const DiplomacySettlementPayloadSchema = z.object({
  proposerId: z.string().min(1), targetId: z.string().min(1),
  proposerPays: DiplomacyGoodsSchema, targetPays: DiplomacyGoodsSchema,
  supplyDurationHours: z.union([z.literal(12), z.literal(24)]).optional(),
  /** A truce's Coin per hour with no resource slot is paid for this many hours from acceptance. */
  coinTermHours: z.union([z.literal(12), z.literal(24)]).optional(),
  refundOf: z.string().min(1).max(160).optional(),
  /** Pays a fell-through deal back: returned towns go back without the "captured from them" check. */
  refund: z.literal(true).optional()
}).refine(row => row.proposerId !== row.targetId);
export type DiplomacySettlementPayload = z.infer<typeof DiplomacySettlementPayloadSchema>;

