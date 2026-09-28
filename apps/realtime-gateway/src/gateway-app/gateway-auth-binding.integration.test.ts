import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import {
  closeSocket,
  firebaseJwtFor,
  nextTypedMessage,
  openSocket,
  silentLog,
  testFirebaseTokenVerifier
} from "./rewrite-stack-test-helpers.js";

describe("gateway auth binding", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("reuses persisted auth uid bindings even when resolver fallback would choose a different player id", async () => {
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({
      uid: "firebase-user-1",
      playerId: "bound-player-1",
      email: "nauticus@example.com"
    });

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore(),
      authBindingStore,
      defaultHumanPlayerId: "default-player-id",
      firebaseTokenVerifier: testFirebaseTokenVerifier
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(
      JSON.stringify({
        type: "AUTH",
        token: await firebaseJwtFor({
          sub: "firebase-user-1",
          user_id: "firebase-user-1",
          email: "nauticus@example.com",
          name: "Nauticus"
        })
      })
    );

    expect(await nextTypedMessage(socket, "bound init", "INIT")).toEqual(
      expect.objectContaining({
        player: expect.objectContaining({
          id: "bound-player-1"
        })
      })
    );
  }, 30_000);
});
