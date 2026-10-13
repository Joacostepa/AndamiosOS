import fs from 'fs';import zlib from 'zlib';
import {VectorTile} from '/Users/joaquin/Desktop/Andamios-OS/node_modules/@mapbox/vector-tile/index.js';
import {PbfReader as Pbf} from '/Users/joaquin/Desktop/Andamios-OS/node_modules/pbf/index.js';
const {rows,ots}=JSON.parse(fs.readFileSync('raw.json','utf8'));
const HOY=new Date('2026-10-12T12:00:00-03:00');
const norm=s=>(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\b(avenida|av|avda|calle|gral|general|dr|doctor|pje|pasaje|pres|presidente|ing|tte|teniente|cnel|coronel)\b\.?/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const calleDe=dir=>{const a=(dir||'').split(/[,\-–]/)[0];const m=a.match(/^(.*?)(\d{1,5})\b/);return norm(m?m[1]:a)};
const num=s=>parseFloat(String(s).replace(',','.'));
function medidas(r,txt){
  const t=(txt||'');let largo=null,prof=null,alto=null;
  let m=t.match(/(\d+(?:[.,]\d+)?)\s*m?\s*x\s*(\d+(?:[.,]\d+)?)\s*m?\s*x\s*(\d+(?:[.,]\d+)?)\s*m?\s*(?:H\b|alt)/i);
  if(m){const a=num(m[1]),b=num(m[2]);largo=Math.max(a,b);prof=Math.min(a,b);alto=num(m[3]);}
  if(!m){m=t.match(/(\d+(?:[.,]\d+)?)\s*m?\.?\s*x\s*(\d+(?:[.,]\d+)?)\s*(?:m\s*)?de alto/i);if(m){largo=num(m[1]);alto=num(m[2]);}}
  if(alto==null){m=t.match(/(\d+(?:[.,]\d+)?)\s*m\s*H\b/i)||t.match(/(\d+(?:[.,]\d+)?)\s*m(?:to|ts)?\.?\s*d?e?\s*altura/i);if(m)alto=num(m[1]);}
  const pantalla=/pantalla/i.test(t)||r.x_trabajo_obra==='pantalla_proteccion';
  const tipo=r.x_trabajo_obra||(pantalla?'pantalla_proteccion':null);
  let est=false;
  if(!largo){largo=r.x_permiso_metros_lineales||null;}
  if(!largo){largo=10;est=true}
  if(!alto){alto=tipo==='pantalla_proteccion'?3:tipo==='torre'?10:8;est=true}
  if(!prof)prof=tipo==='pantalla_proteccion'?1.25:1.1;
  largo=Math.min(largo,60);alto=Math.min(alto,60);
  return {largo,prof,alto,est,tipo};
}
// tiles
const tilesCache={};
function lon2t(l,z){return (l+180)/360*2**z}function lat2t(la,z){const r=la*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*2**z}
function tile(z,x,y){const k=`${z}_${x}_${y}`;if(k in tilesCache)return tilesCache[k];const p=`tiles/${k}.pbf`;tilesCache[k]=fs.existsSync(p)?new VectorTile(new Pbf(fs.readFileSync(p))):null;return tilesCache[k]}
function feats(lat,lng,layer){const z=14,fx=lon2t(lng,z),fy=lat2t(lat,z),out=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=Math.floor(fx)+dx,y=Math.floor(fy)+dy;const vt=tile(z,x,y);if(!vt||!vt.layers[layer])continue;const L=vt.layers[layer];
    for(let i=0;i<L.length;i++){const f=L.feature(i);out.push(f.toGeoJSON(x,y,z));}}return out}
