import { z } from "zod";
import { DiplomacyGoodsSchema } from "@border-empires/shared";

export const DiplomacySettlementPayloadSchema = z.object({
  proposerId: z.string().min(1), targetId: z.string().min(1),
  proposerPays: DiplomacyGoodsSchema, targetPays: DiplomacyGoodsSchema,
  supplyDurationHours: z.union([z.literal(12), z.literal(24)]).optional(),
  refundOf: z.string().min(1).max(160).optional()
}).refine(row => row.proposerId !== row.targetId);
export type DiplomacySettlementPayload = z.infer<typeof DiplomacySettlementPayloadSchema>;

