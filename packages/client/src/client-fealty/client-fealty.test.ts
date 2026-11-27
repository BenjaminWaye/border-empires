import { describe, expect, it } from "vitest";

import {
  FEALTY_SIZE_RATIO,
  allianceActionLabel,
  allianceOfferedLine,
  allyStatusLabel,
  fealtyLookupFor,
  fealtyStanding,
  incomingAllianceHeadline
} from "./client-fealty.js";
import { allianceAnswerCounterpart, fealtyAnnouncement, fealtyAnswerTitle } from "./client-fealty-announcement.js";

const entry = (id: string, tiles: number) => ({ id, tiles });

describe("fealtyStanding", () => {
  it("is SWEAR when the other empire has at least twice your garrisoned tiles", () => {
    expect(FEALTY_SIZE_RATIO).toBe(2);
    expect(fealtyStanding(41, 82)).toBe("SWEAR");
    expect(fealtyStanding(41, 1_200)).toBe("SWEAR");
    expect(fealtyStanding(0, 5)).toBe("SWEAR");
  });

  it("is DEMAND when you have at least twice theirs", () => {
    expect(fealtyStanding(82, 41)).toBe("DEMAND");
    expect(fealtyStanding(5, 0)).toBe("DEMAND");
  });

  it("stays ALLIANCE between near-equals, empty empires or unknown sizes", () => {
    expect(fealtyStanding(41, 81)).toBe("ALLIANCE");
    expect(fealtyStanding(81, 41)).toBe("ALLIANCE");
    expect(fealtyStanding(0, 0)).toBe("ALLIANCE");
    expect(fealtyStanding(undefined, 500)).toBe("ALLIANCE");
    expect(fealtyStanding(500, undefined)).toBe("ALLIANCE");
  });
});

describe("fealtyLookupFor", () => {
  const state = {
    me: "me",
    leaderboard: { overall: [entry("ai-1", 900), entry("ai-2", 60), entry("ai-3", 10)], selfOverall: entry("me", 41) }
  };
  const lookup = fealtyLookupFor(state);

  it("compares your leaderboard tiles (selfOverall when you are off the top list) with theirs", () => {
    expect(lookup("ai-1")).toBe("SWEAR");
    expect(lookup("ai-2")).toBe("ALLIANCE");
    expect(lookup("ai-3")).toBe("DEMAND");
  });

  it("is ALLIANCE for an empire off the leaderboard, yourself, or no id", () => {
    expect(lookup("ai-9")).toBe("ALLIANCE");
    expect(lookup("me")).toBe("ALLIANCE");
    expect(lookup(undefined)).toBe("ALLIANCE");
    expect(fealtyLookupFor({ me: "me" })("ai-1")).toBe("ALLIANCE");
  });
});

describe("fealty wording", () => {
  it("names the action by who is larger", () => {
    expect(allianceActionLabel("SWEAR")).toBe("Swear fealty");
    expect(allianceActionLabel("DEMAND")).toBe("Demand fealty");
    expect(allianceActionLabel("ALLIANCE")).toBe("Propose alliance");
  });

  it("words the recipient's offer from the sender's side", () => {
    // You are the larger (DEMAND), so a sender swears fealty to you; you are smaller, so they demand it.
    expect(incomingAllianceHeadline("DEMAND")).toBe("swears fealty");
    expect(incomingAllianceHeadline("SWEAR")).toBe("demands your fealty");
    expect(incomingAllianceHeadline("ALLIANCE")).toBe("proposes an alliance");
  });

  it("labels allies and sent offers", () => {
    expect(allyStatusLabel("SWEAR")).toBe("Your liege");
    expect(allyStatusLabel("DEMAND")).toBe("Sworn to you");
    expect(allyStatusLabel("ALLIANCE")).toBe("Ally");
    expect(allianceOfferedLine("SWEAR", "Ada")).toBe("Fealty offered to Ada.");
    expect(allianceOfferedLine("DEMAND", "Ada")).toBe("Fealty demanded of Ada.");
    expect(allianceOfferedLine("ALLIANCE", "Ada")).toBe("Alliance offered to Ada.");
    expect(allianceOfferedLine("ALLIANCE", undefined)).toBe("Alliance offered.");
  });
});

describe("fealtyAnnouncement", () => {
  it("rewords the gateway's human and AI answers, keeping an AI's reason", () => {
    expect(fealtyAnnouncement("Ada accepted your alliance offer.", "SWEAR")).toBe("Ada accepted your fealty.");
    expect(fealtyAnnouncement("Ada accepted your alliance. Ada trusts you.", "DEMAND")).toBe("Ada swore fealty to you. Ada trusts you.");
    expect(fealtyAnnouncement("Ada declined your alliance offer. Ada is wary of you.", "SWEAR")).toBe("Ada refused your fealty. Ada is wary of you.");
    expect(fealtyAnnouncement("Ada declined your alliance offer.", "DEMAND")).toBe("Ada refused to swear fealty.");
    expect(fealtyAnnouncement("You accepted Ada's alliance offer.", "SWEAR")).toBe("You swore fealty to Ada.");
    expect(fealtyAnnouncement("You accepted Ada's alliance offer.", "DEMAND")).toBe("You accepted Ada's fealty.");
    expect(fealtyAnnouncement("You declined Ada's alliance offer.", "SWEAR")).toBe("You refused to swear fealty to Ada.");
  });

  it("leaves near-equal answers and unrelated text alone", () => {
    expect(fealtyAnnouncement("Ada accepted your alliance offer.", "ALLIANCE")).toBe("Ada accepted your alliance offer.");
    expect(fealtyAnnouncement("Ada started a 24h notice to break your alliance.", "SWEAR")).toBe("Ada started a 24h notice to break your alliance.");
  });

  it("titles answered offers", () => {
    expect(fealtyAnswerTitle(true, "SWEAR")).toBe("Fealty sworn");
    expect(fealtyAnswerTitle(true, "DEMAND")).toBe("Fealty sworn to you");
    expect(fealtyAnswerTitle(false, "DEMAND")).toBe("Fealty refused");
    expect(fealtyAnswerTitle(true, "ALLIANCE")).toBeUndefined();
  });
});

describe("allianceAnswerCounterpart", () => {
  const request = (id: string, fromPlayerId: string, toPlayerId: string) => ({ id, fromPlayerId, toPlayerId });

  it("finds the House whose pending offer was answered", () => {
    const before = { allies: [], incomingAllianceRequests: [request("in", "ai-2", "me")], outgoingAllianceRequests: [request("out", "me", "ai-1")] };
    expect(allianceAnswerCounterpart(before, { outgoingAllianceRequests: [], incomingAllianceRequests: before.incomingAllianceRequests })).toBe("ai-1");
    expect(allianceAnswerCounterpart(before, { outgoingAllianceRequests: before.outgoingAllianceRequests, incomingAllianceRequests: [] })).toBe("ai-2");
  });

  it("falls back to a new ally, else nothing", () => {
    const before = { allies: ["ai-1"], incomingAllianceRequests: [], outgoingAllianceRequests: [] };
    expect(allianceAnswerCounterpart(before, { allies: ["ai-1", "ai-3"] })).toBe("ai-3");
    expect(allianceAnswerCounterpart(before, {})).toBeUndefined();
  });
});
