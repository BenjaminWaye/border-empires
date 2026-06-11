import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
    const source = clientSource("../client-action-flow.ts");
    expect(source).toContain('sendGameMessage({ type: "AETHER_LANCE"');
    expect(source).toContain("state.aetherLanceFxQueue.push");
  });
});
