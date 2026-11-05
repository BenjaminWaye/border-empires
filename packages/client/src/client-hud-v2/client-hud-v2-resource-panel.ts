// Which side panel a resource chip opens: Economy on that resource, or a panel of its own (Integrity). From the bar a
// second tap on the same chip closes the panel; from the phone's Treasury sheet a row only ever opens its breakdown.

import type { ClientState } from "../client-state/client-state.js";

const CHIP_FOCUS: Readonly<Record<string, ClientState["economyFocus"]>> = {
  coin: "GOLD", food: "FOOD", titanium: "TITANIUM", crystal: "CRYSTAL", umbrite: "UMBRITE"
};

/** Chips that open a panel of their own rather than Economy on a resource. */
const CHIP_PANEL: Readonly<Record<string, ClientState["activePanel"]>> = { integrity: "defensibility" };

export type ResourcePanelState = Pick<ClientState, "activePanel" | "economyFocus">;

/** Applies a chip tap to the panel state. */
export const applyResourceChip = (state: ResourcePanelState, chip: string, mode: "toggle" | "open"): void => {
  const panel: ClientState["activePanel"] = CHIP_PANEL[chip] ?? "economy";
  const focus = CHIP_FOCUS[chip];
  const alreadyOpen = mode === "toggle" && state.activePanel === panel && (!focus || state.economyFocus === focus);
  if (focus) state.economyFocus = focus;
  state.activePanel = alreadyOpen ? null : panel;
};
