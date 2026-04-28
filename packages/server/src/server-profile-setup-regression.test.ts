import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("server profile setup regression guard", () => {
  it("forces human players back through profile setup on season rollover", () => {
    const source = serverMainSource();
    expect(source).toContain("resetHumanProfileForSeason(p);");
    expect(source).toContain("sendPlayerUpdate(p, 0);");
  });

  it("blocks unfinished human profiles from taking actions and removes them on disconnect", () => {
    const source = serverMainSource();
    expect(source).toContain('if (playerNeedsProfileSetup(actor) && msg.type !== "PING" && msg.type !== "SET_PROFILE")');
    expect(source).toContain('socket.send(JSON.stringify({ type: "ERROR", code: "PROFILE_REQUIRED", message: "finish profile setup first" }));');
    expect(source).toContain("if (playerNeedsProfileSetup(authedPlayer)) discardIncompleteHumanPlayer(authedPlayer);");
  });
});
