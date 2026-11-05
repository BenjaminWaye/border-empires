import { describe, expect, it, vi } from "vitest";
import { ClientMessageSchema } from "@border-empires/shared";
import { dispatchAfcOrRevealCommand } from "./gateway-afc-and-reveal-command.js";

describe("factory conversion gateway boundary", () => {
  it("validates a client action and forwards its coordinates as a durable command", async () => {
    const message = ClientMessageSchema.parse({ type: "FORCED_ANCILLARIFICATION", x: 11, y: 10 });
    const dispatch = vi.fn(async () => {});
    expect(await dispatchAfcOrRevealCommand(message, dispatch)).toBe(true);
    expect(dispatch).toHaveBeenCalledWith("FORCED_ANCILLARIFICATION", { x: 11, y: 10 }, true);
    expect(ClientMessageSchema.safeParse({ type: "FORCED_ANCILLARIFICATION", x: 1.5, y: 10 }).success).toBe(false);
  });
});