// local meters
const M=(lat0)=>({x:lng=>lng*111320*Math.cos(lat0*Math.PI/180),y:lat=>lat*110574});
const HALF={motorway:16,trunk:14,primary:12,secondary:10,tertiary:8,minor:6,service:4};
function facade(r,largo){
  const lat=r.x_obra_lat,lng=r.x_obra_lng,m=M(lat);const P=[m.x(lng),m.y(lat)];
  const want=calleDe(r.x_direccion_obra);
  const roads=feats(lat,lng,'transportation').filter(f=>HALF[f.properties.class]);
  const names=feats(lat,lng,'transportation_name');
  let best=null;
  const segs=(g)=>g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
  function scan(list,nameOk,maxD){for(const f of list){for(const line of segs(f.geometry))for(let i=0;i<line.length-1;i++){
      const A=[m.x(line[i][0]),m.y(line[i][1])],B=[m.x(line[i+1][0]),m.y(line[i+1][1])];const dx=B[0]-A[0],dy=B[1]-A[1],L2=dx*dx+dy*dy;if(!L2)continue;
      let u=((P[0]-A[0])*dx+(P[1]-A[1])*dy)/L2;u=Math.max(0,Math.min(1,u));const Q=[A[0]+u*dx,A[1]+u*dy];const d=Math.hypot(P[0]-Q[0],P[1]-Q[1]);
      if(d<maxD&&(!best||d<best.d))best={d,Q,dir:[dx/Math.sqrt(L2),dy/Math.sqrt(L2)],cls:f.properties.class,name:f.properties.name||'',matched:nameOk};}}}
  const named=names.filter(f=>{const n=norm(f.properties.name);return want&&n&&(n===want||n.includes(want)||want.includes(n))});
  scan(named.map(f=>({...f,properties:{...f.properties,class:f.properties.class||'minor'}})),true,160);
  if(!best)scan(roads,false,90);
  if(!best)return null;
  let n=[-best.dir[1],best.dir[0]];const side=(P[0]-best.Q[0])*n[0]+(P[1]-best.Q[1])*n[1];if(side<0)n=[-n[0],-n[1]];
  const off=(HALF[best.cls]||7)+1.5;
  const F=[best.Q[0]+n[0]*off,best.Q[1]+n[1]*off];
  // edificio OSM detrás de la fachada
  const probe=[F[0]+n[0]*6,F[1]+n[1]*6];const bl=feats(lat,lng,'building');let bh=null;
  const inside=(pt,ring)=>{let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=m.x(ring[i][0]),yi=m.y(ring[i][1]),xj=m.x(ring[j][0]),yj=m.y(ring[j][1]);if(((yi>pt[1])!==(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi))c=!c}return c};
  for(const b of bl){const polys=b.geometry.type==='Polygon'?[b.geometry.coordinates]:b.geometry.type==='MultiPolygon'?b.geometry.coordinates:[];for(const p of polys)if(inside(probe,p[0])){bh=b.properties.render_height||3;}}
  return {flng:F[0]/(111320*Math.cos(lat*Math.PI/180)),flat:F[1]/110574,ne:[n[0],n[1]],calleOsm:best.name,matched:best.matched,dist:Math.round(best.d),bh};
}
const desOt={};for(const o of ots){if(o.x_tipo==='desarme'&&o.x_estado!=='cancelada'){const k=o.x_order_id[0];(desOt[k]=desOt[k]||[]).push(o)}}
const estrOt={};for(const o of ots.sort((a,b)=>a.id-b.id)){if(o.x_tipo==='armado'&&!estrOt[o.x_order_id[0]])estrOt[o.x_order_id[0]]=o.x_ejecutado_real||o.x_detalle_tecnico||''}
const d10=s=>s?String(s).slice(0,10):null;
const out=[];let stats={total:0,matched:0,near:0,none:0,bldg:0};
for(const r of rows){
  const estado=r.x_studio_estado_de_obra;
  const txt=r.x_estructura_actual||estrOt[r.id]||'';
  const md=medidas(r,txt);
  const o={v:r.name,id:r.id,dir:(r.x_direccion_obra||'').trim(),ref:r.x_obra_referencia||'',e:estado==='Armado'?'A':estado==='Pendiente de Desarme'?'P':'D',
    fa:d10(r.x_fecha_armado),fd:d10(r.x_fecha_desmontaje),fe:d10(r.x_fecha_fin_obra_estimada),tipo:md.tipo,largo:md.largo,prof:md.prof,alto:md.alto,est:md.est,
    txt:txt.slice(0,600),txtReal:!!r.x_estructura_actual,txtF:d10(r.x_estructura_fecha)};
  if(o.e==='P'){const ds=(desOt[r.id]||[]).filter(x=>x.x_estado!=='completada');const f=ds.map(x=>x.x_fecha_programada).filter(Boolean).sort()[0];o.desProg=f||null;}
  if(r.x_obra_lat){
    o.lat=+r.x_obra_lat.toFixed(6);o.lng=+r.x_obra_lng.toFixed(6);
    if(o.lat<-35||o.lat>-34.35||o.lng<-58.95)o.lejos=true;
    else{const f=facade(r,md.largo);stats.total++;if(f){o.f=[+f.flng.toFixed(7),+f.flat.toFixed(7)];o.n=[+f.ne[0].toFixed(4),+f.ne[1].toFixed(4)];o.calleOsm=f.calleOsm;o.bh=f.bh;if(f.matched)stats.matched++;else stats.near++;if(f.bh!=null)stats.bldg++}else stats.none++;}
  }
  out.push(o);
}
// curva mensual: obras paradas a fin de cada mes (todas, con o sin ubicación)
const meses=[];for(let y=2026,mo=3;;){const end=new Date(Date.UTC(y,mo,1));const key=`${y}-${String(mo).padStart(2,'0')}`;
  const n=out.filter(o=>o.fa&&o.fa<key+'-32'.slice(0,0)+'' ).length;meses.push(key);mo++;if(mo>12){mo=1;y++}if(key==='2026-10')break;}
fs.writeFileSync('obras.json',JSON.stringify(out));
console.log(stats,'filas',out.length,'bytes',JSON.stringify(out).length);
for(const o of out.filter(o=>o.e!=='D').slice(0,12))console.log(o.v,o.dir,'|',o.calleOsm,o.n,o.largo,o.alto,o.est,o.bh);
