import { describe, expect, it } from "vitest";

import {
  findAllianceRequestBetweenPlayers,
  findAllianceRequestForRecipient,
  findAllianceRequestForSender
} from "./server-alliance-request-runtime.js";

describe("server-alliance-request-runtime", () => {
  it("keeps existing alliance requests actionable regardless of legacy expiry timestamps", () => {
    const request = {
      id: "request-1",
      fromPlayerId: "alpha",
      toPlayerId: "beta",
      createdAt: 10,
      expiresAt: 20
    };

    expect(findAllianceRequestBetweenPlayers([request], "alpha", "beta")).toEqual(request);
    expect(findAllianceRequestBetweenPlayers([request], "beta", "alpha")).toEqual(request);
    expect(findAllianceRequestForRecipient(new Map([[request.id, request]]), request.id, "beta")).toEqual(request);
    expect(findAllianceRequestForSender(new Map([[request.id, request]]), request.id, "alpha")).toEqual(request);
  });

  it("rejects request actions from players who do not own that side of the request", () => {
    const request = {
      id: "request-2",
      fromPlayerId: "alpha",
      toPlayerId: "beta",
      createdAt: 30
    };
    const requests = new Map([[request.id, request]]);

    expect(findAllianceRequestForRecipient(requests, request.id, "alpha")).toBeUndefined();
    expect(findAllianceRequestForSender(requests, request.id, "beta")).toBeUndefined();
  });
});
