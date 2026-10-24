import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function createDepot() {
  const g = new THREE.Group();
  const drumR = 1.25, drumH = 1.6, drumT = 0.12;
  const podCount = 12, podOff = drumR + 0.18;
  const pw = 0.36, pd = 0.42, ph = 1.9, pin = 0.08;
  const bh = 0.08, as = 0.035;

  const iron = new THREE.MeshStandardMaterial({ color: 0x0f1113, roughness: 0.9, metalness: 0.08 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xbfa46a, roughness: 0.8, metalness: 0.12 });
  const aeth = new THREE.MeshStandardMaterial({ color: 0x3df9ff, emissive: 0x3df9ff, emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.05 });

  const outer = new THREE.CylinderGeometry(drumR, drumR, drumH, 8, 1, true);
  const inner = new THREE.CylinderGeometry(drumR - drumT, drumR - drumT, drumH + 0.01, 8, 1, true);
  const om = new THREE.Mesh(outer, iron), im = new THREE.Mesh(inner, iron);
  im.scale.set(-1,1,1);
  const dh = new THREE.Group(); dh.add(om,im); dh.position.y = drumH/2; g.add(dh);

  const bt = new THREE.Mesh(new THREE.RingGeometry(drumR-0.01, drumR+0.02, 16), brass);
  bt.rotation.x=-Math.PI/2; bt.position.y = drumH - bh/2; g.add(bt);
  const bb = new THREE.Mesh(new THREE.RingGeometry(drumR-0.01, drumR+0.02, 16), brass);
  bb.rotation.x=-Math.PI/2; bb.position.y = bh/2; g.add(bb);

  for (let i=0;i<podCount;i++) {
    const ang=(i/podCount)*Math.PI*2, px=Math.cos(ang)*podOff, pz=Math.sin(ang)*podOff;
    const geo=new THREE.BoxGeometry(pw,ph,pd);
    const pa=geo.attributes.position,a=pa.array;
    for (let v=0;v<pa.count;v++) {
      const z=a[v*3+2], y=a[v*3+1];
      if (z>pd/2-0.001) {
        let ins=pin;
        if (y>ph*0.28) ins=pin*1.15;
        if (y<-ph*0.25) ins=pin*0.45;
        a[v*3]=a[v*3]*(1-ins*0.35);
        a[v*3+2]=pd/2-ins*0.85;
      }
    }
    pa.needsUpdate=true; geo.computeVertexNormals();
    const pm=new THREE.Mesh(geo,iron); pm.position.set(px,ph/2,pz); pm.rotation.y=-ang+Math.PI/2; g.add(pm);
    const col=new THREE.Mesh(new THREE.BoxGeometry(pw+0.05,bh,pd+0.05),brass);
    col.position.set(px,ph+bh/2,pz); col.rotation.y=pm.rotation.y; g.add(col);
    const lg=new THREE.SphereGeometry(as,6,4);
    const l1=new THREE.Mesh(lg,aeth); l1.position.set(px,0.22,pz); l1.rotation.y=pm.rotation.y; l1.translateZ(-pd*0.25); g.add(l1);
    const l2=new THREE.Mesh(lg,aeth); l2.position.set(px,0.95,pz); l2.rotation.y=pm.rotation.y; l2.translateZ(-pd*0.25); g.add(l2);
  }
  g.position.y=0; return g;
}

let r:THREE.WebGLRenderer,s:THREE.Scene,c:any,ctrl:any,m:any,id:any;
function setup(canvas:HTMLCanvasElement,mode:'o'|'t'|'s'|'w') {
  if (r) r.dispose();
  r=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  r.setPixelRatio(Math.min(devicePixelRatio,2)); r.toneMapping=THREE.ACESFilmicToneMapping; r.toneMappingExposure=1.05; r.outputColorSpace=THREE.SRGBColorSpace;
  s=new THREE.Scene(); const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;
  if (mode==='t') {
    const sz=3.2,asp=w/h;
    c=new THREE.OrthographicCamera(-sz*asp,sz*asp,sz,-sz,0.01,50);
    c.position.set(0,6,0); c.lookAt(0,0,0);
  } else {
    c=new THREE.PerspectiveCamera(42,w/h,0.1,60);
    c.position.set(4.6,2.9,4.6);
  }
  s.add(new THREE.HemisphereLight(0xc9ddff,0x080a0c,2.0));
  const k=new THREE.DirectionalLight(0xffffff,1.0); k.position.set(5,6,4); k.target.position.set(0,0,0); s.add(k); s.add(k.target);
  s.add(new THREE.DirectionalLight(0x9dbbff,0.2)).position.set(-4,2,-5);
  s.add(new THREE.PointLight(0x3df9ff,0.06,6)).position.set(0,1.2,0);
  if (ctrl) { ctrl.dispose(); ctrl=null; }
  if (mode!=='t') { ctrl=new OrbitControls(c as any,r.domElement); ctrl.target.set(0,0.8,0); ctrl.minDistance=3.0; ctrl.maxDistance=6.0; ctrl.enableDamping=true; ctrl.dampingFactor=0.08; ctrl.update(); }
  if (m) { s.remove(m); (m as any).traverse((o:any)=>{ if(o.isMesh){o.geometry?.dispose(); if(Array.isArray(o.material))o.material.forEach((x:any)=>x.dispose()); else o.material?.dispose(); } }); m=null; }
  m=createDepot();
  if (mode==='s') m.traverse((o:any)=>{ if(o.isMesh){ o.material=new THREE.MeshBasicMaterial({color:0xffffff}); } });
  if (mode==='w') m.traverse((o:any)=>{ if(o.isMesh){ const base=(Array.isArray(o.material)?o.material[0]:o.material) as any; o.material=new THREE.MeshBasicMaterial({color:base?.color??0xbfa46a,wireframe:true}); } });
  s.add(m);
  r.setSize(w,h,false); c.updateProjectionMatrix();
}
function anim(){ id=requestAnimationFrame(anim); if(ctrl) ctrl.update(); r.render(s,c); }
function mount(canvas:HTMLCanvasElement,mode:any){ if(id!==null) cancelAnimationFrame(id); setup(canvas,mode); anim(); const onR=()=>{const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight; r.setSize(w,h,false); if(c instanceof THREE.PerspectiveCamera) c.aspect=w/h; else { const sz=3.2,asp=w/h;(c as any).left=-sz*asp;(c as any).right=sz*asp;(c as any).top=sz;(c as any).bottom=-sz;} c.updateProjectionMatrix();}; window.addEventListener('resize',onR); canvas.addEventListener('dispose',()=>{window.removeEventListener('resize',onR); if(id!==null) cancelAnimationFrame(id);}); }
const render=(mode:any)=>(args:any)=>{ const c=document.createElement('canvas'); c.style.width='100vw'; c.style.height='100vh'; c.style.display='block'; args.canvas?.appendChild(c); mount(c,mode); return c; };
export default { title: 'Border Empires/Ancillary Depot/3D' };
export const Orbit = { render: render('o'), name: '3D — Orbit' };
export const TopDown = { render: render('t'), name: 'Top-Down (Exact Match)' };
export const Silhouette = { render: render('s'), name: 'Silhouette' };
export const Wireframe = { render: render('w'), name: 'Wireframe' };
