import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d reveal empire stats fx regression guard", () => {
  it("keeps the one-shot intel extraction phases", () => {
    const source = clientSource("./client-map-3d-reveal-empire-stats-fx.ts");
    expect(source).toContain("LOCK_END_MS");
    expect(source).toContain("SCAN_END_MS");
    expect(source).toContain("DOSSIER_END_MS");
    expect(source).toContain("scanComb");
    expect(source).toContain("dossierBack");
    expect(source).toContain("DataShard");
  });

  it("queues reveal stats fx only after the command send path accepts the cast", () => {
    const source = clientSource("../client-action-flow.ts");
    expect(source).toContain('sendGameMessage({ type: "REVEAL_EMPIRE_STATS"');
    expect(source).toContain("state.revealEmpireStatsFxQueue.push");
  });
});
