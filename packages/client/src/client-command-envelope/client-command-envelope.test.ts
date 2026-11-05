import { describe, expect, it } from "vitest";
import { ensureClientCommandEnvelope } from "./client-command-envelope.js";

describe("durable client command identity", () => {
  it("gives Forced Ancillarification an identity and preserves it on repeated delivery", () => {
    const state = { nextCommandClientSeq: 5 };
    const payload: { type: string; commandId?: string; clientSeq?: number } = { type: "FORCED_ANCILLARIFICATION" };
    ensureClientCommandEnvelope(state, payload);
    expect(payload.commandId).toEqual(expect.any(String));
    expect(payload.clientSeq).toBe(5);
    const firstId = payload.commandId;
    ensureClientCommandEnvelope(state, payload);
    expect(payload.commandId).toBe(firstId);
    expect(state.nextCommandClientSeq).toBe(6);
  });
  it("preserves ordinary action behavior and leaves view requests without command metadata", () => {
    const state = { nextCommandClientSeq: 1 };
    const attack: { type: string; clientSeq?: number } = { type: "ATTACK" };
    const detail = { type: "REQUEST_TILE_DETAIL" };
    ensureClientCommandEnvelope(state, attack);
    ensureClientCommandEnvelope(state, detail);
    ensureClientCommandEnvelope(state, undefined);
    expect(attack.clientSeq).toBe(1);
    expect(detail).toEqual({ type: "REQUEST_TILE_DETAIL" });
    expect(state.nextCommandClientSeq).toBe(2);
  });
});
