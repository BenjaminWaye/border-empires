import { validatePlaceName, type ValidatePlaceNameResult } from "@border-empires/shared";

// Server-side authority for planet christening names. The rule itself (length,
// allowed characters, blocklist) is the shared place-name policy, so planet
// and island names are held to the same standard.
export type ValidatePlanetNameResult = ValidatePlaceNameResult;

export const validatePlanetName = (raw: string): ValidatePlanetNameResult =>
  validatePlaceName(raw, { label: "planet name", minLength: 2, maxLength: 24 });
