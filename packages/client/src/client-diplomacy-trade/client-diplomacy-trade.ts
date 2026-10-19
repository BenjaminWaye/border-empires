// The diplomacy trade screen: pick truce or alliance, set what you give and
// ask for (coin, Shards), see live whether an AI would accept, then send.
// Opened from "Offer Truce" on an enemy tile and from the Alliances panel.
// Self-contained like client-occupation-survey.ts: mounts on document.body,
// removes itself on close, keeps only the one open screen's state.
import { emptyDiplomacyTerms, type DiplomacyCounterRef, type DiplomacyGoods, type DiplomacyOfferKind, type DiplomacyTerms } from "@border-empires/shared";

import { diplomacyTradeStyles } from "./client-diplomacy-trade-style.js";
import { attitudeSummary, tradeVerdict, type DiplomacyStanceReply, type TradeSelection } from "./client-diplomacy-trade-view.js";

export type DiplomacyOfferCooldownView = { kind: DiplomacyOfferKind; targetPlayerId: string; until: number };

export type DiplomacyTradeDeps = {
  /** Sends a client message; false when not signed in yet. */
  send: (payload: unknown, notSignedInMessage: string) => boolean;
  ownHoldings: () => DiplomacyGoods;
};

type OpenScreen = {
  targetName: string;
  /** Set when this screen answers an offer the player received; sending replaces that offer. */
  counters: DiplomacyCounterRef | undefined;
  selection: TradeSelection;
  reply: DiplomacyStanceReply | undefined;
  overlay: HTMLElement;
  deps: DiplomacyTradeDeps;
  previousFocus: HTMLElement | undefined;
  /** The holdings last rendered, and the watch that re-renders when they change. */
  shownHoldings: DiplomacyGoods;
  holdingsWatch: ReturnType<typeof setInterval> | undefined;
};

/** How often an open screen checks the player's coin/Shards (income, spending elsewhere). */
export const TRADE_HOLDINGS_CHECK_MS = 1_000;

/**
 * Trade-screen deps from the client's own state: every truce/alliance entry
 * point (tile menu, Alliances tab) opens the screen with these, so none of
 * them sends an offer without terms and the AI's verdict.
 */
