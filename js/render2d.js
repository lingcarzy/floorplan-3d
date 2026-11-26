/* 2D 平面图 SVG 渲染：房间 / 家具 / 墙体 / 门窗 / 标注 / 网格 / 测量 / 选中 */
import {PLAN} from './data.js';
import {state, undoStack, redoStack, getF} from './state.js';
import {ui, esc} from './ui.js';
import {tr, nm} from './i18n.js';
import {$, svg, COARSE} from './dom.js';
import {area, aabb, fmt} from './geometry.js';
import {shade, furnSVG} from './icons.js';
import {view} from './view2d.js';
import {getView3D} from './mode.js';
import {renderPanel} from './panels.js';

function buildDefs(){
  const plank = (id,base,line) => `<pattern id="m-${id}" patternUnits="userSpaceOnUse" width="1800" height="360">
      <rect width="1800" height="360" fill="${base}"/>
      <path d="M0 0H1800M0 180H1800M1200 0V180M600 180V360" stroke="${line}" stroke-width="10"/>
      <path d="M100 70Q500 60 900 85T1700 75M200 260Q700 250 1100 275T1750 262" stroke="${line}" stroke-width="5" fill="none" opacity=".45"/></pattern>`;
  const tile = (id,size,base,line) => `<pattern id="m-${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="${base}"/><path d="M0 0H${size}M0 0V${size}" stroke="${line}" stroke-width="10"/></pattern>`;
  $('#defs').innerHTML =
    plank('wood','#dcc09a','#bf9d70') + plank('walnut','#a57c56','#80593a') +
    tile('tile800',800,'#ece7de','#d3cabb') + tile('tile600',600,'#e2e6e3','#c4cbc6') + tile('antislip',300,'#d6dbd7','#b3bab4') +
    `<pattern id="m-marble" patternUnits="userSpaceOnUse" width="1200" height="1200">
      <rect width="1200" height="1200" fill="#f3f0ea"/><path d="M0 0H1200M0 0V1200" stroke="#dcd5c8" stroke-width="10"/>
      <path d="M-50 300C250 260 380 520 700 470S1100 640 1260 600M200 1200C300 950 520 980 640 820" stroke="#d6cfc2" stroke-width="12" fill="none"/></pattern>
    <pattern id="m-terrazzo" patternUnits="userSpaceOnUse" width="500" height="500">
      <rect width="500" height="500" fill="#e8e1d5"/>
      <circle cx="60" cy="80" r="22" fill="#b9a58c"/><circle cx="310" cy="140" r="16" fill="#8fa3a0"/><circle cx="190" cy="330" r="26" fill="#c9b7a2"/>
      <circle cx="420" cy="400" r="18" fill="#a88f76"/><circle cx="90" cy="440" r="12" fill="#8fa3a0"/><circle cx="440" cy="40" r="10" fill="#b9a58c"/></pattern>
    <pattern id="m-carpet" patternUnits="userSpaceOnUse" width="120" height="120">
      <rect width="120" height="120" fill="#c9c3d3"/><circle cx="30" cy="30" r="8" fill="#bab3c6"/><circle cx="90" cy="90" r="8" fill="#bab3c6"/></pattern>
    <pattern id="grid" patternUnits="userSpaceOnUse" width="1000" height="1000">
      <path d="M500 0V1000M0 500H1000" stroke="#e5dfd3" stroke-width="8"/><path d="M0 0V1000M0 0H1000" stroke="#d8d0c1" stroke-width="14"/></pattern>`
    // 方案 JSON 里自定义的材料（内置图案之外的）生成通用方砖图案
    + Object.keys(PLAN.mats).filter(k => !['wood','walnut','tile800','tile600','antislip','marble','terrazzo','carpet'].includes(k))
      .map(k => tile(k, 600, PLAN.mats[k].sw, shade(PLAN.mats[k].sw, .88))).join('');
}

