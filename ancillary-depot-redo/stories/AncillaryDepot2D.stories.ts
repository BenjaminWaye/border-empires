export default { title: 'Border Empires/Ancillary Depot/2D Icon' };

function icon(size: number, bg = 'transparent') {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0,0,size,size); }
  const cx=size/2, cy=size/2, sc=size/4.0;
  const drumR=1.25*sc, podCount=12, podOff=(1.25+0.18)*sc, pw=0.36*sc, ph=1.9*sc;
  const brass='#BFA46A', iron='#0F1113', cyan='#3DF9FF';
  ctx.fillStyle=iron; ctx.beginPath(); ctx.arc(cx,cy,drumR,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=brass; ctx.lineWidth=Math.max(1,size*0.04);
  ctx.beginPath(); ctx.arc(cx,cy,drumR+0.02*sc,0,Math.PI*2); ctx.stroke();
  for (let i=0;i<podCount;i++) {
    const ang=(i/podCount)*Math.PI*2, px=cx+Math.cos(ang)*podOff, py=cy+Math.sin(ang)*podOff, r=-ang+Math.PI/2;
    ctx.save(); ctx.translate(px,py); ctx.rotate(r);
    ctx.fillStyle=iron; ctx.beginPath();
    ctx.moveTo(-pw*0.5,-ph*0.5); ctx.lineTo(pw*0.5,-ph*0.5); ctx.lineTo(pw*0.42,ph*0.5); ctx.lineTo(-pw*0.42,ph*0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=brass; ctx.fillRect(-pw*0.55,-ph*0.5-size*0.01,pw*1.1,Math.max(1,size*0.01));
    ctx.fillStyle=iron; ctx.beginPath();
    ctx.rect(-pw*0.28,-ph*0.32,pw*0.56,ph*0.18);
    ctx.rect(-pw*0.36,-ph*0.12,pw*0.72,ph*0.28);
    ctx.rect(-pw*0.32,ph*0.16,pw*0.64,ph*0.22);
    ctx.fill();
    ctx.fillStyle=cyan; const d=Math.max(1,size*0.01);
    ctx.beginPath(); ctx.arc(0,-ph*0.38,d,0,Math.PI*2); ctx.arc(0,-ph*0.08,d,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  const wrap=document.createElement('div');
  wrap.style.display='flex'; wrap.style.flexDirection='column'; wrap.style.alignItems='center'; wrap.style.gap='8px'; wrap.style.padding='16px';
  const lab=document.createElement('div');
  lab.textContent=size+'×'+size; lab.style.color='#e6e6e6'; lab.style.fontSize='12px'; lab.style.fontFamily='monospace';
  wrap.appendChild(c); wrap.appendChild(lab);
  return wrap;
}

export const Sizes = { render: ()=>{ const d=document.createElement('div'); d.style.display='flex'; d.style.flexWrap='wrap'; d.style.gap='24px'; d.style.alignItems='center'; d.style.justifyContent='center'; d.style.minHeight='100vh'; d.style.background='#080a0c'; d.appendChild(icon(32)); d.appendChild(icon(64)); d.appendChild(icon(128)); return d; }, name:'32/64/128' };
export const Transparent = { render: ()=>{ const d=document.createElement('div'); d.style.display='grid'; d.style.placeItems='center'; d.style.minHeight='100vh'; d.style.background='repeating-conic-gradient(#15171a 0% 25%, #080a0c 0% 50%) 50% / 20px 20px'; d.appendChild(icon(128,'transparent')); return d; }, name:'Transparent Check' };
