// Steampunk HUD/nav tab icons (PNGs under public/icons/nav, 48/72/96 px).
// The Sharding tab reuses the Shard resource icon so the tab and the resource
// read as the same thing.

import { resourceIconUrl, type ResourceIconPx } from "../client-resource-icons/client-resource-icons.js";

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

type NavIconPx = Exclude<ResourceIconPx, 256>;

const navTabIconUrl = (key: NavTabIconKey, px: NavIconPx): string =>
  key === "domains" ? resourceIconUrl("SHARD", px) : `/icons/nav/${key}-${px}.png`;

// The button around the icon already carries the title/aria-label, so the
// image itself is decorative.
export const navTabIconHtml = (key: NavTabIconKey): string => {
  const src = (px: NavIconPx): string => navTabIconUrl(key, px);
  return `<span class="tab-icon tab-icon-art"><img class="tab-icon-img" src="${src(48)}" srcset="${src(48)} 1x, ${src(72)} 1.5x, ${src(96)} 2x" alt="" aria-hidden="true" draggable="false"></span>`;
};

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
