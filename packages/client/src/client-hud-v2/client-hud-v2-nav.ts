// Crest + navigation bubbles that sit under the resource bar in the new HUD.
// Each bubble opens its screen; the crest opens your own profile.

import { navTabIconHtml } from "../client-nav-icons/client-nav-icons.js";

export type NavInput = {
  name: string;
  color: string;
  afcReady: number;
  diplomacyRequests: number;
  /** The open screen's bubble key, lit while it's open. */
  active: string | undefined;
};

type Bubble = { open: string; icon: Parameters<typeof navTabIconHtml>[0]; label: string; badge?: number };

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const navHtml = (input: NavInput): string => {
  const bubbles: Bubble[] = [
    { open: "manifest", icon: "tech", label: "Manifest" },
    { open: "afc", icon: "domains", label: "AFC", badge: input.afcReady },
    { open: "diplomacy", icon: "alliance", label: "Diplomacy", badge: input.diplomacyRequests },
    { open: "ranks", icon: "leaderboard", label: "Ranks" },
    { open: "chronicle", icon: "activity", label: "Chronicle" }
  ];
  const initial = (input.name.trim()[0] ?? "?").toUpperCase();
  const crest = `<button type="button" class="hud-v2-crest" data-hud-v2-open="self" aria-label="${esc(input.name)}, your profile" title="${esc(input.name)}"><span class="hud-v2-crest-mark" style="background:${esc(input.color)}">${esc(initial)}</span></button>`;
  const items = bubbles.map((b) => {
    const active = b.open === input.active;
    const badge = b.badge && b.badge > 0 ? `<span class="hud-v2-bubble-badge">${b.badge}</span>` : "";
    return `<button type="button" class="hud-v2-bubble${active ? " hud-v2-bubble-active" : ""}" data-hud-v2-open="${b.open}" aria-label="${b.label}" title="${b.label}">${navTabIconHtml(b.icon)}${badge}<span class="hud-v2-bubble-label">${b.label}</span></button>`;
  }).join("");
  return `${crest}<span class="hud-v2-bubbles">${items}</span>`;
};