/* ======================= 渲染 ======================= */
const NOLABEL = ['plant','floorlamp','sidetable','barstool','beanbag'];
function renderRooms(){
  let s = '';
  PLAN.rooms.forEach(r => s += `<polygon class="room" data-room="${r.id}" points="${r.poly.map(p=>p.join(',')).join(' ')}" fill="url(#m-${state.rooms[r.id].mat})"/>`);
  const sill = ([a,b,c,d]) => `<rect x="${a}" y="${b}" width="${c-a}" height="${d-b}" fill="#e2dacb" stroke="#b9b0a0" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  PLAN.doors.forEach(d => s += sill(d.rect)); PLAN.slides.forEach(d => s += sill(d.rect));
  $('#gRooms').innerHTML = s;
}

function renderFurn(){
  const g = $('#gFurn');
  g.setAttribute('display', ui.layers.furn ? 'inline' : 'none');
  g.innerHTML = state.furniture.map(f => {
    const fs = Math.max(80, Math.min(170, Math.min(f.w,f.d)*.2));
    const label = Math.min(f.w,f.d) >= 380 && !NOLABEL.includes(f.type)
      ? `<text transform="rotate(${-f.rot})" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="#4a443c" opacity=".8" pointer-events="none">${esc(nm(f.name))}</text>` : '';
    return `<g class="furn" data-fid="${f.id}" transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">${furnSVG(f.type,f.w,f.d,f.color)}${label}</g>`;
  }).join('');
}

function renderWalls(){
  $('#gWalls').innerHTML = PLAN.walls.map((w,i) => {
    const [x0,y0,x1,y1,k] = w, id = 'w'+i, dem = state.demolished.includes(id);
    let fill = k==='b' ? (ui.layers.bearing ? '#b8412c' : '#26241f') : k==='low' ? '#e9e3d8' : k==='e' ? '#8f897d' : '#a7a195';
    let ex = k==='low' ? 'stroke="#8f897d" stroke-width="1" vector-effect="non-scaling-stroke"' : '';
    if (dem){ fill = 'rgba(198,91,58,.12)'; ex = 'stroke="#c65b3a" stroke-width="1.2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"'; }
    return `<rect class="wall" data-wall="${id}" x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="${fill}" ${ex}/>`;
  }).join('');
}

function renderOpenings(){
  const WS = 'stroke="#4f7394" stroke-width="1" vector-effect="non-scaling-stroke"';
  let s = '';
  PLAN.wins.forEach(({rect:[x0,y0,x1,y1]}) => {
    const w = x1-x0, h = y1-y0;
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#f7fbfd" ${WS}/>`;
    if (w >= h) [1/3,2/3].forEach(t => s += `<line x1="${x0}" y1="${y0+h*t}" x2="${x1}" y2="${y0+h*t}" ${WS}/>`);
    else [1/3,2/3].forEach(t => s += `<line x1="${x0+w*t}" y1="${y0}" x2="${x0+w*t}" y2="${y1}" ${WS}/>`);
  });
  const DS = 'stroke="#3d3a34" stroke-width="1" vector-effect="non-scaling-stroke"';
  PLAN.doors.forEach(d => {
    const [hx,hy] = d.h, L = d.len, T = 40;
    const ox = hx + d.o[0]*L, oy = hy + d.o[1]*L, cx = hx + d.c[0]*L, cy = hy + d.c[1]*L;
    const sweep = d.o[0]*d.c[1] - d.o[1]*d.c[0] > 0 ? 1 : 0;
    const col = d.entry ? '#b5653a' : '#3d3a34';
    s += `<polygon points="${hx},${hy} ${ox},${oy} ${ox+d.c[0]*T},${oy+d.c[1]*T} ${hx+d.c[0]*T},${hy+d.c[1]*T}" fill="#fff" stroke="${col}" stroke-width="${d.entry?1.8:1}" vector-effect="non-scaling-stroke"/>`;
    s += `<path d="M${ox} ${oy}A${L} ${L} 0 0 ${sweep} ${cx} ${cy}" fill="none" ${DS} stroke-dasharray="5 3" opacity=".7"/>`;
  });
  PLAN.slides.forEach(({rect:[x0,y0,x1,y1],v}) => {
    if (v){ const L = y1-y0, m = (x0+x1)/2; s += `<rect x="${m-45}" y="${y0}" width="40" height="${L*.55}" fill="#fff" ${DS}/><rect x="${m+5}" y="${y1-L*.55}" width="40" height="${L*.55}" fill="#fff" ${DS}/>`; }
    else { const L = x1-x0, m = (y0+y1)/2; s += `<rect x="${x0}" y="${m-45}" width="${L*.55}" height="40" fill="#fff" ${DS}/><rect x="${x1-L*.55}" y="${m+5}" width="${L*.55}" height="40" fill="#fff" ${DS}/>`; }
  });
  // 入户标识：箭头从门外指向入户门，几何由方案 JSON 的 entry 派生
  if (PLAN.entry?.arrow){
    const {from, head, tip} = PLAN.entry.arrow;
    const L = Math.hypot(tip[0]-from[0], tip[1]-from[1]) || 1;
    const dx = (tip[0]-from[0])/L, dy = (tip[1]-from[1])/L;      // 单位方向（门外 → 门）
    const px = dy, py = -dx;                                     // 垂直方向
    const lineEnd = [tip[0] - dx*50, tip[1] - dy*50];
    const w1 = [head[0] + px*155, head[1] + py*155], w2 = [head[0] - px*155, head[1] - py*155];
    const t = [from[0] + px*155 + dx*30, from[1] + py*155 + dy*30];
    s += `<path d="M${from[0].toFixed(0)} ${from[1].toFixed(0)}L${lineEnd[0].toFixed(0)} ${lineEnd[1].toFixed(0)}
      M${w1[0].toFixed(0)} ${w1[1].toFixed(0)}L${tip[0].toFixed(0)} ${tip[1].toFixed(0)}L${w2[0].toFixed(0)} ${w2[1].toFixed(0)}" fill="none" stroke="#b5653a" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <text x="${t[0].toFixed(0)}" y="${t[1].toFixed(0)}" font-size="200" fill="#b5653a">${tr('入户','Entry')}</text>`;
  }
  $('#gOpen').innerHTML = s;
}

