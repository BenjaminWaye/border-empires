import { describe, expect, it, vi } from "vitest";

import { handlePlayerRespawned, readEmpireFell } from "./player-respawned-email.js";

const deps = () => {
  const sendEmpireFellAlert = vi.fn(async () => "sent" as const);
  const alertPlayerRespawned = vi.fn();
  return {
    sendEmpireFellAlert,
    alertPlayerRespawned,
    nameOf: (id: string) => (id === "ai-2" ? "Vorn" : id),
    sendGameplayEmailAlert: (_kind: string, _recipient: string, send: () => Promise<unknown>) => void send()
  };
};

describe("readEmpireFell", () => {
  it("detects a conquest wipe-out with its new start", () => {
    expect(readEmpireFell("p1", { reason: "eliminated", x: 4, y: 9, fellToPlayerId: "ai-2" })).toEqual({ recipientPlayerId: "p1", x: 4, y: 9, captorId: "ai-2" });
  });

  it("ignores withdrawals, recovery respawns and payloads without a tile", () => {
    expect(readEmpireFell("p1", { reason: "eliminated", x: 4, y: 9, withdrawn: true })).toBeUndefined();
    expect(readEmpireFell("p1", { reason: "auth_recovery", x: 4, y: 9 })).toBeUndefined();
    expect(readEmpireFell("p1", { reason: "eliminated" })).toBeUndefined();
  });
});

describe("handlePlayerRespawned", () => {
  it("alerts Slack for every respawn and emails a wiped-out player who took most", () => {
    const d = deps();
    handlePlayerRespawned("p1", { reason: "eliminated", x: 4, y: 9, fellToPlayerId: "ai-2" }, d);
    expect(d.alertPlayerRespawned).toHaveBeenCalledWith("p1", "eliminated");
    expect(d.sendEmpireFellAlert).toHaveBeenCalledWith({ recipientPlayerId: "p1", x: 4, y: 9, captorName: "Vorn" });
  });

  it("names barbarians and sends no email for a recovery respawn", () => {
    const d = deps();
    handlePlayerRespawned("p1", { reason: "eliminated", x: 1, y: 2, fellToPlayerId: "barbarian-1" }, d);
    expect(d.sendEmpireFellAlert).toHaveBeenCalledWith(expect.objectContaining({ captorName: "the barbarians" }));
    handlePlayerRespawned("p1", { reason: "auth_recovery", x: 1, y: 2 }, d);
    expect(d.sendEmpireFellAlert).toHaveBeenCalledTimes(1);
    expect(d.alertPlayerRespawned).toHaveBeenLastCalledWith("p1", "auth_recovery");
  });
});
