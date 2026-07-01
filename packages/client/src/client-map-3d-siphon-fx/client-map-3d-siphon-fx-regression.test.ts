import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d siphon fx regression guard", () => {
  it("keeps the one-shot siphon drain phases and parts", () => {
    const source = clientSource("./client-map-3d-siphon-fx.ts");
    expect(source).toContain("LOCK_END_MS");
    expect(source).toContain("DRAIN_END_MS");
    expect(source).toContain("RELEASE_END_MS");
    expect(source).toContain("SiphonMote");
    expect(source).toContain("shadowPool");
    expect(source).toContain("sinkCore");
  });

  it("queues siphon fx only from the validated targeting send path", () => {
    const source = clientSource("../client-tile-action-logic/client-crystal-targeting.ts");
    expect(source).toContain('deps.ws.send(JSON.stringify({ type: "SIPHON_TILE"');
    expect(source).toContain("state.siphonFxQueue.push");
  });
});