function renderLabels(){
  const g = $('#gLabels');
  g.setAttribute('display', ui.layers.labels ? 'inline' : 'none');
  g.innerHTML = PLAN.rooms.filter(r => r.at).map(r => {
    const [x,y] = r.at, halo = 'stroke="#fbf9f4" stroke-width="45" paint-order="stroke" stroke-linejoin="round"';
    return `<text x="${x}" y="${y}" font-size="250" font-weight="600" text-anchor="middle" fill="#2b2824" ${halo}>${esc(nm(state.rooms[r.id].name))}</text>
      <text x="${x}" y="${y+260}" font-size="175" text-anchor="middle" fill="#7d7366" ${halo}>${fmt(area(r.poly))} m²</text>`;
  }).join('');
}

function renderDims(){
  const DC = '#7d7160', LS = `stroke="${DC}" stroke-width="1" vector-effect="non-scaling-stroke"`, TK = `stroke="${DC}" stroke-width="2" vector-effect="non-scaling-stroke"`;
  const txt = (x,y,v,rot) => `<text x="${x}" y="${y}" font-size="${v<400?140:200}" text-anchor="middle" fill="${DC}" ${rot?`transform="rotate(-90 ${x} ${y})"`:''}>${v}</text>`;
  const chain = (horiz, at, start, segs) => {
    const pts = [start]; segs.forEach(v => pts.push(pts[pts.length-1]+v));
    let s = horiz ? `<line x1="${pts[0]}" y1="${at}" x2="${pts.at(-1)}" y2="${at}" ${LS}/>` : `<line x1="${at}" y1="${pts[0]}" x2="${at}" y2="${pts.at(-1)}" ${LS}/>`;
    pts.forEach(p => s += horiz
      ? `<line x1="${p}" y1="${at-170}" x2="${p}" y2="${at+170}" ${LS}/><line x1="${p-80}" y1="${at+80}" x2="${p+80}" y2="${at-80}" ${TK}/>`
      : `<line x1="${at-170}" y1="${p}" x2="${at+170}" y2="${p}" ${LS}/><line x1="${at-80}" y1="${p+80}" x2="${at+80}" y2="${p-80}" ${TK}/>`);
    segs.forEach((v,i) => { const mid = (pts[i]+pts[i+1])/2; s += horiz ? txt(mid, at-70, v) : txt(at-70, mid, v, true); });
    return s;
  };
  const g = $('#gDims');
  g.innerHTML = PLAN.dims.map(d => chain(!!d.h, d.at, d.start, d.segs)).join('');
  g.setAttribute('display', ui.layers.dims ? 'inline' : 'none');
}

function renderGrid(){
  $('#gGrid').innerHTML = `<rect x="-20000" y="-20000" width="55000" height="55000" fill="${ui.layers.grid ? 'url(#grid)' : 'transparent'}" data-bg="1"/>`;
}

