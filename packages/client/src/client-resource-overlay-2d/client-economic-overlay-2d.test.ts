import { describe,expect,it,vi } from "vitest";
import { drawEconomicStructureOverlay2D, type EconomicOverlay2DDeps } from "./client-economic-overlay-2d.js";
import type { Tile } from "../client-types.js";
vi.mock("../client-renderer-mode.js",()=>({isTrue3DRendererActive:()=>false}));
const image={complete:true,naturalWidth:128} as HTMLImageElement;
const tile:Tile={x:10,y:10,terrain:"LAND",resource:"NEURAL_RESIN",economicStructure:{ownerId:"p",type:"RESIN_EXTRACTOR",status:"under_construction"}};
const deps=():EconomicOverlay2DDeps=>({ctx:{} as CanvasRenderingContext2D,builtResourceOverlayForTile:()=>image,structureOverlayImages:{RESIN_EXTRACTOR:image},structureAccentColor:(_owner,fallback)=>fallback,drawCenteredOverlay:vi.fn()});
describe("resource construction overlay ownership",()=>{
  it("never paints a full building over the construction-aware resource overlay in either tile pass",()=>{
    const d=deps();
    drawEconomicStructureOverlay2D(d,tile,0,0,32,true);
    drawEconomicStructureOverlay2D(d,tile,0,0,32,false);
    expect(d.drawCenteredOverlay).not.toHaveBeenCalled();
  });
  it("continues to draw ordinary structures through their dedicated art",()=>{
    const d=deps();d.builtResourceOverlayForTile=()=>undefined;d.structureOverlayImages={AETHER_CONDENSER:image};
    drawEconomicStructureOverlay2D(d,{...tile,economicStructure:{ownerId:"p",type:"AETHER_CONDENSER",status:"active"}},0,0,32,true);
    expect(d.drawCenteredOverlay).toHaveBeenCalledOnce();
  });
});
