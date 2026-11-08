// HUD/nav tab icons: simple emoji-style SVGs under public/icons/simple, so
// they read at 30px. AFC Upgrades uses a drawn AFC (cone cap, aether chamber,
// arms and docking bays) rather than the headquarters house.


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
  if (key === "domains") return "/icons/simple/afc.svg";
  if (key === "tech") return "/icons/simple/manifest.svg";
  return `/icons/simple/${key}.svg`;
};

// The button around the icon already carries the title/aria-label, so the
// image itself is decorative.
export const navTabIconHtml = (key: NavTabIconKey): string =>
  `<span class="tab-icon tab-icon-art"><img class="tab-icon-img" src="${navTabIconUrl(key)}" alt="" aria-hidden="true" draggable="false"></span>`;


