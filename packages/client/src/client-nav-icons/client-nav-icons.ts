// HUD/nav tab icons: simple emoji-style SVGs under public/icons/simple, so
// they read at 30px. The Sharding tab reuses the Shard resource icon so the
// tab and the resource read as the same thing.

import { resourceSimpleIconUrl } from "../client-resource-icons/client-resource-icons.js";

export type NavTabIconKey =
  | "core"
  | "missions"
  | "tech"
  | "domains"
  | "alliance"
  | "leaderboard"
  | "feed"
  | "activity"
  | "settings";

const navTabIconUrl = (key: NavTabIconKey): string =>
  key === "domains" ? resourceSimpleIconUrl("SHARD") : `/icons/simple/${key}.svg`;

// The button around the icon already carries the title/aria-label, so the
// image itself is decorative.
export const navTabIconHtml = (key: NavTabIconKey): string =>
  `<span class="tab-icon tab-icon-art"><img class="tab-icon-img" src="${navTabIconUrl(key)}" alt="" aria-hidden="true" draggable="false"></span>`;

// The HUD re-renders tab buttons on every refresh, and some buttons have two
// writers that disagree on the badge (e.g. renderMobilePanels writes Tech
// without the upgrade dot, the HUD writes it with). Recreating the <img> on
// each write can flash it, so skip unchanged markup and, when only the badge
// after the icon differs, keep the icon element and swap just the badge.
// Keyed weakly by element, so it never outlives the button.
const lastTabButtonHtml = new WeakMap<HTMLElement, string>();
const ICON_OPEN = '<span class="tab-icon tab-icon-art">';
const ICON_CLOSE = "</span>";

export const setTabButtonHtml = (button: HTMLElement, html: string): void => {
  const previous = lastTabButtonHtml.get(button);
  if (previous === html) return;
  lastTabButtonHtml.set(button, html);
  const iconEnd = html.indexOf(ICON_CLOSE) + ICON_CLOSE.length;
  const iconHtml = html.slice(0, iconEnd);
  const iconEl = button.firstElementChild;
  if (html.startsWith(ICON_OPEN) && previous?.startsWith(iconHtml) && iconEl?.classList.contains("tab-icon-art")) {
    while (iconEl.nextSibling) iconEl.nextSibling.remove();
    iconEl.insertAdjacentHTML("afterend", html.slice(iconEnd));
    return;
  }
  button.innerHTML = html;
};
