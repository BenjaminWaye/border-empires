import { resourceOfferCardsHtml } from "./client-resource-offer-cards.js";
import { activeResourceDealsHtml } from "./client-active-resource-deals.js";
// The diplomacy trade screen, laid out as a deal table: your goods and the
// truce/alliance treaties on the left, theirs on the right, and only what is in
// the deal in the middle. Pressing a good opens a slider to set the amount.
// It shows live whether an AI would accept, then sends. With no treaty, giving
// an AI only coin/Shards is a gift that raises its opinion of you (the screen
// stays open and shows the new opinion).
// Opened from "Offer Truce" on an enemy tile and from the Alliances panel.
// Self-contained like client-occupation-survey.ts: mounts on document.body,
// removes itself on close, keeps only the one open screen's state.
import {
  emptyDiplomacyTerms,
  diplomacyTermsAreEmpty,
  TRUCE_MAX_LIFETIME_MS,
  truceExtensionFits,
  type DiplomacyCounterRef,
  type DiplomacyGoods,
  type DiplomacyOfferKind,
  type DiplomacyTerms
} from "@border-empires/shared";

import { socialRemainingLabel } from "../client-panel-html/client-panel-html.js";
import { diplomacyTradeStyles } from "./client-diplomacy-trade-style.js";
import {
  asTradeGoodKey,
  bindTradeGoods,
  maxTradeTerms,
  renderTradeGoods,
  theirHoldings,
  tradeGoodsHtml,
  tradeGoodsLimits,
  tradeTermsEqual,
  withTradeAmount,
  type TradeGoodKey,
  type TradeGoodSpec
} from "./client-diplomacy-trade-goods.js";
import { dealKind, dealSummaryHtml, dealVerdictOverride, type DealTreaty } from "./client-diplomacy-trade-deal.js";
import {
  attitudeSummary,
  suggestedDeal,
  tradeVerdict,
  warTally,
  type DiplomacyStanceReply,
  type TradeSelection,
  type TradeVerdict
} from "./client-diplomacy-trade-view.js";

export type DiplomacyOfferCooldownView = { kind: DiplomacyOfferKind; targetPlayerId: string; until: number };

export type DiplomacyTradeDeps = {
  /** Sends a client message; false when not signed in yet. */
  send: (payload: unknown, notSignedInMessage: string) => boolean;
  ownHoldings: () => DiplomacyGoods;
  /** When your current truce with this empire began and ends, if you have one: a truce offer then extends it. */
  runningTruce?: (targetPlayerId: string | undefined, targetName: string) => { startedAt: number; endsAt: number } | undefined;
  activeSupply?: () => { ownId: string; agreements: readonly import("@border-empires/shared").ResourceSupplyAgreementStatus[]; offers?: readonly import("@border-empires/shared").ResourceTradeOffer[] };
};

type OpenScreen = {
  targetName: string;
  /** Sent with every request when known: a display name can be shared by a human and an AI. */
  targetPlayerId: string | undefined;
  /** Set when this screen answers an offer the player received; sending replaces that offer. */
  counters: DiplomacyCounterRef | undefined;
  /** The truce or alliance in the deal, if any; selection.kind follows from it and the terms (dealKind). */
  treaty: DealTreaty;
  selection: TradeSelection;
  reply: DiplomacyStanceReply | undefined;
  /** The goods row whose slider is open, if any. */
  expanded: TradeGoodKey | undefined;
  /** Opening terms and typed amounts: the sliders always reach this far (see tradeGoodsLimits). */
  reach: DiplomacyTerms;
  overlay: HTMLElement;
  deps: DiplomacyTradeDeps;
  previousFocus: HTMLElement | undefined;
  /** The holdings last rendered, and the watch that re-renders when they change. */
  shownHoldings: DiplomacyGoods;
  shownSupplySignature: string;
  holdingsWatch: ReturnType<typeof setInterval> | undefined;
  /** A gift's outcome (or "sending…"), shown in place of the verdict until the player edits the deal. */
  notice: Pick<TradeVerdict, "tone" | "text"> | undefined;
  /** The gift this screen sent and is waiting on, with the timer that gives up waiting. */
  giftPending: { gift: DiplomacyGoods; timer: ReturnType<typeof setTimeout> } | undefined;
};

