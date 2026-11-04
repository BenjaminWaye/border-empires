import { describe, expect, it } from "vitest";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { afcAgreementCount, afcAlliedLevyShare, afcEnvoyIncomeShare } from "./afc-coalition.js";

const player = (id: string, upgrades: string[] = []) => ({ ...createHumanRuntimePlayer(id), afcUpgradeRuleset: "afc-v1" as const,
  domainIds: new Set(upgrades), truces: new Set<string>() });
const ally = (a: ReturnType<typeof player>, b: ReturnType<typeof player>): void => { a.allies.add(b.id); b.allies.add(a.id); };

describe("Envoy Accreditation and Allied Levies scale the House's own economy", () => {
  it("counts each partner once across mutual alliances and active truces, ignoring barbarians and one-sided pacts", () => {
    const actor = player("p"), a = player("a"), b = player("b"), oneSided = player("c");
    const peers = new Map([actor, a, b, oneSided].map(p => [p.id, p]));
    ally(actor, a);
    actor.truces.add("a"); actor.truces.add("b"); actor.truces.add("barbarian-1");
    actor.allies.add(oneSided.id);
    expect(afcAgreementCount(actor, peers)).toBe(2);
  });

  it("pays 10% per agreement for Envoy Accreditation, capped at +50%, and nothing without the upgrade", () => {
    const actor = player("p", ["afc-chancery-1"]);
    const partners = Array.from({ length: 8 }, (_, i) => player(`t${i}`));
    const peers = new Map([actor, ...partners].map(p => [p.id, p]));
    partners.slice(0, 2).forEach(p => actor.truces.add(p.id));
    expect(afcEnvoyIncomeShare(actor, peers)).toEqual({ share: expect.closeTo(0.2, 10), agreements: 2 });
    partners.forEach(p => actor.truces.add(p.id));
    expect(afcEnvoyIncomeShare(actor, peers)).toEqual({ share: 0.5, agreements: 8 });
    expect(afcEnvoyIncomeShare(player("q"), peers).share).toBe(0);
  });

  it("adds 15% manpower per mutual ally for Allied Levies, counting at most three allies", () => {
    const actor = player("p", ["afc-chancery-3"]);
    const allies = Array.from({ length: 5 }, (_, i) => player(`a${i}`));
    const peers = new Map([actor, ...allies].map(p => [p.id, p]));
    ally(actor, allies[0]!);
    expect(afcAlliedLevyShare(actor, peers).share).toBeCloseTo(0.15, 10);
    allies.forEach(a => ally(actor, a));
    expect(afcAlliedLevyShare(actor, peers)).toEqual({ share: expect.closeTo(0.45, 10), allies: 3 });
    actor.truces.add("a0");
    expect(afcAlliedLevyShare(player("q"), peers).share).toBe(0);
  });
});
