import { z } from "zod";

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("AUTH"), token: z.string().min(1) }),
  z.object({ type: z.literal("PING"), t: z.number() }),
  z.object({ type: z.literal("SUBSCRIBE_CHUNKS"), cx: z.number(), cy: z.number(), radius: z.number().int().min(0).max(8) }),
  z.object({ type: z.literal("EXPAND"), fromX: z.number().int(), fromY: z.number().int(), toX: z.number().int(), toY: z.number().int() }),
  z.object({ type: z.literal("ATTACK"), fromX: z.number().int(), fromY: z.number().int(), toX: z.number().int(), toY: z.number().int(), powerupId: z.string().optional() }),
  z.object({ type: z.literal("CHOOSE_TECH"), techId: z.string().min(1) }),
  z.object({ type: z.literal("ALLIANCE_REQUEST"), targetPlayerName: z.string().min(1) }),
  z.object({ type: z.literal("ALLIANCE_ACCEPT"), requestId: z.string().min(1) }),
  z.object({ type: z.literal("ALLIANCE_BREAK"), targetPlayerId: z.string().min(1) }),
  z.object({ type: z.literal("SET_TILE_COLOR"), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
