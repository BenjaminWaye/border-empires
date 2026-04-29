import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("server startup player guard regression", () => {
  it("fails startup when probe or unbound human players exist in the hydrated snapshot", () => {
    const source = serverMainSource();
    expect(source).toContain("const stagingProbePlayers = collectStagingProbePlayerReports(players.values());");
    expect(source).toContain("const unboundHumanPlayers = collectUnboundHumanPlayerReports(players.values(), authIdentityByUid.values());");
    expect(source).toContain('runtimeIncidentLog.record("startup_player_guard_failed", {');
    expect(source).toContain('throw new Error(');
  });
});
