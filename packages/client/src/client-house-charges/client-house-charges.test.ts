// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { HouseChargeView, HouseChargesPayload } from "@border-empires/shared";
import { houseChargeDeckCardHtml } from "./client-house-charges-deck.js";
import { formatHouseChargeWhen } from "./client-house-charges-status.js";
import { profileHtml, type ProfileInput } from "../client-hud-v2/client-hud-v2-profile.js";
import { houseChargeLetter } from "./client-house-charges-letters.js";
import { houseChargeFocusPoint, houseChargesPanelHtml } from "./client-house-charges-panel.js";
import { applyHouseChargesMessage, createInitialHouseChargesState } from "./client-house-charges-state.js";

const charge = (overrides: Partial<HouseChargeView>): HouseChargeView => ({
  id: "CHARTER:town:8,15|town:30,20",
  kind: "CHARTER",
  title: "Road of Vell and Harrowmere",
  rarity: "COMMON",
  renown: 2,
  difficultyScored: true,
  kept: true,
  held: false,
  size: 0,
  searchCircle: { x: 19, y: 17, radius: 14 },
  targets: [{ key: "town:8,15", name: "Vell", x: 8, y: 15 }, { key: "town:30,20", name: "Harrowmere", x: 30, y: 20 }],
  ...overrides
});

const relic = charge({ id: "RELIC:relic:20,25", kind: "RELIC", title: "A Concordance installation", rarity: "MYTHIC", renown: 4, targets: [], searchCircle: { x: 22, y: 24, radius: 9 } });
const desert = charge({ id: "DESERT:region:25,2", kind: "DESERT", title: "The Ashen Reach", kept: false, targets: [{ key: "region:25,2", name: "The Ashen Reach", x: 28, y: 4 }], areaTiles: 40 });

const message = (charges: HouseChargeView[], choiceClosesAt = 10_000) => ({ type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt, charges });

describe("House Charges client state", () => {
  it("applies a well-formed push and drops malformed charges", () => {
    const state = createInitialHouseChargesState();
    expect(applyHouseChargesMessage(state, message([charge({}), { id: 3 } as unknown as HouseChargeView]))).toBe(true);
    expect(state.houseCharges?.charges).toHaveLength(1);
    expect(applyHouseChargesMessage(state, { type: "HOUSE_CHARGES", charges: "nope" })).toBe(false);
    expect(state.houseCharges?.charges).toHaveLength(1);
  });

  it("clears a keep draft once the pushed list matches it", () => {
    const state = { ...createInitialHouseChargesState(), houseChargesDraftKeep: [charge({}).id, relic.id] };
    applyHouseChargesMessage(state, message([charge({}), { ...relic, kept: true }, desert]));
    expect(state.houseChargesDraftKeep).toBeUndefined();
  });
});

