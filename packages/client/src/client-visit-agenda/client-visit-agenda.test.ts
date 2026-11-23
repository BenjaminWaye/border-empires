// The visit agenda (docs/visit-as-a-turn.md §2.2): a few ranked decisions, each with the place to act.
import { describe, expect, it } from "vitest";
import { AGENDA_CAP, visitAgenda, type AgendaInput, type AgendaTown } from "./client-visit-agenda.js";

const HOUR = 3_600_000;

const town = (name: string, extra: Partial<AgendaTown> = {}): AgendaTown => ({ name, x: 1, y: 2, ungarrisoned: false, unfed: false, ...extra });

const input = (extra: Partial<AgendaInput> = {}): AgendaInput => ({
  manpower: { current: 300, cap: 750, nextBatchInMs: 80 * 60_000, nextBatchAmount: 240, fullBatch: 240 },
  // Busy slots with work queued: nothing to say about them.
  slots: { busy: 3, limit: 3, queued: 2, canStart: true },
  towns: [], gold: 400, freeFoodSlots: 2, manifestCost: undefined, afcUpgradesReady: 0, ...extra
});

describe("visit agenda", () => {
  it("is empty when nothing needs a decision", () => {
    expect(visitAgenda(input())).toEqual([]);
  });

  it("flags a full pool first", () => {
    expect(visitAgenda(input({ manpower: { current: 750, cap: 750, nextBatchInMs: 80 * 60_000, nextBatchAmount: 0, fullBatch: 240 } }))).toEqual([
      { kind: "manpower_full", title: "Manpower is full", sub: "The next batch in 1h 20m adds nothing until you spend some", open: "manpower" }
    ]);
  });

  // Review of #2945: the server caps its next-batch figure at the room left, so "pool + batch > cap" never held
  // and the row could not appear. 600/750 with 240 of regen due arrives as a batch of 150.
  it("flags a batch that fills the pool with regen to spare as nearly full", () => {
    expect(visitAgenda(input({ manpower: { current: 600, cap: 750, nextBatchInMs: 2 * HOUR, nextBatchAmount: 150, fullBatch: 240 } }))).toEqual([
      { kind: "manpower_near_full", title: "Manpower is nearly full", sub: "The next batch in 2h fills it: spend some first so none is lost", open: "manpower" }
    ]);
    // The batch leaves room, exactly fits a full window, or its size is unknown: no row.
    expect(visitAgenda(input({ manpower: { current: 300, cap: 750, nextBatchInMs: HOUR, nextBatchAmount: 240, fullBatch: 240 } }))).toEqual([]);
    expect(visitAgenda(input({ manpower: { current: 510, cap: 750, nextBatchInMs: HOUR, nextBatchAmount: 240, fullBatch: 240 } }))).toEqual([]);
    expect(visitAgenda(input({ manpower: { current: 740, cap: 750, nextBatchInMs: HOUR, nextBatchAmount: undefined, fullBatch: 240 } }))).toEqual([]);
  });

  it("points one town at its tile and several at the Towns screen", () => {
    const one = visitAgenda(input({ towns: [town("Rivergate", { x: 4, y: 9, upgrade: { tier: "City", goldCost: 350 } })] }));
    expect(one).toEqual([{ kind: "town_upgrade", title: "Rivergate can become a City", sub: "350 Coin · you have 400", focus: { x: 4, y: 9 } }]);
    const many = visitAgenda(input({ towns: ["A", "B", "C", "D"].map((name) => town(name, { unfed: true })) }));
    expect(many).toEqual([{ kind: "town_unfed", title: "4 towns are unfed", sub: "A, B, C and 1 more", open: "towns" }]);
  });

  it("separates an upgrade the player can pay for from one they are saving for", () => {
    const agenda = visitAgenda(input({ towns: [town("Rivergate", { upgrade: { tier: "City", goldCost: 350 } }), town("Highmoor", { upgrade: { tier: "Great City", goldCost: 2_000 } })] }));
    expect(agenda.map((item) => [item.kind, item.title, item.sub])).toEqual([
      ["town_upgrade", "Rivergate can become a City", "350 Coin · you have 400"],
      ["town_upgrade_saving", "Highmoor is big enough to become a Great City", "Needs 2,000 Coin · you have 400"]
    ]);
  });

  // Review of #2945: the tile menu also needs a free FOOD slot; without one the agenda offered a disabled upgrade.
  it("does not offer an upgrade the tile menu would refuse for want of a FOOD slot", () => {
    const towns = [town("Rivergate", { upgrade: { tier: "City", goldCost: 350 } }), town("Highmoor", { upgrade: { tier: "Great City", goldCost: 2_000 } })];
    expect(visitAgenda(input({ towns: [towns[0] as AgendaTown], freeFoodSlots: 0 }))).toEqual([
      { kind: "town_upgrade_saving", title: "Rivergate is big enough to become a City", sub: "Needs a free FOOD slot", focus: { x: 1, y: 2 } }
    ]);
    expect(visitAgenda(input({ towns: [towns[1] as AgendaTown], freeFoodSlots: 0 }))[0]?.sub).toBe("Needs 2,000 Coin · you have 400 and a free FOOD slot");
    expect(visitAgenda(input({ towns, freeFoodSlots: 0 })).map((item) => item.title)).toEqual(["2 towns are big enough to upgrade once a FOOD slot is free"]);
  });

  it("lists an unfed town that is big enough to upgrade once, as unfed", () => {
    const agenda = visitAgenda(input({ towns: [town("Rivergate", { unfed: true, upgrade: { tier: "City", goldCost: 1 } })] }));
    expect(agenda.map((item) => item.kind)).toEqual(["town_unfed"]);
    expect(agenda[0]?.sub).toBe("It earns no Coin and does not grow until it gets FOOD");
  });

  it("lists an ungarrisoned town once, under the worse problem", () => {
    const agenda = visitAgenda(input({ towns: [town("Rivergate", { ungarrisoned: true, unfed: true, upgrade: { tier: "City", goldCost: 1 } })] }));
    expect(agenda.map((item) => item.kind)).toEqual(["town_ungarrisoned"]);
    expect(agenda[0]?.sub).toBe("It earns no Coin and does not grow until you garrison it");
  });

  it("mentions free slots only when nothing is queued behind them", () => {
    expect(visitAgenda(input({ slots: { busy: 1, limit: 3, queued: 0, canStart: true } }))).toEqual([
      { kind: "slots_idle", title: "2 of 3 development slots are free", sub: "Nothing is queued: start a build or a garrison", open: "towns" }
    ]);
    expect(visitAgenda(input({ slots: { busy: 0, limit: 3, queued: 0, canStart: true } }))[0]?.title).toBe("Your development slots are idle");
    expect(visitAgenda(input({ slots: { busy: 2, limit: 3, queued: 0, canStart: true } }))[0]?.title).toBe("1 of 3 development slots is free");
    expect(visitAgenda(input({ slots: { busy: 1, limit: 3, queued: 4, canStart: true } }))).toEqual([]);
    // Review of #2945: with no manpower for even a garrison there is nothing to start.
    expect(visitAgenda(input({ slots: { busy: 0, limit: 3, queued: 0, canStart: false } }))).toEqual([]);
  });

  it("offers a Manifest only when it is affordable, and AFC upgrades when ready", () => {
    expect(visitAgenda(input({ manifestCost: 500 }))).toEqual([]);
    expect(visitAgenda(input({ manifestCost: 400, afcUpgradesReady: 2 }))).toEqual([
      { kind: "manifest", title: "A Manifest can be commissioned", sub: "400 Coin · you have 400", open: "manifest" },
      { kind: "afc_upgrade", title: "2 AFC upgrades are ready", sub: "Choose at your landing base", open: "afc" }
    ]);
  });

  it("ranks waste and stalled towns above purchases, caps the list, and never says turn", () => {
    const agenda = visitAgenda(input({
      manpower: { current: 750, cap: 750, nextBatchInMs: HOUR, nextBatchAmount: 0, fullBatch: 240 },
      slots: { busy: 0, limit: 3, queued: 0, canStart: true },
      towns: [town("Dead", { ungarrisoned: true }), town("Hungry", { unfed: true }), town("Big", { upgrade: { tier: "City", goldCost: 100 } }), town("Bigger", { upgrade: { tier: "Great City", goldCost: 9_000 } })],
      manifestCost: 300, afcUpgradesReady: 1
    }));
    expect(agenda).toHaveLength(AGENDA_CAP);
    expect(agenda.map((item) => item.kind)).toEqual(["manpower_full", "town_ungarrisoned", "town_unfed", "town_upgrade", "manifest"]);
    expect(agenda.every((item) => item.focus !== undefined || item.open !== undefined)).toBe(true);
    expect(agenda.map((item) => `${item.title} ${item.sub}`).join(" ")).not.toMatch(/\bturns?\b/i);
  });
});
