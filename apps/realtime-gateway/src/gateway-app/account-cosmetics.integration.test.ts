import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { closeSocket, nextTypedMessage, openSocket, silentLog } from "./rewrite-stack-test-helpers.js";

// Account cosmetics through the real gateway and simulation: ownership can
// only come from the admin-token route, a player can only show what the
// account owns, and every other player is told the choice.
describe("account cosmetics integration", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  it("grants by admin token only, shows the owner's choice to a rival, and sends it to a player who joins later", async () => {
    const simulation = await createSimulationService({ host: "127.0.0.1", port: 0, log: silentLog });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore(),
      profileStore: new InMemoryGatewayPlayerProfileStore(),
      defaultHumanPlayerId: "player-1",
      adminApiToken: "secret"
    });
    cleanup.push(() => gateway.close());
    const addr = await gateway.start();
    const grantUrl = `http://${addr.host}:${addr.port}/admin/cosmetics/grant`;
    const grantBody = JSON.stringify({ playerId: "player-1", cosmeticId: "flag-chevron", grantRef: "test" });
    const connect = async (playerId: string) => {
      const sock = await openSocket(addr.wsUrl);
      cleanup.push(() => closeSocket(sock.socket));
      sock.socket.send(JSON.stringify({ type: "AUTH", token: playerId }));
      const init = await nextTypedMessage(sock, `${playerId} init`, "INIT");
      return { sock, init };
    };

    const owner = await connect("player-1");
    const rival = await connect("player-2");
    expect("playerCosmetics" in owner.init).toBe(false);

    // A player cannot show a cosmetic the account does not own.
    owner.sock.socket.send(JSON.stringify({ type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-chevron" }));
    expect((await nextTypedMessage(owner.sock, "not owned", "ERROR")).code).toBe("COSMETIC_NOT_OWNED");

    // Granting needs the admin token.
    const refused = await fetch(grantUrl, { method: "POST", headers: { "content-type": "application/json" }, body: grantBody });
    expect(refused.status).toBe(401);
    const granted = await fetch(grantUrl, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer secret" }, body: grantBody });
    expect(await granted.json()).toEqual({ ok: true, newlyGranted: true, owned: ["flag-chevron"] });
    expect((await nextTypedMessage(owner.sock, "grant push", "COSMETICS_STATE")).owned).toEqual(["flag-chevron"]);

    owner.sock.socket.send(JSON.stringify({ type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-chevron" }));
    const seenByRival = await nextTypedMessage(rival.sock, "rival sees look", "PLAYER_STYLE");
    expect(seenByRival).toMatchObject({ playerId: "player-1", cosmetics: { musterFlag: "flag-chevron" } });
    expect((await nextTypedMessage(owner.sock, "own state", "COSMETICS_STATE")).selected).toEqual({ musterFlag: "flag-chevron" });

    const late = await connect("player-2"); // a fresh login
    expect(late.init.playerCosmetics).toEqual({ "player-1": { musterFlag: "flag-chevron" } });
  }, 30_000);
});
