import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("gateway fog capability regression guard", () => {
  it("stores the fog-admin capability on the live session and reuses it for init and player updates", () => {
    const source = sourceFor("./gateway-app.ts");

    expect(source).toContain("canToggleFog: boolean;");
    expect(source).toContain("canToggleFog: false");
    expect(source).toContain("session.canToggleFog = canToggleFogForEmail(playerIdentity.authEmail, options.fogAdminEmail);");
    expect(source).toContain("session.canToggleFog\n              );");
    expect(source).toContain("canToggleFog: session.canToggleFog");
    expect(source).toContain('for (const targetSocket of playerSubscriptions.socketsForPlayer(session.playerId))');
    expect(source).toContain('if (options?.includeFogUpdate === true) {');
    expect(source).toContain('queueOrSendSessionPayload(targetSocket, { type: "FOG_UPDATE", fogDisabled });');
    expect(source).toContain('fullVisibilityReplacementPayloadCache.get(snapshot)');
    expect(source).toContain('await refreshPlayerFogSnapshot(session.playerId, fogDisabled, {');
    expect(source).toContain('reason: "fog_toggle"');
    expect(source).toContain('queueOrSendSessionPayload(targetSocket, replacementBroadcast);');
    expect(source).toContain('const hasFogDisabledSession = [...playerSubscriptions.socketsForPlayer(playerId)].some(');
    expect(source).toContain('await refreshPlayerFogSnapshot(playerId, true, { reason: "live-delta", commandId: event.commandId });');
    expect(source).not.toContain("session.authEmail");
  });
});
