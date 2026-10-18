export * from "./afc-specializations-types.js";
import { AFC_VANGUARD } from "./afc-vanguard.js";
import { AFC_BASTION } from "./afc-bastion.js";
import { AFC_DOMINION } from "./afc-dominion.js";
import { AFC_EXCHEQUER } from "./afc-exchequer.js";
import { AFC_ORACLE } from "./afc-oracle.js";
import { AFC_CHANCERY } from "./afc-chancery.js";

export const AFC_SPECIALIZATIONS = [
  ...AFC_VANGUARD,
  ...AFC_BASTION,
  ...AFC_DOMINION,
  ...AFC_EXCHEQUER,
  ...AFC_ORACLE,
  ...AFC_CHANCERY,
] as const;
