// Markup for the season-end charge reward overlay (client-charge-reward.ts).
// Built from the game's own pieces: the season-end screen it opens over
// (se-backdrop, se-kicker, se-title, se-medallion) and the HUD's shared
// buttons (v2s-btn); only the card flip, bursts and count-up are its own
// (client-charge-reward.css).
import { houseChargeCardHtml } from "../client-house-charges/client-house-charge-cards.js";
import type { ChargeReward } from "./client-charge-reward-model.js";
import { rarityDomainLabel } from "./client-charge-reward-model.js";

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** One card slot: a sealed back that flips to the card, with its Domain chip. */
const slotHtml = (entry: ChargeReward["cards"][number], index: number): string => `
  <li class="cr-slot rarity-${entry.card.rarity.toLowerCase()}" data-cr-slot="${index}" style="--i:${index}">
    <div class="cr-flip">
      <div class="cr-face cr-back" aria-hidden="true"><span class="cr-seal">⚙</span></div>
      <div class="cr-face cr-front">${houseChargeCardHtml(entry.card)}</div>
    </div>
    <span class="cr-chip" aria-hidden="true">+${entry.domain}</span>
    <span class="cr-rarity">${rarityDomainLabel(entry.card)}</span>
  </li>`;

export const chargeRewardHtml = (reward: ChargeReward): string => {
  const count = reward.cards.length;
  return `<div class="se-backdrop cr-backdrop" aria-hidden="true">
    <span class="se-cog se-cog-a"></span><span class="se-cog se-cog-b"></span><span class="se-cog se-cog-c"></span>
    <div class="cr-rays"></div>
  </div>
  <div class="cr-stage">
    <header class="se-header cr-head">
      <span class="se-filigree" aria-hidden="true"></span>
      <div class="se-header-text">
        <span class="se-kicker">Sector Contest ${reward.seasonSequence} · House Charges</span>
        <h2 class="se-title" id="cr-title">${count === reward.kept ? "Every charge secured" : `${plural(count, "charge")} secured`}</h2>
        <span class="se-subtitle">You held ${count} of ${plural(reward.kept, "charge")} when the winner was crowned. The Court has sealed your reward.</span>
      </div>
      <span class="se-filigree" aria-hidden="true"></span>
    </header>
    <ul class="cr-cards" data-count="${count}">${reward.cards.map(slotHtml).join("")}</ul>
    <section class="se-medallion cr-domain" aria-live="polite">
      <span class="se-victor-kicker">Domain score</span>
      <span class="se-victor-name cr-domain-value" data-cr-domain>…</span>
      <span class="se-victor-path" data-cr-gain hidden>+${reward.gained} this contest</span>
      <span class="se-victor-date cr-domain-note" data-cr-note hidden>Banked to your House across every Sector. It counts in the galaxy whether or not you hold a world there yet.</span>
    </section>
    <footer class="se-actions">
      <button type="button" class="v2s-btn v2s-btn-primary" data-cr-collect>Collect</button>
      <button type="button" class="v2s-btn v2s-btn-ghost" data-cr-skip hidden>Skip</button>
      <button type="button" class="v2s-btn v2s-btn-primary" data-cr-done hidden>Continue</button>
    </footer>
  </div>`;
};
