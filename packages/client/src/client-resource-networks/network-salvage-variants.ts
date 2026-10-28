import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { salvageRib } from "./network-salvage-model.js";

/** A fallen structural crane: long broken beams, a torn sensor cage and hanging looms. */
export function buildCollapsedGantry(t:TownBuilders):void {
  t.body.tiltedBox(-0.02,0.018,-0.12,0.52,0.038,0.10,"ironDark",0.32,0.07);
  t.body.tiltedBox(-0.16,0.11,-0.14,0.09,0.24,0.08,"ironDark",0.32,-0.35);
  t.body.tiltedBox(-0.14,0.12,-0.12,0.045,0.23,0.02,"stoneLight",0.32,-0.35);
  t.body.tiltedBox(0.09,0.065,0.07,0.44,0.055,0.08,"iron",-0.42,0.18);
  for(let i=0;i<6;i++)t.body.tiltedBox(-0.22+i*0.07,0.055,-0.16+i*0.023,0.03,0.04,0.12,"brassDark",0.32,0);
  salvageRib(t,0.15,0.09,0.17);
  t.body.box(0.15,0.035,0.09,0.12,0.075,0.16,"ironDark");
  t.body.box(0.15,0.108,0.09,0.14,0.014,0.17,"plate",-0.15);
  for(let i=0;i<5;i++)t.body.box(0.10+i*0.025,0.06,0.18,0.012,0.09,0.03,"stoneDark");
  t.body.pipe(-0.17,0.23,-0.11,-0.03,0.04,0.15,0.006,"brassDark");
  t.body.pipe(-0.16,0.22,-0.10,0.05,0.017,0.23,0.005,"iron");
  for(const [x,z,turn] of [[-0.23,0.16,0.4],[0.21,-0.19,-0.7],[0.0,0.25,0.1]] as const){
    t.body.tiltedBox(x,0.018,z,0.14,0.016,0.075,"stoneLight",turn,0.16);
    t.body.box(x,0.006,z,0.11,0.012,0.05,"ironDark",turn);
  }
  t.glow.box(0.14,0.079,0.177,0.025,0.005,0.005,"aether");
}
/** A low, half-buried rotor: fractured horizontal ring and exposed radial machinery. */
export function buildShatteredRotor(t:TownBuilders):void {
  const radius=0.235;
  for(let i=0;i<16;i++){
    if(i===3||i===4||i===11)continue;
    const a=i*Math.PI*2/16,b=a+0.34;
    t.body.pipe(Math.cos(a)*radius,0.045,Math.sin(a)*radius-0.03,Math.cos(b)*radius,0.045,Math.sin(b)*radius-0.03,0.018,"ironDark");
    t.body.tiltedBox(Math.cos(a)*radius,0.062,Math.sin(a)*radius-0.03,0.075,0.025,0.05,i%3?"plate":"stoneDark",-a,0.12);
  }
  t.body.cylinder(0,0.008,-0.03,0.095,0.12,0.075,"ironDark",12);
  t.body.cylinder(0,0.083,-0.03,0.042,0.052,0.025,"brassDark",10);
  for(const a of [0.2,1.4,2.5,4.0,5.1]){
    t.body.pipe(Math.cos(a)*0.06,0.052,Math.sin(a)*0.06-0.03,Math.cos(a)*0.21,0.052,Math.sin(a)*0.21-0.03,0.012,"iron");
    t.body.box(Math.cos(a)*0.15,0.055,Math.sin(a)*0.15-0.03,0.08,0.014,0.035,"brassDark",-a+0.4);
  }
  t.body.tiltedBox(-0.20,0.07,0.18,0.14,0.12,0.13,"ironDark",0.6,-0.28);
  t.body.tiltedBox(-0.21,0.125,0.18,0.15,0.014,0.15,"stoneLight",0.6,-0.28);
  for(const [x,z,turn] of [[0.22,0.19,0.4],[-0.27,-0.18,-0.6],[0.12,-0.28,0.7]] as const)
    t.body.tiltedBox(x,0.02,z,0.13,0.018,0.07,"plate",turn,0.17);
  t.body.pipe(-0.16,0.04,0.21,-0.04,0.012,0.29,0.006,"iron");
  t.body.pipe(-0.04,0.012,0.29,0.10,0.015,0.24,0.005,"brassDark");
  t.glow.box(-0.17,0.06,0.245,0.02,0.006,0.005,"aether");
}
