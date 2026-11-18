import { describe, expect, it, vi } from "vitest";
import { ClientMessageSchema } from "@border-empires/shared";
import { dispatchAfcOrRevealCommand } from "./gateway-afc-and-reveal-command.js";

describe("waystation activation crosses the gateway", () => {
  it("validates a client request and forwards its target with durable metadata", async () => {
    const request = { type: "ACTIVATE_WAYSTATION", x: 10, y: 11, commandId: "collect", clientSeq: 1 };
    expect(ClientMessageSchema.safeParse(request).success).toBe(true);
    const dispatch = vi.fn(async () => {});
    expect(await dispatchAfcOrRevealCommand(request, dispatch)).toBe(true);
    expect(dispatch).toHaveBeenCalledWith("ACTIVATE_WAYSTATION", { x: 10, y: 11 }, true);
    expect(ClientMessageSchema.safeParse({ ...request, x: 1.5 }).success).toBe(false);
  });
});
