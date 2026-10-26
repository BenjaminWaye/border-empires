import type { StructureInfoKey } from "../client-map-display.js";
import { INFRASTRUCTURE_ICON_CROPS } from "./infrastructure-icon-crops.js";

export const INFRASTRUCTURE_REVIEW_KINDS = ["MINE", "HARBOR_EXCHANGE", "RELAY_BEACON", "OBSERVATORY", "UMBRITE_RIG"] as const satisfies readonly StructureInfoKey[];
export const INFRASTRUCTURE_ART_VERSION = "20261026-relay-polish";
export const INFRASTRUCTURE_EXPORTS: readonly { kind: StructureInfoKey; filename: string; resource?: "TITANIUM" | "GEMS" }[] = [
  { kind: "RELAY_BEACON", filename: "relay-beacon-overlay.svg" },
  { kind: "OBSERVATORY", filename: "observatory-overlay.svg" },
  { kind: "HARBOR_EXCHANGE", filename: "harbor-exchange-overlay.svg" },
  ...[1, 2, 3].map(i => ({ kind: "MINE" as const, filename: `titanium-mine-overlay-${i}.svg`, resource: "TITANIUM" as const })),
  ...[1, 2, 3, 4].map(i => ({ kind: "MINE" as const, filename: `gems-mine-overlay-${i}.svg`, resource: "GEMS" as const })),
  ...[1, 2, 3].map(i => ({ kind: "UMBRITE_RIG" as const, filename: `umbrite-rig-overlay-${i}.svg` }))
];
export const infrastructureArtUrl = (kind: string): string | undefined => {
  const entry = INFRASTRUCTURE_EXPORTS.find(entry => entry.kind === kind);
  return entry ? `/overlays/${entry.filename}?v=${INFRASTRUCTURE_ART_VERSION}` : undefined;
};
export const infrastructureMenuCrops = (): typeof INFRASTRUCTURE_ICON_CROPS => Object.fromEntries(
  Object.entries(INFRASTRUCTURE_ICON_CROPS).map(([url, crop]) => [`${url}?v=${INFRASTRUCTURE_ART_VERSION}`, crop])
);