function renderMeasure(){
  const k = 1/view.s, fs = 12*k;
  const one = (a,b,tmp) => {
    const L = Math.hypot(b.x-a.x, b.y-a.y); if (L < 1) return '';
    let ang = Math.atan2(b.y-a.y, b.x-a.x)*180/Math.PI; if (ang > 90 || ang < -90) ang += 180;
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2, nx = -(b.y-a.y)/L*5*k, ny = (b.x-a.x)/L*5*k;
    const col = tmp ? '#2f5d62' : '#b5653a', S = `stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"`;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${S}/>
      <line x1="${a.x-nx}" y1="${a.y-ny}" x2="${a.x+nx}" y2="${a.y+ny}" ${S}/><line x1="${b.x-nx}" y1="${b.y-ny}" x2="${b.x+nx}" y2="${b.y+ny}" ${S}/>
      <text x="${mx}" y="${my-5*k}" font-size="${fs}" text-anchor="middle" fill="${col}" font-weight="600" transform="rotate(${ang} ${mx} ${my})"
        stroke="#fff" stroke-width="${3.5*k}" paint-order="stroke">${Math.round(L)} mm</text>`;
  };
  let s = state.measures.map(m => one(m.a,m.b)).join('');
  if (ui.mA && ui.mCur) s += one(ui.mA, ui.mCur, true);
  if (ui.mA) s += `<circle cx="${ui.mA.x}" cy="${ui.mA.y}" r="${3*k}" fill="#2f5d62"/>`;
  $('#gMeasure').innerHTML = s;
}

function renderSel(){
  const k = 1/view.s; let s = '';
  if (ui.sel?.kind === 'furn'){
    const f = getF(ui.sel.id);
    if (f){
      // 触屏上手柄更大、离家具更远，并各带一圈透明的大热区
      const p = 5*k, A = 'stroke="#b5653a" vector-effect="non-scaling-stroke"', hs = COARSE ? 1.7 : 1, ro = (COARSE ? 40 : 26)*k, hit = (COARSE ? 24 : 11)*k;
      const sx = f.w/2+p, sy = f.d/2+p;
      s += `<g transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">
        <rect x="${-f.w/2-p}" y="${-f.d/2-p}" width="${f.w+2*p}" height="${f.d+2*p}" fill="none" ${A} stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>
        <line x1="0" y1="${-f.d/2-p}" x2="0" y2="${-f.d/2-ro}" ${A} stroke-width="1" pointer-events="none"/>
        <circle data-handle="rot" cx="0" cy="${-f.d/2-ro}" r="${hit}" fill="transparent"/>
        <circle data-handle="rot" cx="0" cy="${-f.d/2-ro}" r="${6*hs*k}" fill="#fff" ${A} stroke-width="1.5"><title>${tr('拖动旋转（Shift 自由角度）','Drag to rotate (Shift for free angle)')}</title></circle>
        <circle data-handle="size" cx="${sx}" cy="${sy}" r="${hit}" fill="transparent"/>
        <rect data-handle="size" x="${sx-5*hs*k}" y="${sy-5*hs*k}" width="${10*hs*k}" height="${10*hs*k}" fill="#b5653a"><title>${tr('拖动调整尺寸','Drag to resize')}</title></rect></g>`;
      const {hh} = aabb(f);
      s += `<text x="${f.cx}" y="${f.cy+hh+24*k}" font-size="${12*k}" text-anchor="middle" fill="#b5653a" font-weight="600" pointer-events="none"
        stroke="#fff" stroke-width="${3*k}" paint-order="stroke">${f.w} × ${f.d}</text>`;
    }
  } else if (ui.sel?.kind === 'room'){
    const r = PLAN.rooms.find(r => r.id === ui.sel.id);
    s += `<polygon points="${r.poly.map(p=>p.join(',')).join(' ')}" fill="rgba(181,101,58,.08)" stroke="#b5653a" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  }
  $('#gSel').innerHTML = s;
}

function renderAll(){
  renderGrid(); renderRooms(); renderFurn(); renderWalls(); renderLabels(); renderMeasure(); renderSel(); renderPanel(); updateHeader();
  getView3D()?.sync();
}

function updateHeader(){
  const tot = PLAN.rooms.filter(r => r.counted !== false).reduce((a,r) => a + area(r.poly), 0);
  $('#subtitle').textContent = tr(`套内使用面积约 ${fmt(tot)} m² · 尺寸单位 mm · 原图比例 1:60`, `Net floor area ≈ ${fmt(tot)} m² · Units: mm · Original scale 1:60`);
  $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length;
  $('#undo').style.opacity = undoStack.length ? 1 : .4; $('#redo').style.opacity = redoStack.length ? 1 : .4;
}
export {buildDefs, renderRooms, renderFurn, renderWalls, renderOpenings, renderLabels, renderDims, renderGrid, renderMeasure, renderSel, renderAll, updateHeader};