describe("House Charges panel", () => {
  const panelState = (charges: HouseChargeView[], choiceClosesAt = 10_000, draft?: string[]) => ({
    activePanel: "charges" as const,
    houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 1_000, choiceClosesAt, charges },
    houseChargesDraftKeep: draft
  });

  it("explains the wait before charges are dealt", () => {
    expect(houseChargesPanelHtml({ activePanel: "charges", houseCharges: undefined, houseChargesDraftKeep: undefined }, 0)).toContain("arrive once your AFC has landed");
  });

  it("offers the keep choice while the window is open, and only enables saving a changed choice of two", () => {
    const charges = [charge({}), { ...relic, kept: true }, desert];
    const open = houseChargesPanelHtml(panelState(charges), 5_000);
    // Nothing to save (possibly the default pair): say what is kept and how to swap, with no false "saved" tick.
    expect(open).toContain("Keeping 2 of 3. You can swap until");
    // The swap instructions live in How charges work, not above the cards.
    expect(open).toContain("to swap, tap Kept on one card to set it aside, then Tap to keep on another");
    // Owner 2026-11-20: nothing above the cards; the kept count and swap window sit in the hidden help.
    const beforeCards = open.slice(0, open.indexOf("hcd-deck"));
    expect(beforeCards.replace(/<div class="house-charges-more"[\s\S]*?<\/div>/, "")).not.toMatch(/<p|house-charges-choice/);
    expect(open).toMatch(/data-house-charges-more hidden>/);
    expect(open).not.toContain("✓");
    expect(open).not.toContain("data-house-charges-save");
    const changed = houseChargesPanelHtml(panelState(charges, 10_000, [charge({}).id, desert.id]), 5_000);
    expect(changed).not.toMatch(/data-house-charges-save disabled/);
    const closed = houseChargesPanelHtml(panelState(charges), 20_000);
    expect(closed).not.toContain("data-house-charge-pick");
    expect(closed).toContain("Not kept");
  });

  it("follows the draft while choosing: a newly kept charge is undimmed and marked, and the hint explains the button", () => {
    const charges = [charge({}), { ...relic, kept: true }, desert];
    const swapped = houseChargesPanelHtml(panelState(charges, 10_000, [relic.id, desert.id]), 5_000);
    const desertCard = swapped.slice(swapped.lastIndexOf("<article", swapped.indexOf("The Ashen Reach")), swapped.indexOf("The Ashen Reach"));
    expect(desertCard).toContain("is-kept");
    expect(desertCard).not.toContain("is-unkept");
    expect(swapped).toContain("Will be kept");
    expect(swapped).toContain("Will be dropped");
    expect(swapped).toContain("Press Keep these 2 to confirm your new choice.");

    const one = houseChargesPanelHtml(panelState(charges, 10_000, [relic.id]), 5_000);
    expect(one).toContain("Tap 1 more card to keep 2.");
    expect(one).toMatch(/data-house-charges-save disabled/);
  });

  it("shows held charges and an undiscovered relic without naming its place", () => {
    const html = houseChargesPanelHtml(panelState([charge({ held: true, size: 28, completeSince: 2_000 }), { ...relic, kept: true }], 0), 5_000);
    expect(html).toContain("Road complete: 28 tiles");
    expect(html).toContain("Beacon not found yet");
    expect(html).toContain("Find the Concordance installation");
  });

  it("shows the difficulty pips as difficulty and says what a held charge earns", () => {
    const html = houseChargesPanelHtml(panelState([charge({ renown: 3 })], 0), 5_000);
    expect(html).toContain('aria-label="Difficulty 3 of 4"');
    expect(html).not.toContain("Renown");
    expect(html).toContain("Hold your kept charges when the winner is crowned to bank Domain score.");
    expect(html).not.toContain("house-charges-intro");
  });

  // Owner 2026-11-19: the reward goes behind an underlined read-more, and each card says what it banks.
  it("explains the payout behind How charges work, and puts each card's Domain score on the card", () => {
    const html = houseChargesPanelHtml(panelState([charge({}), { ...relic, kept: true }], 0), 5_000);
    expect(html).toContain('id="house-charges-help"');
    expect(html).toContain("banks Domain score by difficulty: +1 for each ◆, so +1 to +4.");
    expect(html).toContain("Harder charges are rarer and pay more.");
    expect(html).not.toContain("Influence");
    expect(html).toContain("✦ Common · +2 Domain");
    expect(html).toContain("✦ Mythic · +4 Domain");
  });

  // Review of #2897: a charge dealt before difficulty scoring still shows the pay it was dealt with.
  it("shows the stored-rarity Domain on a charge dealt before difficulty scoring", () => {
    const { difficultyScored: _scored, ...legacy } = charge({ rarity: "RARE", renown: 3 });
    expect(houseChargesPanelHtml(panelState([legacy], 0), 5_000)).toContain("✦ Rare · +2 Domain");
  });

  // Review of #2878: a set-aside or dropped card banks nothing, so it must not show a Domain score.
  it("shows the Domain score only on kept cards", () => {
    const closed = houseChargesPanelHtml(panelState([charge({}), desert], 0), 5_000);
    expect(closed).toContain("✦ Common · +2 Domain");
    const desertCard = closed.slice(closed.lastIndexOf("<article", closed.indexOf("The Ashen Reach")));
    expect(desertCard).toContain("Not kept");
    expect(desertCard).not.toContain("Domain");
    const choosing = houseChargesPanelHtml(panelState([charge({}), { ...relic, kept: true }, desert], 10_000, [charge({}).id, desert.id]), 5_000);
    const relicCard = choosing.slice(choosing.lastIndexOf("<article", choosing.indexOf("A Concordance installation")), choosing.indexOf("The Ashen Reach"));
    expect(relicCard).toContain("✦ Mythic</span>");
    expect(relicCard).not.toContain("+4 Domain");
  });

  // Owner 2026-11-19: one card per charge with its description on it, not a card row plus a separate list.
  it("puts each charge's objective, House reason, progress and buttons on its own card", () => {
    const charges = [charge({}), { ...relic, kept: true }, desert];
    const html = houseChargesPanelHtml(panelState(charges), 5_000);
    document.body.innerHTML = html;
    const cards = document.querySelectorAll(".hcd-card");
    expect(cards).toHaveLength(3);
    expect(document.querySelectorAll(".house-charge-card, .hcp-table")).toHaveLength(0);
    const road = cards[0]!;
    expect(road.querySelector(".hc-name")?.textContent).toBe("Road of Vell and Harrowmere");
    expect(road.querySelector(".hcd-objective")?.textContent).toContain("Join Vell and Harrowmere");
    expect(road.querySelector(".hc-flavour")?.textContent).toBe(`“${houseChargeLetter(charges[0]!)}”`);
    expect(road.querySelector(".hcd-progress")?.textContent).toBe("No unbroken road yet");
    expect(road.querySelector("[data-house-charge-pick]")?.textContent).toBe("✦ Kept");
    expect(road.querySelector("[data-house-charge-jump]")?.textContent).toBe("Show on map");
    expect(cards[2]!.querySelector("[data-house-charge-pick]")?.textContent).toBe("Tap to keep");
  });

  it("gives a rough bearing to a Charter town that has not been scouted yet", () => {
    const tiles = new Map([["8,15", { x: 8, y: 15, terrain: "LAND" as const }]]);
    const html = houseChargesPanelHtml({ ...panelState([charge({})], 0), tiles }, 5_000);
    expect(html).toContain("Harrowmere: not scouted yet, about 25 tiles east of Vell.");
    const both = new Map([...tiles, ["30,20", { x: 30, y: 20, terrain: "LAND" as const }]]);
    expect(houseChargesPanelHtml({ ...panelState([charge({})], 0), tiles: both }, 5_000)).not.toContain("not scouted yet");
    // Unkept charges get the bearing too: that is when the player is choosing which to keep.
    expect(houseChargesPanelHtml({ ...panelState([charge({ kept: false })], 0), tiles }, 5_000)).toContain("not scouted yet");
  });

  it("turns Show on map into Hide on map for the highlighted charge", () => {
    const html = houseChargesPanelHtml({ ...panelState([charge({}), { ...relic, kept: true }], 0), houseChargeFocusId: relic.id }, 5_000);
    expect(html).toContain('aria-pressed="true">Hide on map');
    expect(html).toContain('aria-pressed="false">Show on map');
  });

  it("points Show on map at the target once known, otherwise at the search circle", () => {
    expect(houseChargeFocusPoint(charge({}))).toEqual(expect.objectContaining({ x: 8, y: 15 }));
    expect(houseChargeFocusPoint(relic)).toEqual({ x: 22, y: 24, radius: 9 });
  });

  it("never centres Show on map on an unscouted Charter town: the seen town, else between its rough circles", () => {
    const road = charge({ targets: [{ key: "town:30,20", name: "Harrowmere", x: 30, y: 20 }, { key: "town:8,15", name: "Vell", x: 8, y: 15 }] });
    expect(houseChargeFocusPoint(road, (x, y) => x === 8 && y === 15)).toMatchObject({ x: 8, y: 15 });
    const unscouted = houseChargeFocusPoint(road, () => false);
    expect(unscouted).not.toEqual({ x: 30, y: 20 });
    expect(unscouted).not.toEqual({ x: 8, y: 15 });
    expect(Math.abs(unscouted.x - 19) + Math.abs(unscouted.y - 17)).toBeLessThanOrEqual(12);
  });

});

