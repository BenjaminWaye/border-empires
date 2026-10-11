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

// The HUD re-renders tab buttons on every refresh. Rewriting innerHTML each
// time would recreate the <img> and can flash it, so only write when the
// markup changed. Keyed weakly by element, so it never outlives the button.
const lastTabButtonHtml = new WeakMap<HTMLElement, string>();

export const setTabButtonHtml = (button: HTMLElement, html: string): void => {
  if (lastTabButtonHtml.get(button) === html) return;
  lastTabButtonHtml.set(button, html);
  button.innerHTML = html;
};
