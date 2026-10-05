type CatalogIdentity = {
  rootId?: string;
  branch?: string;
  manifestCategory?: "AFC_MODULE" | "CREW_OFFICE_CONSIGNMENT" | "CHARTER_WARRANT" | "DOSSIER";
  prereqIds?: string[];
};

export const techCatalogIdentityMetadata = (tech: CatalogIdentity): Record<string, unknown> => ({
  ...(tech.rootId ? { rootId: tech.rootId } : {}),
  ...(tech.branch ? { branch: tech.branch } : {}),
  ...(tech.manifestCategory ? { manifestCategory: tech.manifestCategory } : {}),
  ...(tech.prereqIds && tech.prereqIds.length > 0 ? { prereqIds: [...tech.prereqIds] } : {})
});
