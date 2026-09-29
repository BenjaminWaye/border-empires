import { describe, expect, it } from "vitest";

import { joinSeason, preparePlayer, type PrepareLikeRequest, type ProtoPreparePlayerAck } from "./sim-client-prepare-player.js";

const recordingRpc = (response: ProtoPreparePlayerAck) => {
  const requests: PrepareLikeRequest[] = [];
  const rpc = (request: PrepareLikeRequest, callback: (error: Error | null, response: ProtoPreparePlayerAck) => void) => {
    requests.push(request);
    callback(null, response);
  };
  return { rpc, requests };
};

describe("prepare/join auth_kind", () => {
  it("sends auth_kind only when the caller knows the account kind", async () => {
    const { rpc, requests } = recordingRpc({ ok: true, player_id: "p" });

    await preparePlayer(rpc, "p");
    await preparePlayer(rpc, "p", undefined, { isGuest: true });
    await preparePlayer(rpc, "p", undefined, { isGuest: false });

    // Omitting it is what keeps an unrelated caller from looking like a
    // guest upgrade to the simulation.
    expect(requests.map((request) => request.auth_kind)).toEqual([undefined, "guest", "account"]);
    expect("auth_kind" in requests[0]!).toBe(false);
  });

  it("surfaces guest_full from JoinSeason as guestFull", async () => {
    const { rpc } = recordingRpc({ ok: true, player_id: "p", spawned: false, guest_full: true });

    await expect(joinSeason(rpc, "p", undefined, { isGuest: true })).resolves.toMatchObject({ spawned: false, guestFull: true, full: false });
  });
});