/** Longer than the gateway's 30s settlement timeout: a gift with no answer by then lost its reply (e.g. a reconnect). */
export const GIFT_RESULT_WAIT_MS = 45_000;

/** The gateway's answer to DIPLOMACY_GIFT (apps/realtime-gateway diplomacy-gift-message.ts). */
export type DiplomacyGiftResult = { ok: boolean; targetPlayerName: string; targetPlayerId?: string; message: string };

/** How often an open screen checks the player's coin/Shards (income, spending elsewhere). */
export const TRADE_HOLDINGS_CHECK_MS = 1_000;

/**
 * Trade-screen deps from the client's own state: every truce/alliance entry
 * point (tile menu, Alliances tab) opens the screen with these, so none of
 * them sends an offer without terms and the AI's verdict.
 */
export const diplomacyTradeDepsFor = (
  state: { resourceTradeOffers?: readonly import("@border-empires/shared").ResourceTradeOffer[]; me?: string; resourceTradeAgreements?: readonly import("@border-empires/shared").ResourceSupplyAgreementStatus[]; gold: number; strategicResources: { SHARD?: number }; resourceTradeHoldings?: import("@border-empires/shared").ResourceSupplyOffer | undefined; activeTruces?: ReadonlyArray<{ otherPlayerId: string; otherPlayerName: string; startedAt: number; endsAt: number }> },
  send: DiplomacyTradeDeps["send"]
): DiplomacyTradeDeps => ({
  send,
  runningTruce: (targetPlayerId, targetName) =>
    state.activeTruces?.find((t) => (targetPlayerId ? t.otherPlayerId === targetPlayerId : t.otherPlayerName.toLocaleLowerCase() === targetName.toLocaleLowerCase())),
  activeSupply: () => ({ ownId: state.me ?? "", agreements: state.resourceTradeAgreements ?? [], offers: state.resourceTradeOffers ?? [] }),
  ownHoldings: () => ({
    ...(state.resourceTradeHoldings ? { resources: state.resourceTradeHoldings } : {}),
    gold: Math.max(0, Math.floor(state.gold)),
    shard: Math.max(0, Math.floor(state.strategicResources.SHARD ?? 0))
  })
});

let open: OpenScreen | undefined;
// The player's own outgoing re-offer cooldowns, from TRUCE_UPDATE (server-bounded).
let offerCooldowns: DiplomacyOfferCooldownView[] = [];

