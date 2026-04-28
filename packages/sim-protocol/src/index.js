import { z } from "zod";
import { DurableCommandTypeSchema } from "@border-empires/client-protocol";
export const CommandEnvelopeSchema = z.object({
    commandId: z.string().min(1),
    sessionId: z.string().min(1),
    playerId: z.string().min(1),
    clientSeq: z.number().int().nonnegative(),
    issuedAt: z.number().int().nonnegative(),
    type: DurableCommandTypeSchema,
    payloadJson: z.string()
});
export const SIMULATION_PROTO_PATH = new URL("./simulation.proto", import.meta.url);
