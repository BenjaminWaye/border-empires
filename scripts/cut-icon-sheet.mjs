// Cuts a grid of icons out of an AI-generated icon sheet (flat background,
// icons in rows/columns) into transparent PNGs at 256/96/72/48 px, named
// <name>-<px>.png. Used for packages/client/public/icons/resources/.
// Pure Node (zlib only), so it needs no image library.
//
// Usage:
//   node scripts/cut-icon-sheet.mjs <sheet.png> <outDir> <rows> <cols> name1,name2,...   regular grid
//   node scripts/cut-icon-sheet.mjs <sheet.png> --list                                    print icon boxes
//   node scripts/cut-icon-sheet.mjs <sheet.png> <outDir> --boxes "name=x0,y0,x1,y1;..."   explicit boxes
//   WHITEN=name1,name2  recolour those icons to cool white (keeps outlines/shading)
//
// Background removal flood-fills from each crop's border, so dark interiors
// enclosed by the icon's outline stay opaque. Sheets must be 8-bit RGB/RGBA PNG.
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";
const [,, src, outDir, rowsArg, colsArg, namesArg] = process.argv;

function decodePng(buf){
  let p = 8, w, h, bitDepth, colorType; const idat = [];
  while (p < buf.length){
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p+4, p+8), data = buf.subarray(p+8, p+8+len);
    if (type === "IHDR"){ w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; if (data[12]) throw new Error("interlaced"); }
    else if (type === "IDAT") idat.push(data); else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || ![2,6].includes(colorType)) throw new Error(`unsupported png ${bitDepth}/${colorType}`);
  const bpp = colorType === 6 ? 4 : 3, stride = w*bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w*h*4); let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y=0; y<h; y++){
    const f = raw[y*(stride+1)], line = raw.subarray(y*(stride+1)+1, (y+1)*(stride+1));
    for (let i=0;i<stride;i++){
      const a = i>=bpp ? cur[i-bpp] : 0, b = prev[i], c = i>=bpp ? prev[i-bpp] : 0; let v = line[i];
      if (f===1) v+=a; else if (f===2) v+=b; else if (f===3) v+=(a+b)>>1;
      else if (f===4){ const pp=a+b-c, pa=Math.abs(pp-a), pb=Math.abs(pp-b), pc=Math.abs(pp-c); v += (pa<=pb&&pa<=pc)?a:(pb<=pc?b:c); }
      cur[i] = v & 255;
    }
    for (let x=0;x<w;x++){ const o=(y*w+x)*4; out[o]=cur[x*bpp]; out[o+1]=cur[x*bpp+1]; out[o+2]=cur[x*bpp+2]; out[o+3]= bpp===4?cur[x*bpp+3]:255; }
    [prev, cur] = [cur, prev];
  }
  return { w, h, data: out };
}
const crcTable = Array.from({length:256},(_,n)=>{ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xedb88320^(c>>>1) : c>>>1; return c>>>0; });
const crc = b => { let c=0xffffffff; for (const x of b) c = crcTable[(c^x)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
function chunk(type, data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const td=Buffer.concat([Buffer.from(type,"ascii"),data]); const c=Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len,td,c]); }
function encodePng({w,h,data}){
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6;
  const raw = Buffer.alloc((w*4+1)*h); for (let y=0;y<h;y++){ raw[y*(w*4+1)]=0; data.copy(raw, y*(w*4+1)+1, y*w*4, (y+1)*w*4); }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR",ihdr), chunk("IDAT",zlib.deflateSync(raw,{level:9})), chunk("IEND",Buffer.alloc(0))]);
}
// Area-average downscale on premultiplied alpha so halos don't go dark.
function resize(img, size){
  const {w,h,data}=img, out=Buffer.alloc(size*size*4), sx=w/size, sy=h/size;
  for (let y=0;y<size;y++) for (let x=0;x<size;x++){
    let r=0,g=0,b=0,a=0,n=0;
    for (let yy=Math.floor(y*sy); yy<Math.ceil((y+1)*sy); yy++) for (let xx=Math.floor(x*sx); xx<Math.ceil((x+1)*sx); xx++){
      const o=(yy*w+xx)*4, al=data[o+3]/255; r+=data[o]*al; g+=data[o+1]*al; b+=data[o+2]*al; a+=al; n++;
    }
    const o=(y*size+x)*4; out[o]=a?r/a:0; out[o+1]=a?g/a:0; out[o+2]=a?b/a:0; out[o+3]=Math.round(255*a/n);
  }
  return {w:size,h:size,data:out};
}

