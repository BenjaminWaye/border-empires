import { afcAdditiveEffect } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

// Fort-family gates shared by the Fortify tier picker (client-structure-tier-options.ts).

/** Fortification Patterns (AFC Bastion II): a fresh Fort (bare ground or over a Palisade) is free until the grant is used. */
export const freeFortAvailable = (state: Pick<ClientState, "domainIds" | "freeFortsUsed">, variant: string, currentVariant: string | undefined): boolean =>
  variant !== "PALISADE" && (!currentVariant || currentVariant === "PALISADE") && state.freeFortsUsed < afcAdditiveEffect(state.domainIds, "freeFortCount");

/** The Titanium Forge Module: the AFC module that gates every Fort tier. */
export const FORT_MODULE_TECH_ID = "masonry";

/**
 * Fortification Patterns lets a House build Forts without researching the
 * Titanium Forge Module -- but a copy must still be installed on an active
 * AFC (the server's build gate), which the picker checks separately.
 */
export const hasFortTech = (state: Pick<ClientState, "techIds" | "domainIds">): boolean =>
  state.techIds.includes(FORT_MODULE_TECH_ID) || afcAdditiveEffect(state.domainIds, "fortTechWaiver") > 0;
