import type { NaturalWonderType } from "../natural-wonder-types.js";

export type RelicResource = "TITANIUM" | "CRYSTAL" | "UMBRITE";
export type RelicDefinition = {
  readonly name: string;
  readonly installation: string;
  readonly description: string;
  readonly benefit: string;
  readonly reserve?: number;
  readonly unit?: string;
};

export const RELIC_DEFINITIONS: Readonly<Record<NaturalWonderType, RelicDefinition>> = {
  FOUNDRY_HEART: { name: "Reclamation Works", installation: "Resource recovery plant",
    description: "A surviving recovery line can supply a strategic resource already known to your House.",
    benefit: "A shortage-weighted revealed resource: +4 Titanium, +2 Crystal or +1 Umbrite capacity while garrisoned." },
  DEEPWATER_ENGINE: { name: "Antimatter Drive Works", installation: "Marine propulsion plant",
    description: "Ancient marine drives and servicing machinery improve freight and naval deployment.",
    benefit: "Dock income ×2; dock-launched attacks gain +15% strength and resolve 25% faster." },
  CONSCRIPTION_ENGINE: { name: "Ancillary Vault", installation: "Prepared ancillary reserve",
    description: "Banks of ancillary bodies await connection to a House's control.",
    benefit: "Recover 2,000 manpower on first garrison. The vault can only be emptied once.", reserve: 1, unit: "reserve" },
  WARPRESS: { name: "Combat-Suit Factory", installation: "Aether-powered combat-suit works",
    description: "A stock of serviceable combat suits and compatible parts survives beneath the ziggurat.",
    benefit: "100 attack deployments gain +50% attack strength while the factory is held and garrisoned.", reserve: 100, unit: "deployments" },
  BASTION_FRAME: { name: "Ancient Field Generator", installation: "Local defensive field array",
    description: "A finite bank of charged field cells reinforces nearby garrisons.",
    benefit: "+50% defense on garrisoned land within 3 tiles, for 30 defensive engagements.", reserve: 30, unit: "charges" },
  CALCULATING_ENGINE: { name: "Fabrication Coordinator", installation: "Industrial scheduling core",
    description: "The old core coordinates fabrication and ancillary crews across concurrent projects.",
    benefit: "+1 simultaneous Development project while garrisoned." },
  QUICKFORGE: { name: "Nanofabricator Reserve", installation: "Finite molecular fabrication stock",
    description: "Sealed assemblers and fabrication material can subsidize a handful of urgent projects.",
    benefit: "Five construction rush purchases cost up to 40 Coin less each.", reserve: 5, unit: "doses" },
  WATCHTOWER_ENGINE: { name: "Concordance Resonator", installation: "Ancient aether projection array",
    description: "A surviving projection and power core operates at a range modern towers cannot match.",
    benefit: "An Aether Tower with 50-tile casting range and no Crystal-slot demand." },
  CARTOGRAPHERS_LENS: { name: "Subsurface Survey Array", installation: "Geological resonance network",
    description: "The array locates recognizable resource signatures beneath unexplored ground.",
    benefit: "Mark already-revealed resource types within 12 tiles without revealing enemy forces or ownership." }
};

export const RELIC_RULES = {
  schemaVersion: 1,
  normalPlanetCount: 7,
  suitAttackMultiplier: 1.5,
  fieldDefenseMultiplier: 1.5,
  fieldRadius: 3,
  navalDurationMultiplier: 0.75,
  castRadius: 50,
  surveyRadius: 12,
  signalRadius: 12,
  nanoDiscount: 40
} as const;
export const RELIC_RESOURCE_CAPACITY: Readonly<Record<RelicResource, number>> = { TITANIUM: 4, CRYSTAL: 2, UMBRITE: 1 };
