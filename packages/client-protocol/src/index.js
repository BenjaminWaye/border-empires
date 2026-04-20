import { z } from "zod";
export const DurableCommandTypeSchema = z.enum([
    "ATTACK",
    "EXPAND",
    "BREAKTHROUGH_ATTACK",
    "SETTLE",
    "BUILD_FORT",
    "BUILD_OBSERVATORY",
    "BUILD_SIEGE_OUTPOST",
    "BUILD_ECONOMIC_STRUCTURE",
    "CANCEL_CAPTURE",
    "COLLECT_TILE",
    "COLLECT_VISIBLE",
    "CHOOSE_TECH",
    "CHOOSE_DOMAIN"
]);
export const ClientCommandEnvelopeSchema = z.object({
    commandId: z.string().min(1),
    clientSeq: z.number().int().nonnegative(),
    issuedAt: z.number().int().nonnegative(),
    type: DurableCommandTypeSchema,
    payload: z.record(z.string(), z.unknown())
});
