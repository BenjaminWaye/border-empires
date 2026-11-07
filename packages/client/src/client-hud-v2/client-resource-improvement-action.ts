// Improvements tied to a resource deposit, rather than buildings that boost nearby tiles.
export const isResourceImprovementAction = (action: string): boolean => [
  "build_hydrogarden", "build_umbrite_rig", "build_mine", "build_resin_extractor",
  "build_implant_foundry", "build_catalyst_refinery", "build_cultivation_estate", "build_reclamation_works"
].includes(action);

export const resourceBuildChecked = (button: HTMLElement): boolean =>
  button.closest(".v2t-place")?.querySelector<HTMLInputElement>("[data-v2-build-all-resources]")?.checked ?? false;

/** Preserve a pending checkbox choice when costs/progress repaint the same Place control. */
export const preserveResourceBuildChoice = (host: HTMLElement | null, paint: () => void): void => {
  const button = host?.querySelector<HTMLElement>(".v2t-place [data-hud-v2-action]");
  const checked = button && resourceBuildChecked(button);
  const action = button?.dataset.hudV2Action;
  const target = button?.dataset.targetKey;
  paint();
  const next = host?.querySelector<HTMLElement>(".v2t-place [data-hud-v2-action]");
  const checkbox = next?.closest(".v2t-place")?.querySelector<HTMLInputElement>("[data-v2-build-all-resources]");
  if (checked && checkbox && next?.dataset.hudV2Action === action && next?.dataset.targetKey === target) checkbox.checked = true;
};
