import { z } from "zod";

// Account cosmetics (cosmetics/cosmetics.ts). REQUEST_COSMETICS asks what the
// account owns and shows; SET_COSMETIC picks an owned cosmetic for a slot, or
// null for the default look. The gateway re-validates slot, id and ownership.
// Kept beside messages.ts, which is at the file-line limit.
export const RequestCosmeticsMessageSchema = z.object({ type: z.literal("REQUEST_COSMETICS") });
export const SetCosmeticMessageSchema = z.object({
  type: z.literal("SET_COSMETIC"),
  slot: z.string().min(1).max(24),
  cosmeticId: z.string().min(1).max(24).nullable()
});

/** Both, for ClientMessageSchema's union. */
export const COSMETICS_CLIENT_MESSAGE_SCHEMAS = [RequestCosmeticsMessageSchema, SetCosmeticMessageSchema] as const;
