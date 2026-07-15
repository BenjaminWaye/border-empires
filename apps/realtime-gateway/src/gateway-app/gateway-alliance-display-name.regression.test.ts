import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { closeSocket, nextNonBootstrapMessage, nextTypedMessage, openSocket, silentLog } from "./rewrite-stack-test-helpers.js";

describe("alliance requests against the uncustomized player-1 cosmetic display name", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("resolves an alliance request targeting 'Nauticus' (the leaderboard/search-dropdown fallback name for an uncustomized player-1)", async () => {
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore(),
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const playerOne = await openSocket(gatewayAddress.wsUrl);
    const playerTwo = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(playerOne.socket));
    cleanup.push(() => closeSocket(playerTwo.socket));

    // player-1 authenticates via the raw-player-id dev token without ever
    // setting a profile name, so other players see them as "Nauticus" (the
    // cosmetic default shown on the leaderboard/alliance search dropdown for
    // an uncustomized player-1) rather than the literal id "player-1".
    playerOne.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    playerTwo.socket.send(JSON.stringify({ type: "AUTH", token: "player-2" }));

    expect(await nextNonBootstrapMessage(playerOne, "player one init")).toEqual(expect.objectContaining({ type: "INIT" }));
    expect(await nextNonBootstrapMessage(playerTwo, "player two init")).toEqual(expect.objectContaining({ type: "INIT" }));

    playerTwo.socket.send(JSON.stringify({ type: "ALLIANCE_REQUEST", targetPlayerName: "Nauticus" }));

    const allianceOutgoing = await nextTypedMessage(playerTwo, "alliance requested", "ALLIANCE_REQUESTED");
    expect(allianceOutgoing).toEqual(expect.objectContaining({ type: "ALLIANCE_REQUESTED", targetName: "Nauticus" }));
    expect(await nextTypedMessage(playerOne, "alliance incoming", "ALLIANCE_REQUEST_INCOMING")).toEqual(
      expect.objectContaining({ type: "ALLIANCE_REQUEST_INCOMING", fromName: "player-2" })
    );
  });
});
