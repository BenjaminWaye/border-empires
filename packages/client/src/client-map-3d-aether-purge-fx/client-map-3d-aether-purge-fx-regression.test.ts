import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dispatchTileAetherAction } from "../client-afc-upgrades/client-afc-tower-action.js";
import type { ClientState } from "../client-state/client-state.js";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d aether purge fx regression guard", () => {
  it("keeps the one-shot purge phases", () => {
    const source = clientSource("./client-map-3d-aether-purge-fx.ts");
    expect(source).toContain("TARGET_LOCK_MS");
    expect(source).toContain("CHARGE_END_MS");
    expect(source).toContain("IMPACT_END_MS");
    expect(source).toContain("neutralRing");
    expect(source).toContain("afterglow");
    expect(source).toContain("mote");
  });

  it("queues purge fx only after the command send path accepts the cast", () => {
    const state: Pick<ClientState, "aetherLanceFxQueue"> = { aetherLanceFxQueue: [] };
    const target = { x: 4, y: 8 };
    dispatchTileAetherAction("aether_lance", target, state, () => false);
    expect(state.aetherLanceFxQueue).toEqual([]);
    dispatchTileAetherAction("aether_lance", target, state, (payload) => {
      expect(payload).toEqual({ type: "AETHER_LANCE", ...target });
      return true;
    });
    expect(state.aetherLanceFxQueue).toEqual([{ ...target, queuedAt: expect.any(Number) }]);
  });
});
