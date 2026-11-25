// One small text button in a minor row (the tile bar's and the town screen's). A disabled one says why on the
// button itself: the reason used to sit only in its title, a tooltip a phone never shows, so a blocked Relay
// Beacon read as greyed out for no reason (Playtest Run 5).
import type { TileActionDef } from "../client-types.js";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const minorActionButtonHtml = (a: TileActionDef, targetAttrs: string, enabledTitle: string, label = a.label): string => {
  const why = a.disabled ? a.disabledReason ?? "" : "";
  const title = a.disabled ? why || label : enabledTitle || label;
  const whyHtml = why ? `<span class="hud-v2-minor-why">${esc(why)}</span>` : "";
  return `<button type="button" class="hud-v2-minor${a.disabled ? " hud-v2-minor-off" : ""}" data-hud-v2-action="${esc(a.id)}"${targetAttrs}${a.disabled ? " disabled" : ""} title="${esc(title)}">${esc(label)}${whyHtml}</button>`;
};
