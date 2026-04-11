import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
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

describe("frontier combat queue regression guard", () => {
  it("returns the actual queued origin and attack alert payload from the queued frontier action helper", () => {
    const body = functionBody(serverMainSource(), "tryQueueBasicFrontierAction");
    expect(body).toContain("origin: { x: from.x, y: from.y }");
    expect(body).toContain("fromX: from.x");
    expect(body).toContain("fromY: from.y");
    expect(body).toContain("attackAlert");
  });

  it("distinguishes origin attack cooldown from target combat lock in the queued frontier action helper", () => {
    const body = functionBody(serverMainSource(), "tryQueueBasicFrontierAction");
    expect(body).toContain('code: "ATTACK_COOLDOWN"');
    expect(body).toContain('message: "origin tile is still on attack cooldown"');
    expect(body).toContain('code: "LOCKED"');
    expect(body).toContain('message: "tile locked in combat"');
  });

  it("uses queued frontier action results to send combat start and inbound attack alerts", () => {
    const body = functionBody(serverMainSource(), "executeUnifiedGameplayMessage");
    expect(body).toContain('type: "ACTION_ACCEPTED"');
    expect(body).toContain("origin: result.origin");
    expect(body).toContain("target: result.target");
    expect(body).toContain("result.attackAlert");
    expect(body).toContain('type: "ATTACK_ALERT"');
  });

  it("does not await combat worker resolution before sending the live frontier acceptance ack", () => {
    const source = serverMainSource();
    const livePathStart = source.indexOf('if ((msg.type === "EXPAND" || msg.type === "ATTACK") && actor.points < FRONTIER_ACTION_GOLD_COST)');
    const livePathEnd = source.indexOf("pending.timeout = setTimeout(async () => {", livePathStart);
    expect(livePathStart).toBeGreaterThan(-1);
    expect(livePathEnd).toBeGreaterThan(livePathStart);
    const livePath = source.slice(livePathStart, livePathEnd);
    expect(livePath).toContain('type: "ACTION_ACCEPTED"');
    expect(livePath).toContain("precomputedCombatPromise = resolveCombatViaWorker");
    expect(livePath).not.toContain("await resolveCombatViaWorker");
  });

  it("defers bulky post-combat refresh work instead of doing inline player updates after frontier results", () => {
    const source = serverMainSource();
    const helperBody = functionBody(source, "sendPostCombatFollowUps");
    expect(helperBody).toContain("queueMicrotaskFn(() => {");
    expect(helperBody).toContain("sendPlayerUpdate(actor, 0, { includeProgression: false, includeGlobalStatus: false, includeWorldStatus: false })");
    expect(helperBody).toContain("sendLocalVisionDeltaForPlayer(attackerId, changedCenters)");

    const queuedBody = functionBody(source, "tryQueueBasicFrontierAction");
    expect(queuedBody).toContain("sendPostCombatFollowUps(actor.id, changedCenters");

    const livePathStart = source.indexOf("logExpandTrace(\"combat_result_sent\", pending, { neutralTarget: false, changes: resultChanges.length });");
    const livePathEnd = source.indexOf("}, resolvesAt - now());", livePathStart);
    expect(livePathStart).toBeGreaterThan(-1);
    expect(livePathEnd).toBeGreaterThan(livePathStart);
    const liveResultPath = source.slice(livePathStart, livePathEnd);
    expect(liveResultPath).toContain("sendPostCombatFollowUps(actor.id, changedCenters");
    expect(liveResultPath).not.toContain("sendPlayerUpdate(actor, 0);");
  });
});