export const diplomacyTradeDepsFor = (
  state: { gold: number; strategicResources: { SHARD?: number } },
  send: DiplomacyTradeDeps["send"]
): DiplomacyTradeDeps => ({
  send,
  ownHoldings: () => ({
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

const readAmount = (input: HTMLInputElement | null): number => {
  const value = Math.floor(Number(input?.value ?? 0));
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const readTerms = (overlay: HTMLElement): DiplomacyTerms => ({
  give: { gold: readAmount(overlay.querySelector("[data-trade-give-gold]")), shard: readAmount(overlay.querySelector("[data-trade-give-shard]")) },
  ask: { gold: readAmount(overlay.querySelector("[data-trade-ask-gold]")), shard: readAmount(overlay.querySelector("[data-trade-ask-shard]")) }
});

const render = (screen: OpenScreen): void => {
  const { overlay, selection, reply, targetName } = screen;
  const own = screen.deps.ownHoldings();
  screen.shownHoldings = own;
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
  for (const button of Array.from(overlay.querySelectorAll<HTMLButtonElement>("[data-trade-kind]"))) {
    const [kind, hours] = (button.dataset.tradeKind ?? "").split(":");
    button.setAttribute("aria-pressed", String(kind === selection.kind && (kind === "alliance" || Number(hours) === selection.durationHours)));
  }
  const holdingsEl = overlay.querySelector<HTMLElement>("[data-trade-holdings]");
  if (holdingsEl) holdingsEl.textContent = `You have ${own.gold} coin and ${own.shard} Shards.`;
  const verdict = tradeVerdict({ targetName, reply, selection, own, cooldownRemainingMs: cooldownRemainingMs(screen) });
  const verdictEl = overlay.querySelector<HTMLElement>("[data-trade-verdict]");
  if (verdictEl) {
    verdictEl.dataset.tone = verdict.tone;
    verdictEl.textContent = verdict.text;
  }
  const topUp = overlay.querySelector<HTMLButtonElement>("[data-trade-topup]");
  if (topUp) {
    topUp.hidden = verdict.topUpCoin === undefined;
    topUp.textContent = verdict.topUpCoin === undefined ? "" : `Add ${verdict.topUpCoin} coin to your side`;
    topUp.dataset.amount = String(verdict.topUpCoin ?? 0);
  }
  const sendButton = overlay.querySelector<HTMLButtonElement>("[data-trade-send]");
  if (sendButton) {
    sendButton.disabled = !verdict.canSend;
    sendButton.textContent = verdict.sendLabel;
  }
};

export const closeDiplomacyTradeScreen = (): void => {
  if (!open) return;
  const { overlay, previousFocus, holdingsWatch } = open;
  open = undefined;
  if (holdingsWatch !== undefined) clearInterval(holdingsWatch);
  document.removeEventListener("keydown", onKey);
  overlay.remove();
  if (previousFocus?.isConnected) previousFocus.focus();
};

const onKey = (event: KeyboardEvent): void => {
  if (event.key === "Escape") closeDiplomacyTradeScreen();
};

const sendOffer = (screen: OpenScreen): void => {
  const terms = screen.selection.terms;
  const termsField = {
    ...(terms.give.gold + terms.give.shard + terms.ask.gold + terms.ask.shard > 0 ? { terms } : {}),
    ...(screen.counters ? { counters: screen.counters } : {})
  };
  const sent =
    screen.selection.kind === "alliance"
      ? screen.deps.send({ type: "ALLIANCE_REQUEST", targetPlayerName: screen.targetName, ...termsField }, "Finish sign-in before sending alliance requests.")
      : screen.deps.send(
          { type: "TRUCE_REQUEST", targetPlayerName: screen.targetName, durationHours: screen.selection.durationHours, ...termsField },
          "Finish sign-in before sending truce offers."
        );
  if (sent) closeDiplomacyTradeScreen();
};

export const openDiplomacyTradeScreen = (
  input: { targetName: string; kind: DiplomacyOfferKind; durationHours: 12 | 24; terms?: DiplomacyTerms; counters?: DiplomacyCounterRef },
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
  const amountInput = (attr: string, label: string, value: number): string =>
    `<input type="number" inputmode="numeric" min="0" step="1" value="${value}" ${attr} aria-label="${label}">`;
  overlay.innerHTML = `<section class="diplomacy-trade-popup" role="dialog" aria-modal="true" aria-labelledby="diplomacy-trade-title">
    <span class="diplomacy-trade-kicker">Diplomacy</span>
    <h2 id="diplomacy-trade-title">${input.counters ? `Counter ${name}'s offer` : `Deal with ${name}`}</h2>
    <p class="diplomacy-trade-stance" data-trade-stance></p>
    <ul class="diplomacy-trade-modifiers" data-trade-modifiers hidden></ul>
    <div class="diplomacy-trade-kinds" role="group" aria-label="Offer type">
      <button type="button" data-trade-kind="truce:12">Truce 12h</button>
      <button type="button" data-trade-kind="truce:24">Truce 24h</button>
      <button type="button" data-trade-kind="alliance:0">Alliance</button>
    </div>
    <div class="diplomacy-trade-grid">
      <span></span><span class="diplomacy-trade-head">Coin</span><span class="diplomacy-trade-head">Shards</span>
      <span>You give</span>${amountInput("data-trade-give-gold", "Coin you give", terms.give.gold)}${amountInput("data-trade-give-shard", "Shards you give", terms.give.shard)}
      <span>You ask</span>${amountInput("data-trade-ask-gold", "Coin you ask for", terms.ask.gold)}${amountInput("data-trade-ask-shard", "Shards you ask for", terms.ask.shard)}
    </div>
    <p class="diplomacy-trade-stance" data-trade-holdings></p>
    <p class="diplomacy-trade-verdict" data-trade-verdict aria-live="polite"></p>
    <button type="button" class="diplomacy-trade-topup" data-trade-topup hidden></button>
    <div class="diplomacy-trade-actions"><button type="button" data-trade-send></button><button type="button" data-trade-cancel>Cancel</button></div>
  </section>`;
  const screen: OpenScreen = {
    targetName,
    counters: input.counters,
    selection: { kind: input.kind, durationHours: input.durationHours, terms },
    reply: undefined,
    overlay,
    deps,
    previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
    shownHoldings: deps.ownHoldings(),
    holdingsWatch: undefined
  };
  open = screen;
  // Keep "You have", the verdict and the top-up honest as coin comes in or is spent elsewhere.
  screen.holdingsWatch = setInterval(() => {
    const own = deps.ownHoldings();
    if (own.gold !== screen.shownHoldings.gold || own.shard !== screen.shownHoldings.shard) render(screen);
  }, TRADE_HOLDINGS_CHECK_MS);
  for (const button of Array.from(overlay.querySelectorAll<HTMLButtonElement>("[data-trade-kind]"))) {
    button.addEventListener("click", () => {
      const [kind, hours] = (button.dataset.tradeKind ?? "").split(":");
      screen.selection = { ...screen.selection, kind: kind === "alliance" ? "alliance" : "truce", durationHours: hours === "24" ? 24 : 12 };
      render(screen);
    });
  }
  for (const field of Array.from(overlay.querySelectorAll<HTMLInputElement>("input"))) {
    field.addEventListener("input", () => {
      screen.selection = { ...screen.selection, terms: readTerms(overlay) };
      render(screen);
    });
  }
  overlay.querySelector<HTMLButtonElement>("[data-trade-topup]")?.addEventListener("click", (event) => {
    const amount = Number((event.currentTarget as HTMLButtonElement).dataset.amount ?? 0);
    const giveGold = overlay.querySelector<HTMLInputElement>("[data-trade-give-gold]");
    if (giveGold) giveGold.value = String(readAmount(giveGold) + amount);
    screen.selection = { ...screen.selection, terms: readTerms(overlay) };
    render(screen);
  });
  overlay.querySelector<HTMLButtonElement>("[data-trade-send]")?.addEventListener("click", () => sendOffer(screen));
  overlay.querySelector<HTMLButtonElement>("[data-trade-cancel]")?.addEventListener("click", closeDiplomacyTradeScreen);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeDiplomacyTradeScreen();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  render(screen);
  overlay.querySelector<HTMLButtonElement>("[data-trade-send]")?.focus();
  deps.send({ type: "DIPLOMACY_STANCE_REQUEST", targetPlayerName: targetName }, "Finish sign-in before making offers.");
};

/** Routes the gateway's DIPLOMACY_STANCE reply to the open screen, if it's still for that target. */
export const receiveDiplomacyStance = (reply: DiplomacyStanceReply): void => {
  if (!open || open.targetName.toLocaleLowerCase() !== reply.targetPlayerName.toLocaleLowerCase()) return;
  open.reply = reply;
  render(open);
};

/** Re-render the open screen (e.g. after offer cooldowns change). */
export const refreshDiplomacyTradeScreen = (): void => {
  if (open) render(open);
};
