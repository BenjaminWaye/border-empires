import type { NetworkVariant } from "./network-variants.js";
type Planting = readonly (readonly [x:number,z:number,size:number])[];
export const LUXURY_GARDENS: Readonly<Record<NetworkVariant,Planting>> = {
  0:[[-0.21,0.01,0.23],[0.02,-0.16,0.27],[0.22,0.06,0.2],[-0.02,0.2,0.21]],
  1:[[-0.18,-0.10,0.31],[0.12,-0.08,0.29],[0.13,0.20,0.24],[-0.17,0.20,0.14],[0.29,0.08,0.12]],
  2:[[-0.23,-0.16,0.17],[0.00,-0.19,0.20],[0.23,-0.13,0.16],[-0.20,0.10,0.19],[0.04,0.08,0.17],[0.22,0.18,0.19],[-0.04,0.26,0.12]]
};
