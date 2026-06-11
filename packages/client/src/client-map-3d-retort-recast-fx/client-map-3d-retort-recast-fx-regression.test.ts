import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d retort recast fx regression guard", () => {
  it("keeps the one-shot retort transmutation phases", () => {
    const source = clientSource("./client-map-3d-retort-recast-fx.ts");
    expect(source).toContain("CIRCLE_LOCK_MS");
    expect(source).toContain("TRANSMUTE_END_MS");
    expect(source).toContain("retortBulb");
    expect(source).toContain("resourceCore");
    expect(source).toContain("orbs");
    expect(source).toContain("RESOURCE_COLORS");
  });

  it("queues retort recast fx only after the command send path accepts the cast", () => {
    const source = clientSource("../client-action-flow.ts");
    expect(source).toContain('sendGameMessage({ type: "RETORT_RECAST"');
    expect(source).toContain("state.retortRecastFxQueue.push");
  });
});
