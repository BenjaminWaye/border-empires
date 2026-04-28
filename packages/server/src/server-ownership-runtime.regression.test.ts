import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ownershipRuntimeSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./server-ownership-runtime.ts"), "utf8");
};

const functionBody = (source: string, functionName: string): string => {
  const start = source.indexOf(`const ${functionName} =`);
  if (start === -1) throw new Error(`Could not find function ${functionName}`);
  const arrow = source.indexOf("=>", start);
  if (arrow === -1) throw new Error(`Could not find arrow for ${functionName}`);
  const open = source.indexOf("{", arrow);
  if (open === -1) throw new Error(`Could not find opening brace for ${functionName}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`Could not find closing brace for ${functionName}`);
};

describe("server ownership runtime regression guard", () => {
  it("pushes local vision deltas and refreshes subscribed views for visibility-affected players after ownership changes", () => {
    const body = functionBody(ownershipRuntimeSource(), "updateOwnership");
    expect(body).toContain("deps.markVisibilityDirtyForPlayers(visibilityAffectedPlayers);");
    expect(body).toContain("deps.sendLocalVisionDeltaForPlayer(playerId, [{ x: tile.x, y: tile.y }]);");
    expect(body).toContain("deps.refreshSubscribedViewForPlayer(playerId);");
  });
});
