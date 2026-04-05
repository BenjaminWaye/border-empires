import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientNetworkSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./client-network.ts"), "utf8");
};

describe("economy init regression guard", () => {
  it("hydrates upkeep and shared breakdown during INIT before the first PLAYER_UPDATE", () => {
    const source = clientNetworkSource();
    expect(source).toContain('state.economyBreakdown = (player.economyBreakdown as typeof state.economyBreakdown | undefined) ?? state.economyBreakdown;');
    expect(source).toContain('state.upkeepPerMinute = (player.upkeepPerMinute as typeof state.upkeepPerMinute | undefined) ?? state.upkeepPerMinute;');
    expect(source).toContain('state.upkeepLastTick = (player.upkeepLastTick as typeof state.upkeepLastTick | undefined) ?? state.upkeepLastTick;');
  });
});
