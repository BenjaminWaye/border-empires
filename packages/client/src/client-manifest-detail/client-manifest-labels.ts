// Player-facing naming for Manifests (the tech tree, renamed in the Manifest
// rework -- docs/manifest-full-plan.md). Internal ids/types stay "tech"; only
// display text says Manifest.
import type { TechInfo } from "../client-types.js";

export const MANIFEST_PANEL_TITLE = "Manifest";

const BRANCH_LABELS: Record<string, string> = {
  war: "War",
  economy: "Economy",
  manpower: "Manpower",
  aether: "Aether"
};

// Crew/Office/Consignment and Charter/Warrant are umbrella categories; the
// specific kind is the last word of the Manifest's own name ("Prospector
// Crew", "Trade Clearance Grant").
const NAME_TYPE_WORDS = ["Consignment", "Cadre", "Crew", "Corps", "Office", "Grant", "Charter", "Warrant", "Process"] as const;

const typeFromName = (name: string): string | undefined => {
  const words = name.split(/\s+/);
  return NAME_TYPE_WORDS.find((word) => words.includes(word));
};

export const manifestTypeLabel = (tech: Pick<TechInfo, "manifestCategory" | "name">): string => {
  switch (tech.manifestCategory) {
    case "AFC_MODULE":
      return "AFC Module";
    case "DOSSIER":
      return "Dossier";
    case "CHARTER_WARRANT":
      return typeFromName(tech.name) ?? "Charter";
    case "CREW_OFFICE_CONSIGNMENT":
      return typeFromName(tech.name) ?? "Crew";
    default:
      return "Manifest";
  }
};

export const manifestBranchLabel = (branch: string | undefined): string | undefined =>
  branch ? BRANCH_LABELS[branch] ?? branch.charAt(0).toUpperCase() + branch.slice(1) : undefined;

export const manifestKicker = (tech: Pick<TechInfo, "manifestCategory" | "name" | "branch">, tier: number): string =>
  [manifestTypeLabel(tech), manifestBranchLabel(tech.branch), `Tier ${tier}`].filter(Boolean).join(" · ");

// Descriptions read "<lore>. <mechanics>." and the mechanics half repeats
// exactly what the "What you get" list shows, so the panel keeps only the
// first sentence as flavor.
export const manifestFlavorLine = (description: string): string => {
  const match = /^(.+?[.!?])(\s|$)/.exec(description.trim());
  return match?.[1] ?? description.trim();
};
