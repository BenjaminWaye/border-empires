// Crest + navigation bubbles that sit under the resource bar in the new HUD.
// Each bubble opens an existing panel; the crest opens your own profile.

import { navTabIconHtml } from "../client-nav-icons/client-nav-icons.js";

export type NavInput = {
  name: string;
  color: string;
  afcReady: number;
  diplomacyRequests: number;
  activePanel: string | null;
};

type Bubble = { open: string; icon: Parameters<typeof navTabIconHtml>[0]; label: string; panel?: string; badge?: number };

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const navHtml = (input: NavInput): string => {
  const bubbles: Bubble[] = [
    { open: "tech", icon: "tech", label: "Manifest", panel: "tech" },
    { open: "domains", icon: "domains", label: "AFC", panel: "domains", badge: input.afcReady },
    { open: "alliance", icon: "alliance", label: "Diplomacy", panel: "alliance", badge: input.diplomacyRequests },
    { open: "leaderboard", icon: "leaderboard", label: "Ranks", panel: "leaderboard" },
    { open: "activity", icon: "activity", label: "Chronicle" }
  ];
  const initial = (input.name.trim()[0] ?? "?").toUpperCase();
  const crest = `<button type="button" class="hud-v2-crest" data-hud-v2-open="self" aria-label="${esc(input.name)}, your profile" title="${esc(input.name)}"><span class="hud-v2-crest-mark" style="background:${esc(input.color)}">${esc(initial)}</span></button>`;
  const items = bubbles.map((b) => {
    const active = b.panel !== undefined && b.panel === input.activePanel;
    const badge = b.badge && b.badge > 0 ? `<span class="hud-v2-bubble-badge">${b.badge}</span>` : "";
    return `<button type="button" class="hud-v2-bubble${active ? " hud-v2-bubble-active" : ""}" data-hud-v2-open="${b.open}" aria-label="${b.label}" title="${b.label}">${navTabIconHtml(b.icon)}${badge}<span class="hud-v2-bubble-label">${b.label}</span></button>`;
  }).join("");
  return `${crest}<span class="hud-v2-bubbles">${items}</span>`;
};
