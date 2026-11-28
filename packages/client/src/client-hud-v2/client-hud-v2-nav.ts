// Crest + navigation bubbles that sit under the resource bar in the new HUD.
// Each bubble opens its screen; the crest opens your own profile.

import { navTabIconHtml } from "../client-nav-icons/client-nav-icons.js";
import type { CrestCosmeticId } from "@border-empires/shared";
import { CREST_HINT, navHint } from "./client-hud-v2-hints.js";
import { hudExplainAttr, type HudExplainKey } from "../client-hud-explain/client-hud-explain.js";
import { emblemFaceHtml, emblemInitial } from "../client-house-crest/client-house-crest.js";

export type NavInput = {
  name: string;
  color: string;
  /** Your House crest; your initial when unset. */
  crest?: CrestCosmeticId | undefined;
  afcReady: number;
  diplomacyRequests: number;
  /** Unread activity plus unseen release notes. */
  chronicleUnread: number;
  /** The open screen's bubble key, lit while it's open. */
  active: string | undefined;
};

type Bubble = { open: HudExplainKey; icon: Parameters<typeof navTabIconHtml>[0]; label: string; badge?: number };

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const navHtml = (input: NavInput): string => {
  const bubbles: Bubble[] = [
    { open: "manifest", icon: "tech", label: "Manifest" },
    { open: "towns", icon: "towns", label: "Towns" },
    { open: "afc", icon: "domains", label: "AFC", badge: input.afcReady },
    { open: "diplomacy", icon: "alliance", label: "Diplomacy", badge: input.diplomacyRequests },
    { open: "ranks", icon: "leaderboard", label: "Ranks" },
    { open: "chronicle", icon: "activity", label: "Chronicle", badge: input.chronicleUnread }
  ];
  const face = emblemFaceHtml(emblemInitial(input.name), input.crest);
  const crest = `<button type="button" class="hud-v2-crest${input.active === "self" ? " hud-v2-crest-active" : ""}" data-hud-v2-open="self" aria-pressed="${input.active === "self"}" aria-label="${esc(input.name)}, your profile" title="${CREST_HINT}" style="background-color:${esc(input.color)}">${face}</button>`;
  const items = bubbles.map((b) => {
    const active = b.open === input.active;
    const badge = b.badge && b.badge > 0 ? `<span class="hud-v2-bubble-badge${b.open === "chronicle" ? " hud-v2-bubble-badge-info" : ""}">${b.badge}</span>` : "";
    return `<button type="button" class="hud-v2-bubble${active ? " hud-v2-bubble-active" : ""}" data-hud-v2-open="${b.open}"${hudExplainAttr(b.open)} aria-pressed="${active}" aria-label="${b.label}" title="${navHint(b.open, b.label)}">${navTabIconHtml(b.icon)}${badge}<span class="hud-v2-bubble-label">${b.label}</span></button>`;
  }).join("");
  return `${crest}<span class="hud-v2-bubbles">${items}</span>`;
};
