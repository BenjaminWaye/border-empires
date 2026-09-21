/** Public, deliberately non-resource-specific environmental prospect clues. */
export type ProspectSignature = "BLACKWOOD_CANOPY" | "FERROUS_DUST" | "REFRACTIVE_GROUND";

export const prospectSignatureLabel = (signature: ProspectSignature): string => {
  if (signature === "BLACKWOOD_CANOPY") return "Blackwood canopy";
  if (signature === "FERROUS_DUST") return "Ferrous dust";
  return "Refractive ground";
};

export const prospectSignatureResource = (signature: ProspectSignature): "UMBRITE" | "TITANIUM" | "GEMS" => {
  if (signature === "BLACKWOOD_CANOPY") return "UMBRITE";
  if (signature === "FERROUS_DUST") return "TITANIUM";
  return "GEMS";
};
