import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";

export type OwnershipHelpKind = "last-seen-unclaimed" | "unclaimed" | "frontier" | "settled";

/**
 * A fogged tile keeps the owner it had when last in vision, so a neutral one may have been claimed since
 * (playtest 2026-11-27: "Unclaimed" land was another House's, and Expand To turned into an attack).
 */
export const LAST_SEEN_UNCLAIMED_LABEL = "Last seen unclaimed";

// `onlyWhenCurrent`: explained only on the tile it describes, not in every tile's list.
const HELP: Array<{ kind: OwnershipHelpKind; name: string; text: string; onlyWhenCurrent?: true }> = [
  { kind: "last-seen-unclaimed", name: LAST_SEEN_UNCLAIMED_LABEL, text: "In fog: it may have an owner now.", onlyWhenCurrent: true },
  { kind: "unclaimed", name: "Unclaimed", text: "Nobody owns it. Claim it to turn it into frontier." },
  { kind: "frontier", name: "Frontier", text: "Yours, but it has no real defense yet and produces nothing. Garrison it to gain defense. Plain land garrisons only inside your reach; a Relay Beacon extends it." },
  { kind: "settled", name: "Garrisoned", text: "Fully part of your empire: defended, and its town, resource or buildings work for you." }
];

/**
 * Tile-menu subtitle whose ownership label ("Your frontier", "Unclaimed", ...)
 * expands in place to explain the three ownership states, leading with (and
 * highlighting) the tapped tile's own state: a fixed order put "Unclaimed"
 * first, so tapping "Your frontier" read as being about unclaimed land.
 * Native <details>: click/keyboard toggling with no JS wiring.
 */
export const ownershipHelpSubtitleHtml = (kind: OwnershipHelpKind, ownerLabel: string, regionLabel?: string): string =>
  `<details class="tile-ownership-help"><summary>${ownerLabel}</summary>` +
  `<div class="tile-ownership-help-body">${[...HELP.filter((h) => h.kind === kind), ...HELP.filter((h) => h.kind !== kind && !h.onlyWhenCurrent)].map((h) => `<p${h.kind === kind ? ' class="is-current"' : ""}><strong>${h.name}.</strong> ${h.text}</p>`).join("")}</div></details>` +
  (regionLabel ? ` · ${regionLabel}` : "");

/**
 * Header status line that expands in place to a plain-text explainer when one
 * is given (same native <details> pattern and styling as the ownership help).
 * `statusText` is plain text (it can hold an empire name) and is escaped here,
 * like every other renderer of it; `helpText` is trusted static copy.
 */
export const statusWithHelpHtml = (statusText: string, helpText?: string): string =>
  helpText
    ? `<details class="tile-ownership-help"><summary>${escapeHtml(statusText)}</summary><div class="tile-ownership-help-body"><p>${helpText}</p></div></details>`
    : escapeHtml(statusText);