export const setDiplomacyOfferCooldowns = (cooldowns: unknown): void => {
  if (!Array.isArray(cooldowns)) return;
  offerCooldowns = cooldowns.filter(
    (entry): entry is DiplomacyOfferCooldownView =>
      Boolean(entry) && typeof entry === "object" && typeof entry.targetPlayerId === "string" && typeof entry.until === "number" && (entry.kind === "truce" || entry.kind === "alliance")
  );
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const ensureStyles = (): void => {
  if (document.getElementById("diplomacy-trade-styles")) return;
  const style = document.createElement("style");
  style.id = "diplomacy-trade-styles";
  style.textContent = diplomacyTradeStyles;
  document.head.appendChild(style);
};

const cooldownRemainingMs = (screen: OpenScreen): number => {
  if (!screen.reply?.found) return 0;
  const targetId = screen.reply.targetPlayerId;
  const entry = offerCooldowns.find((cooldown) => cooldown.kind === screen.selection.kind && cooldown.targetPlayerId === targetId);
  return entry ? Math.max(0, entry.until - Date.now()) : 0;
};

const tilesWord = (count: number): string => (count === 1 ? "tile" : "tiles");

/** Until the stance reply says otherwise, assume an AI: the gift path is the one only an AI's reply can confirm. */
const targetIsAi = (reply: DiplomacyStanceReply | undefined): boolean => !reply?.found || reply.ai;

/** Sets the treaty and terms, deriving the offer kind from them. */
const setDeal = (screen: OpenScreen, treaty: DealTreaty, terms: DiplomacyTerms): void => {
  screen.treaty = treaty;
  screen.selection = { ...screen.selection, terms, kind: dealKind(treaty, terms, targetIsAi(screen.reply)) };
  if (!screen.giftPending) screen.notice = undefined;
};

const haveText = (own: DiplomacyGoods, theirs: DiplomacyGoods | undefined, spec: TradeGoodSpec): string => {
  const holdings = spec.side === "give" ? own : theirs;
  if (!holdings || (spec.supply && !holdings.resources)) return "";
  const amount = spec.good === "gold" ? holdings.gold : spec.good === "shard" ? holdings.shard : (holdings.resources?.[spec.good] ?? 0);
  return spec.supply ? `${amount} spare` : `${spec.side === "give" ? "You have" : "Has"} ${amount}`;
};

const render = (screen: OpenScreen): void => {
  const { overlay, selection, reply, targetName } = screen;
  const own = screen.deps.ownHoldings();
  const active = screen.deps.activeSupply?.(), agreementsEl = overlay.querySelector<HTMLElement>("[data-resource-agreements]");
  if (agreementsEl && active) agreementsEl.innerHTML = resourceOfferCardsHtml(active.offers ?? [], active.ownId, reply?.found ? reply.targetPlayerId : screen.targetPlayerId) + activeResourceDealsHtml(active.agreements, active.ownId, reply?.found ? reply.targetPlayerId : screen.targetPlayerId);
  screen.shownHoldings = own;
  screen.shownSupplySignature = JSON.stringify(active ?? null) + Math.floor(Date.now() / 60_000);
  const stanceEl = overlay.querySelector<HTMLElement>("[data-trade-stance]");
  if (stanceEl) {
    stanceEl.textContent =
      reply?.found && reply.ai && reply.stance
        ? [attitudeSummary(reply), reply.stance.reason].filter(Boolean).join(". ")
        : reply?.found && !reply.ai ? "Another player." : "";
  }
  // Civ-style breakdown of the attitude: what pleases or angers this empire.
  const modifiersEl = overlay.querySelector<HTMLElement>("[data-trade-modifiers]");
  if (modifiersEl) {
    const modifiers = reply?.found && reply.ai ? (reply.attitude?.modifiers ?? []) : [];
    modifiersEl.hidden = modifiers.length === 0;
    modifiersEl.innerHTML = modifiers
      .map((modifier) => `<li data-tone="${modifier.value >= 0 ? "good" : "bad"}"><span>${modifier.value > 0 ? "+" : ""}${modifier.value}</span> ${escapeHtml(modifier.label)}</li>`)
      .join("");
  }
  // The war as the AI counts it, so "they're losing" can be checked against the tiles.
  const warEl = overlay.querySelector<HTMLElement>("[data-trade-war]");
  if (warEl) {
    const tally = warTally(reply);
    warEl.hidden = !tally;
    warEl.innerHTML = tally
      ? `<span class="diplomacy-trade-war-head">War tally · recent captures count most</span>
        <ul><li><span>${tally.youTook}</span> ${tilesWord(tally.youTook)} you took from ${escapeHtml(targetName)}</li><li><span>${tally.theyTook}</span> ${tilesWord(tally.theyTook)} ${escapeHtml(targetName)} took from you</li></ul>`
      : "";
  }
  for (const button of Array.from(overlay.querySelectorAll<HTMLButtonElement>("[data-trade-kind]"))) {
    const [kind, hours] = (button.dataset.tradeKind ?? "").split(":");
    button.setAttribute("aria-pressed", String(kind === screen.treaty && (kind !== "truce" || Number(hours) === selection.durationHours)));
  }
  const theirs = theirHoldings(reply);
  screen.expanded = renderTradeGoods(overlay, {
    terms: selection.terms,
    limits: tradeGoodsLimits(own, reply, screen.reach),
    expanded: screen.expanded,
    haveText: (spec) => haveText(own, theirs, spec),
    hideEmptySupply: { give: true, ask: Boolean(theirs?.resources) }
  });
  const dealEl = overlay.querySelector<HTMLElement>("[data-trade-deal]");
  if (dealEl) dealEl.innerHTML = dealSummaryHtml({ selection, treaty: screen.treaty, targetName, locked: screen.counters !== undefined });
  const shared = tradeVerdict({ targetName, reply, selection, own, cooldownRemainingMs: cooldownRemainingMs(screen) });
  const verdict = dealVerdictOverride(screen.treaty, selection.kind, selection.terms, shared.sendLabel) ?? shared;
  const shown = screen.notice ?? verdict;
  const verdictEl = overlay.querySelector<HTMLElement>("[data-trade-verdict]");
  if (verdictEl) {
    verdictEl.dataset.tone = shown.tone;
    verdictEl.textContent = shown.text;
  }
  // Only an AI's prices can be read, so only an AI gets a suggestion.
  const suggest = overlay.querySelector<HTMLButtonElement>("[data-trade-suggest]");
  if (suggest) {
    const deal = suggestedDeal(reply, selection, own);
    suggest.hidden = selection.kind === "trade" || !(reply?.found && reply.ai && (selection.kind === "gift" ? reply.gift : reply.pricing));
    suggest.textContent = selection.kind === "gift" ? "Suggest gift" : "Suggest deal";
    suggest.disabled = !deal || tradeTermsEqual(deal, selection.terms);
    suggest.title = deal
      ? ""
      : selection.kind === "gift"
        ? `No gift you can afford would win ${targetName} over further right now.`
        : `No deal ${targetName} would accept for this right now.`;
  }
  const sendButton = overlay.querySelector<HTMLButtonElement>("[data-trade-send]");
  if (sendButton) {
    sendButton.disabled = !verdict.canSend || screen.giftPending !== undefined;
    sendButton.textContent = verdict.sendLabel;
  }
};

export const closeDiplomacyTradeScreen = (): void => {
  if (!open) return;
  const { overlay, previousFocus, holdingsWatch, giftPending } = open;
  open = undefined;
  if (holdingsWatch !== undefined) clearInterval(holdingsWatch);
  if (giftPending) clearTimeout(giftPending.timer);
  document.removeEventListener("keydown", onKey);
  overlay.remove();
  if (previousFocus?.isConnected) previousFocus.focus();
};

const onKey = (event: KeyboardEvent): void => {
  if (event.key === "Escape") closeDiplomacyTradeScreen();
};

const sendGift = (screen: OpenScreen): void => {
  const sent = screen.deps.send(
    {
      type: "DIPLOMACY_GIFT",
      targetPlayerName: screen.targetName,
      ...(screen.targetPlayerId ? { targetPlayerId: screen.targetPlayerId } : {}),
      // Coin and Shards only: resource supply is a standing deal, not a gift.
      gift: { gold: screen.selection.terms.give.gold, shard: screen.selection.terms.give.shard }
    },
    "Finish sign-in before offering gifts."
  );
  if (!sent) return;
  const timer = setTimeout(() => {
    if (open !== screen || !screen.giftPending) return;
    screen.giftPending = undefined;
    screen.notice = { tone: "bad", text: `No word yet on your gift to ${screen.targetName}. Check your coin before sending another.` };
    render(screen);
  }, GIFT_RESULT_WAIT_MS);
  screen.giftPending = { gift: { ...screen.selection.terms.give }, timer };
  screen.notice = { tone: "neutral", text: `Offering ${screen.targetName} your gift…` };
  render(screen);
};

const sendOffer = (screen: OpenScreen): void => {
  if (screen.selection.kind === "gift") {
    sendGift(screen);
    return;
  }
  const terms = screen.selection.terms;
  const termsField = {
    ...(screen.targetPlayerId ? { targetPlayerId: screen.targetPlayerId } : {}),
    ...(!diplomacyTermsAreEmpty(terms) ? { terms } : {}),
    ...(screen.counters ? { counters: screen.counters } : {})
  };
  const sent = screen.selection.kind === "trade"
    ? screen.deps.send({type:"RESOURCE_TRADE_REQUEST",targetPlayerName:screen.targetName,...(screen.targetPlayerId?{targetPlayerId:screen.targetPlayerId}:{}),terms},"Finish sign-in before trading resources.")
    : screen.selection.kind === "alliance"
      ? screen.deps.send({ type: "ALLIANCE_REQUEST", targetPlayerName: screen.targetName, ...termsField }, "Finish sign-in before sending alliance requests.")
      : screen.deps.send(
          { type: "TRUCE_REQUEST", targetPlayerName: screen.targetName, durationHours: screen.selection.durationHours, ...termsField },
          "Finish sign-in before sending truce offers."
        );
  if (sent) closeDiplomacyTradeScreen();
};

export const openDiplomacyTradeScreen = (
  input: { targetName: string; targetPlayerId?: string; kind: TradeSelection["kind"]; durationHours: 12 | 24; terms?: DiplomacyTerms; counters?: DiplomacyCounterRef },
  deps: DiplomacyTradeDeps
): void => {
  const targetName = input.targetName.trim();
  if (!targetName || typeof document === "undefined" || !document.body) return;
  closeDiplomacyTradeScreen();
  ensureStyles();
  const overlay = document.createElement("div");
  overlay.className = "diplomacy-trade-overlay";
  const name = escapeHtml(targetName);
  const terms = input.terms ?? emptyDiplomacyTerms();
  // A truce is already running: a truce offer extends it, up to the cap on a truce's total length. A gift works either way.
  const now = Date.now();
  const running = deps.runningTruce?.(input.targetPlayerId, targetName);
  const inTruce = running !== undefined && running.endsAt > now;
  const fits = (hours: 12 | 24): boolean => !inTruce || truceExtensionFits(running.startedAt, running.endsAt, hours, now);
  const durationHours: 12 | 24 = fits(input.durationHours) ? input.durationHours : 12;
  const requested: TradeSelection["kind"] = input.kind === "truce" && !fits(durationHours) ? "alliance" : input.kind;
  const treaty: DealTreaty = requested === "truce" || requested === "alliance" ? requested : undefined;
  const capTitle = `A truce can last at most ${TRUCE_MAX_LIFETIME_MS / 3_600_000}h in total, extensions included.`;
  const truceButton = (hours: 12 | 24): string =>
    inTruce
      ? `<button type="button" data-trade-kind="truce:${hours}"${fits(hours) ? "" : ` disabled title="${capTitle}"`}>Extend ${hours}h</button>`
      : `<button type="button" data-trade-kind="truce:${hours}">Truce ${hours}h</button>`;
  const withSupply = deps.ownHoldings().resources !== undefined;
  overlay.innerHTML = `<section class="diplomacy-trade-popup" role="dialog" aria-modal="true" aria-labelledby="diplomacy-trade-title">
    <header class="diplomacy-trade-head">
      <span class="diplomacy-trade-kicker">Diplomacy</span>
      <h2 id="diplomacy-trade-title" tabindex="-1">${input.counters ? `Counter ${name}'s offer` : `Deal with ${name}`}</h2>
      <p class="diplomacy-trade-stance" data-trade-stance></p>
      <ul class="diplomacy-trade-modifiers" data-trade-modifiers hidden></ul>
      <div class="diplomacy-trade-war" data-trade-war hidden></div>
      ${inTruce ? `<p class="diplomacy-trade-stance" data-trade-current>Truce · ${socialRemainingLabel(running.endsAt, now)} left</p>` : ""}
    </header>
    <div class="diplomacy-trade-columns">
      <section class="diplomacy-trade-side" data-trade-side="give" aria-label="Yours">
        <h3>Yours</h3>
        <h4 class="diplomacy-trade-subhead">Treaties</h4>
        <div class="diplomacy-trade-kinds" role="group" aria-label="Treaty">
          ${truceButton(12)}${truceButton(24)}
          <button type="button" data-trade-kind="alliance:0">Alliance</button>
        </div>
        <h4 class="diplomacy-trade-subhead">Goods</h4>
        ${tradeGoodsHtml("give", withSupply)}
      </section>
      <section class="diplomacy-trade-deal" aria-label="In this deal">
        <h3>In this deal</h3>
        <div class="diplomacy-trade-deal-items" data-trade-deal aria-live="polite"></div>
        <p class="diplomacy-trade-verdict" data-trade-verdict aria-live="polite"></p>
        <button type="button" class="diplomacy-trade-suggest" data-trade-suggest hidden>Suggest deal</button>
        <div class="diplomacy-trade-actions"><button type="button" data-trade-send></button><button type="button" data-trade-cancel>Cancel</button></div>
      </section>
      <section class="diplomacy-trade-side" data-trade-side="ask" aria-label="Theirs">
        <h3>${name}'s</h3>
        ${tradeGoodsHtml("ask", withSupply)}
      </section>
    </div>
    <div class="diplomacy-resource-terms" data-resource-agreements></div>
  </section>`;
  const screen: OpenScreen = {
    targetName,
    targetPlayerId: input.targetPlayerId,
    counters: input.counters,
    treaty,
    selection: { kind: dealKind(treaty, terms, true), durationHours, terms, ...(inTruce ? { extendsTruce: true } : {}) },
    reply: undefined,
    expanded: undefined,
    reach: terms,
    overlay,
    deps,
    previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
    shownHoldings: deps.ownHoldings(),
    shownSupplySignature: "",
    holdingsWatch: undefined,
    notice: undefined,
    giftPending: undefined
  };
  open = screen;
  // Keep "You have", the verdict and the top-up honest as coin comes in or is spent elsewhere.
  screen.holdingsWatch = setInterval(() => {
    const own = deps.ownHoldings();
    const supplySignature = JSON.stringify(screen.deps.activeSupply?.() ?? null) + Math.floor(Date.now() / 60_000);
    if (supplySignature !== screen.shownSupplySignature || own.gold !== screen.shownHoldings.gold || own.shard !== screen.shownHoldings.shard || JSON.stringify(own.resources) !== JSON.stringify(screen.shownHoldings.resources)) render(screen);
  }, TRADE_HOLDINGS_CHECK_MS);
  // Picking a treaty replaces the one in the deal. Pressing it again does nothing: only the deal's ✕
  // takes it out, so a double-tap never turns a paid truce into a gift.
  for (const button of Array.from(overlay.querySelectorAll<HTMLButtonElement>("[data-trade-kind]"))) {
    button.addEventListener("click", () => {
      const [kind, hours] = (button.dataset.tradeKind ?? "").split(":");
      const durationHours: 12 | 24 = hours === "24" ? 24 : 12;
      const next: DealTreaty = kind === "alliance" ? "alliance" : "truce";
      screen.selection = { ...screen.selection, durationHours: next === "truce" ? durationHours : screen.selection.durationHours };
      setDeal(screen, next, screen.selection.terms);
      render(screen);
    });
  }
  bindTradeGoods(overlay, {
    onToggle: (key) => {
      screen.expanded = screen.expanded === key ? undefined : key;
      render(screen);
    },
    onAmount: (key, amount, typed) => {
      const terms = withTradeAmount(screen.selection.terms, key, amount);
      if (typed) screen.reach = maxTradeTerms(screen.reach, terms);
      setDeal(screen, screen.treaty, terms);
      render(screen);
    }
  });
  // The middle column: ✕ takes an item out of the deal; pressing an item opens its slider.
  overlay.querySelector<HTMLElement>("[data-trade-deal]")?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-deal-remove], [data-deal-edit]") : null;
    if (!target) return;
    const remove = target.dataset.dealRemove;
    const removeKey = asTradeGoodKey(remove);
    if (remove === "treaty" && !screen.counters) setDeal(screen, undefined, screen.selection.terms);
    else if (removeKey) setDeal(screen, screen.treaty, withTradeAmount(screen.selection.terms, removeKey, 0));
    const edit = asTradeGoodKey(target.dataset.dealEdit);
    if (edit) screen.expanded = edit;
    render(screen);
    if (edit) overlay.querySelector<HTMLInputElement>(`[data-trade-${edit}]`)?.focus();
  });
  overlay.querySelector<HTMLButtonElement>("[data-trade-suggest]")?.addEventListener("click", () => {
    const deal = suggestedDeal(screen.reply, screen.selection, deps.ownHoldings());
    if (!deal) return;
    screen.reach = maxTradeTerms(screen.reach, deal);
    setDeal(screen, screen.treaty, deal);
    render(screen);
  });
  overlay.querySelector<HTMLButtonElement>("[data-trade-send]")?.addEventListener("click", () => sendOffer(screen));
  overlay.querySelector<HTMLButtonElement>("[data-trade-cancel]")?.addEventListener("click", closeDiplomacyTradeScreen);
  overlay.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-resource-end], [data-resource-offer-accept], [data-resource-offer-reject]") : null;
    if (!target) return;
    const agreementId = target.dataset.resourceEnd, accept = target.dataset.resourceOfferAccept, reject = target.dataset.resourceOfferReject;
    const payload = agreementId ? {type:"RESOURCE_TRADE_END",agreementId} : {type:accept?"RESOURCE_TRADE_ACCEPT":"RESOURCE_TRADE_REJECT",offerId:accept ?? reject};
    if (deps.send(payload,"Finish sign-in before trading resources.")) target.disabled = true;
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeDiplomacyTradeScreen();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  render(screen);
  overlay.querySelector<HTMLElement>("#diplomacy-trade-title")?.focus({ preventScroll: true });
  if (deps.ownHoldings().resources) deps.send({type:"RESOURCE_TRADE_SYNC"},"Finish sign-in before trading resources.");
  deps.send(
    { type: "DIPLOMACY_STANCE_REQUEST", targetPlayerName: targetName, ...(input.targetPlayerId ? { targetPlayerId: input.targetPlayerId } : {}) },
    "Finish sign-in before making offers."
  );
};

/** Routes the gateway's DIPLOMACY_STANCE reply to the open screen, if it's still for that target. */
export const receiveDiplomacyStance = (reply: DiplomacyStanceReply): void => {
  if (!open) return;
  const sameTarget =
    open.targetPlayerId && reply.found ? reply.targetPlayerId === open.targetPlayerId : open.targetName.toLocaleLowerCase() === reply.targetPlayerName.toLocaleLowerCase();
  if (!sameTarget) return;
  open.reply = reply;
  open.selection = { ...open.selection, kind: dealKind(open.treaty, open.selection.terms, targetIsAi(reply)) };
  render(open);
};

/** Shows a gift's outcome on the open screen, if it's still for that target; the gateway follows a paid gift with a fresh DIPLOMACY_STANCE. */
export const receiveDiplomacyGiftResult = (result: DiplomacyGiftResult): void => {
  if (!open) return;
  const sameTarget =
    open.targetPlayerId && result.targetPlayerId ? result.targetPlayerId === open.targetPlayerId : open.targetName.toLocaleLowerCase() === result.targetPlayerName.toLocaleLowerCase();
  // Only the screen that sent the gift shows its outcome (the feed always does).
  const pending = open.giftPending;
  if (!sameTarget || !pending) return;
  clearTimeout(pending.timer);
  open.giftPending = undefined;
  open.notice = { tone: result.ok ? "good" : "bad", text: result.message };
  // Clear what was given, unless the player has already set up another amount.
  const { give } = open.selection.terms;
  if (result.ok && open.selection.kind === "gift" && give.gold === pending.gift.gold && give.shard === pending.gift.shard) {
    open.selection = { ...open.selection, terms: { ...open.selection.terms, give: { gold: 0, shard: 0 } } };
  }
  render(open);
};

/** Re-render the open screen (e.g. after offer cooldowns change). */
export const refreshDiplomacyTradeScreen = (): void => {
  if (open) render(open);
};
