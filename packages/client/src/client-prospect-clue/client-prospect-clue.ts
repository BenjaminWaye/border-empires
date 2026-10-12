// One home for how the worldgen prospect clues read and look on the client:
// the tile-menu line, the 2D and true-3D map tints, and the tech panel's
// "likely nearby" signal all pull from here so they cannot drift apart.
// A clue marks land within a few tiles of a strategic-resource cluster
// (prospectSignatureAt in game-domain's server-worldgen-clusters.ts); it never
// marks the deposit tile itself.
import { prospectSignatureLabel, prospectSignatureResource, type ProspectSignature } from "@border-empires/shared";

const RESOURCE_DISPLAY: Record<ReturnType<typeof prospectSignatureResource>, string> = {
  TITANIUM: "Titanium",
  UMBRITE: "Umbrite",
  GEMS: "Crystal"
};

// Hues chosen to stay clear of the player-color palette's flat territory
// tints: rust for ferrous dust, violet for blackwood, ice-cyan for refractive.
const CLUE_COLOR: Record<ProspectSignature, string> = {
  FERROUS_DUST: "#c8743a",
  BLACKWOOD_CANOPY: "#8a5cc4",
  REFRACTIVE_GROUND: "#6fdcef"
};

export const prospectClueColor = (signature: ProspectSignature): string => CLUE_COLOR[signature];

export const prospectClueResourceLabel = (signature: ProspectSignature): string => RESOURCE_DISPLAY[prospectSignatureResource(signature)];

export const prospectClueOverviewLine = (signature: ProspectSignature | undefined): string | undefined =>
  signature
    ? `${prospectSignatureLabel(signature)}: ${prospectClueResourceLabel(signature)} deposits are likely within a few tiles.`
    : undefined;
