export type OwnershipHelpKind = "unclaimed" | "frontier" | "settled";

const HELP: Array<{ kind: OwnershipHelpKind; name: string; text: string }> = [
  { kind: "unclaimed", name: "Unclaimed", text: "Nobody owns it. Claim it to turn it into frontier." },
  { kind: "frontier", name: "Frontier", text: "Yours, but it has no real defense yet and produces nothing. Settle it to gain defense and full ownership strength." },
  { kind: "settled", name: "Settled", text: "Fully part of your empire: defended, and its town, resource or buildings work for you." }
];

/**
 * Tile-menu subtitle whose ownership label ("Your frontier", "Unclaimed", ...)
 * expands in place to explain the three ownership states, so the overview body
 * doesn't have to repeat that boilerplate on every tile. Native <details>:
 * click/keyboard toggling with no JS wiring.
 */
export const ownershipHelpSubtitleHtml = (kind: OwnershipHelpKind, ownerLabel: string, regionLabel?: string): string =>
  `<details class="tile-ownership-help"><summary>${ownerLabel}</summary>` +
  `<div class="tile-ownership-help-body">${HELP.map((h) => `<p${h.kind === kind ? ' class="is-current"' : ""}><strong>${h.name}.</strong> ${h.text}</p>`).join("")}</div></details>` +
  (regionLabel ? ` · ${regionLabel}` : "");
