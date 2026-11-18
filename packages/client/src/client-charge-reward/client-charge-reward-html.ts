// Markup for the season-end charge reward overlay (client-charge-reward.ts).
import { houseChargeCardHtml } from "../client-house-charges/client-house-charge-cards.js";
import type { ChargeReward } from "./client-charge-reward-model.js";
import { rarityDomainLabel } from "./client-charge-reward-model.js";

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** One card slot: a sealed back that flips to the card, with its Domain chip. */
const slotHtml = (entry: ChargeReward["cards"][number], index: number): string => `
  <li class="cr-slot rarity-${entry.card.rarity.toLowerCase()}" data-cr-slot="${index}" style="--i:${index}">
    <div class="cr-flip">
      <div class="cr-face cr-back" aria-hidden="true"><span class="cr-seal">✦</span></div>
      <div class="cr-face cr-front">${houseChargeCardHtml(entry.card)}</div>
    </div>
    <span class="cr-chip" aria-hidden="true">+${entry.domain}</span>
    <span class="cr-rarity">${rarityDomainLabel(entry.card.rarity)}</span>
  </li>`;

export const chargeRewardHtml = (reward: ChargeReward): string => {
  const count = reward.cards.length;
  return `<div class="cr-backdrop" aria-hidden="true"><div class="cr-rays"></div></div>
  <div class="cr-stage">
    <header class="cr-head">
      <p class="cr-kicker">Sector Contest ${reward.seasonSequence} · House Charges</p>
      <h2 class="cr-title" id="cr-title">${count === reward.kept ? "Every charge secured" : `${plural(count, "charge")} secured`}</h2>
      <p class="cr-sub">You held ${count} of ${plural(reward.kept, "charge")} when the winner was crowned. The Court has sealed your reward.</p>
    </header>
    <ul class="cr-cards" data-count="${count}">${reward.cards.map(slotHtml).join("")}</ul>
    <section class="cr-domain" aria-live="polite">
      <span class="cr-domain-label">Domain score</span>
      <span class="cr-domain-value" data-cr-domain>…</span>
      <span class="cr-domain-gain" data-cr-gain hidden>+${reward.gained} this contest</span>
      <p class="cr-domain-note" data-cr-note hidden>Banked to your House across every Sector. It counts in the galaxy whether or not you hold a world there yet.</p>
    </section>
    <footer class="cr-actions">
      <button type="button" class="cr-collect" data-cr-collect>Collect</button>
      <button type="button" class="cr-skip" data-cr-skip hidden>Skip</button>
      <button type="button" class="cr-done" data-cr-done hidden>Continue</button>
    </footer>
  </div>`;
};
