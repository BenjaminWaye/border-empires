import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d reveal empire fx regression guard", () => {
  it("keeps the one-shot reveal beacon phases", () => {
    const source = clientSource("./client-map-3d-reveal-empire-fx.ts");
    expect(source).toContain("LOCK_END_MS");
    expect(source).toContain("BEACON_END_MS");
    expect(source).toContain("REVEAL_END_MS");
    expect(source).toContain("beaconTrail");
    expect(source).toContain("beaconCore");
    expect(source).toContain("beaconGlow");
    expect(source).toContain("haloA");
    expect(source).toContain("revealRingA");
    expect(source).toContain("MapFragment");
  });

  it("queues reveal empire fx only after the command send path accepts the cast", () => {
    const source = clientSource("../client-action-flow.ts");
    expect(source).toContain('sendGameMessage({ type: "REVEAL_EMPIRE"');
    expect(source).toContain("state.revealEmpireFxQueue.push");
  });
});