const img = decodePng(fs.readFileSync(src)); const {w,h,data:d}=img;
const px=(x,y)=>{const o=(y*w+x)*4; return [d[o],d[o+1],d[o+2]];};
const corners=[px(4,4),px(w-5,4),px(4,h-5),px(w-5,h-5)];
const bgAt=(x,y)=>{const u=x/w,v=y/h; return [0,1,2].map(c=>(corners[0][c]*(1-u)+corners[1][c]*u)*(1-v)+(corners[2][c]*(1-u)+corners[3][c]*u)*v);};
const dist=(x,y)=>{const o=(y*w+x)*4,b=bgAt(x,y); return Math.hypot(d[o]-b[0],d[o+1]-b[1],d[o+2]-b[2]);};
const T=34;
// --list: coarse 8px-cell connected components of foreground, printed in reading order.
if (outDir === "--list"){
  const C=8, gw=Math.ceil(w/C), gh=Math.ceil(h/C), g=new Uint8Array(gw*gh);
  for(let y=0;y<h;y+=2) for(let x=0;x<w;x+=2) if(dist(x,y)>T) g[((y/C)|0)*gw+((x/C)|0)]=1;
  const seen=new Uint8Array(gw*gh), boxes=[];
  for(let i=0;i<g.length;i++){ if(!g[i]||seen[i]) continue; const st=[i]; seen[i]=1; let a=gw,b=gh,c=0,e=0,n=0;
    while(st.length){ const j=st.pop(), x=j%gw, y=(j/gw)|0; n++; a=Math.min(a,x); b=Math.min(b,y); c=Math.max(c,x); e=Math.max(e,y);
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=gw||ny>=gh) continue; const k=ny*gw+nx; if(g[k]&&!seen[k]){seen[k]=1; st.push(k);} } }
    if(n>=12) boxes.push([a*C,b*C,Math.min(w-1,(c+1)*C),Math.min(h-1,(e+1)*C)]); }
  boxes.sort((p,q)=>Math.abs(p[1]-q[1])>C*12 ? p[1]-q[1] : p[0]-q[0]);
  for (const b of boxes) console.log(b.join(","));
  process.exit(0);
}
function segments(count, len, activeAt){
  const cnt=new Array(len).fill(0); for (let i=0;i<len;i++) cnt[i]=activeAt(i);
  let runs=[], s=-1; for (let i=0;i<=len;i++){ const a=i<len&&cnt[i]>3; if(a&&s<0)s=i; if(!a&&s>=0){runs.push([s,i-1]);s=-1;} }
  runs=runs.filter(r=>r[1]-r[0]>=6);
  while (runs.length>count){ let gi=0,best=1e9; for(let i=0;i<runs.length-1;i++){const g=runs[i+1][0]-runs[i][1]; if(g<best){best=g;gi=i;}} runs.splice(gi,2,[runs[gi][0],runs[gi+1][1]]); }
  while (runs.length<count){ let wi=0; runs.forEach((r,i)=>{if(r[1]-r[0]>runs[wi][1]-runs[wi][0])wi=i;}); const [a,b]=runs[wi]; let cut=a,min=1e9;
    for(let i=a+Math.round((b-a)*.3);i<=a+Math.round((b-a)*.7);i++) if(cnt[i]<min){min=cnt[i];cut=i;} runs.splice(wi,1,[a,cut-1],[cut+1,b]); }
  return runs;
}
fs.mkdirSync(outDir,{recursive:true});
function cutBox(name, bx0, by0, bx1, by1){
  let x0=bx1,x1=bx0,y0=by1,y1=by0;
  for(let y=by0;y<=by1;y++) for(let x=bx0;x<=bx1;x++) if(dist(x,y)>T){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  const cw=x1-x0+1, ch=y1-y0+1, side=Math.max(cw,ch)+8, ox=Math.floor((side-cw)/2), oy=Math.floor((side-ch)/2);
  // Flood-fill background inward from the crop border; enclosed dark pixels (rock, shadows) stay opaque.
  const M=6, fx0=Math.max(0,x0-M), fy0=Math.max(0,y0-M), fw=Math.min(w-1,x1+M)-fx0+1, fh=Math.min(h-1,y1+M)-fy0+1;
  const outside=new Uint8Array(fw*fh), q=[];
  const push=(x,y)=>{ const i=y*fw+x; if(outside[i]) return; if(dist(fx0+x,fy0+y)>=T*1.4) return; outside[i]=1; q.push(i); };
  for(let x=0;x<fw;x++){ push(x,0); push(x,fh-1); } for(let y=0;y<fh;y++){ push(0,y); push(fw-1,y); }
  while(q.length){ const i=q.pop(), x=i%fw, y=(i/fw)|0; if(x>0)push(x-1,y); if(x<fw-1)push(x+1,y); if(y>0)push(x,y-1); if(y<fh-1)push(x,y+1); }
  const out=Buffer.alloc(side*side*4);
  for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){
    const sx=x0+x, sy=y0+y, so=(sy*w+sx)*4, to=((oy+y)*side+(ox+x))*4, dd=dist(sx,sy);
    const isOut=outside[(sy-fy0)*fw+(sx-fx0)];
    const a = !isOut ? 255 : dd<T*0.55?0 : Math.round(255*(dd-T*0.55)/(T*0.85));
    out[to]=d[so]; out[to+1]=d[so+1]; out[to+2]=d[so+2]; out[to+3]=a;
  }
  if ((process.env.WHITEN||"").split(",").includes(name)){
    // Desaturate to a cool white, keep the dark outline dark and lift the mid-tones.
    for (let i=0;i<out.length;i+=4){
      const L=(0.299*out[i]+0.587*out[i+1]+0.114*out[i+2])/255, v=Math.min(1,Math.pow(L,0.5)*1.08);
      out[i]=Math.round(255*Math.min(1,v*0.97)); out[i+1]=Math.round(255*Math.min(1,v*0.99)); out[i+2]=Math.round(255*Math.min(1,v*1.04+0.02));
    }
  }
  const master={w:side,h:side,data:out};
  fs.writeFileSync(path.join(outDir,`${name}-256.png`), encodePng(resize(master,256)));
  for (const s of [96,72,48]) fs.writeFileSync(path.join(outDir,`${name}-${s}.png`), encodePng(resize(master,s)));
  console.log(name, `${cw}x${ch} at ${x0},${y0}`);
}
if (rowsArg === "--boxes"){
  for (const spec of colsArg.split(";").filter(Boolean)){
    const [name, coords] = spec.split("="); const [a,b,c,e] = coords.split(",").map(Number);
    cutBox(name.trim(), Math.max(0,a), Math.max(0,b), Math.min(w-1,c), Math.min(h-1,e));
  }
} else {
  const ROWS = +rowsArg, COLS = +colsArg, NAMES = namesArg.split(","); let k=0;
  const rowBands = segments(ROWS, h, y=>{let n=0; for(let x=0;x<w;x+=2) if(dist(x,y)>T) n++; return n;});
  for (const [ry0,ry1] of rowBands){
    const cols = segments(COLS, w, x=>{let n=0; for(let y=ry0;y<=ry1;y+=2) if(dist(x,y)>T) n++; return n;});
    for (const [x0,x1] of cols) cutBox(NAMES[k++], x0, ry0, x1, ry1);
  }
}