describe("House Charges in the profile", () => {
  const profile = (overrides: Partial<ProfileInput>): string =>
    profileHtml({
      id: "p1",
      name: "House Alden",
      color: "#b23a34",
      relation: { kind: "self" },
      entry: undefined,
      career: undefined,
      holdings: undefined,
      pacts: undefined,
      truceBreaks: undefined,
      nameOf: () => undefined,
      nowMs: 5_000,
      ...overrides
    });

  it("lists your kept charges with a Manage button on your own profile", () => {
    const html = profile({ houseCharges: { type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt: 10_000, charges: [charge({ held: true }), { ...relic, kept: true }, desert] } });
    expect(html).toContain("House Charges");
    expect(html).toContain("Road of Vell and Harrowmere");
    expect(html).toContain("A Concordance installation");
    expect(html).not.toContain("The Ashen Reach");
    expect(html).toContain("data-v2-open-charges");
    expect(html).toContain("You can still change which 2 you keep.");
  });

  // Playtest 2026-11-18: Manage charges sat at the bottom of a long profile, below the season stats.
  it("puts Manage charges above the season stats", () => {
    const html = profile({ houseCharges: { type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt: 10_000, charges: [charge({ held: true }), desert] } });
    expect(html.indexOf("data-v2-open-charges")).toBeGreaterThan(-1);
    expect(html.indexOf("data-v2-open-charges")).toBeLessThan(html.indexOf("This Sector Contest"));
  });

  // UX review: "You can still change which 0 you keep" when no keep was recorded yet.
  it("never says 'which 0' while the choice is open with nothing kept", () => {
    const html = profile({ houseCharges: { type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt: 10_000, charges: [desert, { ...desert, id: "x" }, { ...desert, id: "y" }].map((c) => ({ ...c, kept: false })) } });
    expect(html).not.toContain("which 0");
    expect(html).toContain("You can still change which 2 you keep.");
    expect(html).toContain("None kept yet");
  });

  // Playtest 2026-11-25: the road charge's card read "Held since 21:29" while the profile row read "Not held"
  // (and, once held, only "Held"). The row now uses the card's own status, from the same pushed charge.
  it("shows a kept charge's held state exactly as its Charges card does, after the push that completes it", () => {
    const state = createInitialHouseChargesState();
    applyHouseChargesMessage(state, message([charge({})], 0));
    expect(profile({ houseCharges: state.houseCharges ?? null })).toContain("<dd>Not held</dd>");
    applyHouseChargesMessage(state, message([charge({ held: true, completeSince: 9_000, size: 15 })], 0));
    const held = state.houseCharges!.charges[0]!;
    const cardStatus = /<p class="hcd-status is-held">([^<]+)<\/p>/.exec(houseChargeDeckCardHtml(held, { choosing: false, ticked: true, focused: false, scoutHint: undefined, formatWhen: formatHouseChargeWhen }))?.[1];
    expect(cardStatus).toBe(`Held since ${formatHouseChargeWhen(9_000)}`);
    const html = profile({ houseCharges: state.houseCharges ?? null });
    expect(html).toContain(`<dd>${cardStatus}</dd>`);
    expect(html).not.toContain("Not held");
  });

  it("says when a kept charge was lost, as its card does", () => {
    const html = profile({ houseCharges: message([charge({ lostAt: 9_500 })], 0) as HouseChargesPayload });
    expect(html).toContain(`<dd>Lost ${formatHouseChargeWhen(9_500)}</dd>`);
  });

  it("explains the wait on your own profile before charges are dealt", () => {
    expect(profile({ houseCharges: null })).toContain("arrive once your AFC has landed");
  });

  it("never shows a section on another player's profile", () => {
    const html = profile({ id: "p2", relation: { kind: "none" } });
    expect(html).not.toContain("House Charges");
    expect(html).not.toContain("data-v2-open-charges");
  });
});
