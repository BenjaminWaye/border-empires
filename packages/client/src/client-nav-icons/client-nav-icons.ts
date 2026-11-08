// Flat command-console glyphs shared by desktop and compact navigation.
// All assets use the same 24px grid, amber stroke and unshaded geometry.

export type NavTabIconKey =
  | "core"
  | "missions"
  | "tech"
  | "domains"
  | "alliance"
  | "leaderboard"
  | "towns"
  | "feed"
  | "activity"
  | "settings";

// The "tech" panel is shown to players as Manifest (charters, grants, warrants,
// dossiers), so its icon is a sealed ledger rather than a tech symbol.
const navTabIconUrl = (key: NavTabIconKey): string => {
  if (key === "domains") return "/icons/nav/afc.svg";
  if (key === "tech") return "/icons/nav/manifest.svg";
  return `/icons/nav/${key}.svg`;
};

// The button around the icon already carries the title/aria-label, so the
// image itself is decorative.
export const navTabIconHtml = (key: NavTabIconKey): string =>
  `<span class="tab-icon tab-icon-art"><img class="tab-icon-img" src="${navTabIconUrl(key)}" alt="" aria-hidden="true" draggable="false"></span>`;


