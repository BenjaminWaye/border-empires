import { describe, expect, it } from "vitest";
import { attackAlertDisplayName } from "./runtime-frontier-command.js";

describe("attackAlertDisplayName", () => {
  it("uses the actor's set display name when present", () => {
    expect(attackAlertDisplayName("player-1", "Milo Ash")).toBe("Milo Ash");
  });

  it("anonymizes an opaque player ID instead of leaking it as the attacker name", () => {
    const opaqueId = "VK5iriJAhickNf9ArrRweUDnq1W2";
    expect(attackAlertDisplayName(opaqueId, undefined)).toMatch(/^Empire [A-Z0-9]{6}$/);
    expect(attackAlertDisplayName(opaqueId, undefined)).not.toBe(opaqueId);
  });

  it("falls back to the raw ID when it isn't opaque and no name is set", () => {
    expect(attackAlertDisplayName("ai-3", undefined)).toBe("ai-3");
  });

  it("is stable for the same opaque ID", () => {
    const opaqueId = "VK5iriJAhickNf9ArrRweUDnq1W2";
    expect(attackAlertDisplayName(opaqueId, undefined)).toBe(attackAlertDisplayName(opaqueId, undefined));
  });
});
