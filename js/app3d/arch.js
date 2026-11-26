/* 3D 建筑：地板 / 天花 / 墙体 / 门 / 窗 / 推拉门 / 灯具，以及按需重建的分块同步 */
import * as THREE from 'three';
import {CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';
import {S, opt, wx, wz, M, WALL_H} from './context.js';
import {PLAN} from '../data.js';
import {state} from '../state.js';
import {ui, esc} from '../ui.js';
import {tr, nm} from '../i18n.js';
import {$} from '../dom.js';
import {area} from '../geometry.js';
import {mat, floorMat} from './materials.js';
import {buildFurniture, box, metal} from './furniture3d.js';
import {applyLight} from './lighting.js';
import {flyTo, isoWhole, flyToRoom} from './camera.js';
import {setMode} from './walk.js';
import {invalidateSel} from './picking.js';

/* ======================= 建筑 ======================= */
function clearGroup(g){ g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); g.clear(); }
function wallBox([x0, y0, x1, y1], yb, yt, m){
  if (yt - yb <= .001) return;
  const o = new THREE.Mesh(new THREE.BoxGeometry(M(x1-x0), yt-yb, M(y1-y0)), m || [S.wallMat, S.wallMat, S.capMat, S.wallMat, S.wallMat, S.wallMat]);
  o.position.set(wx((x0+x1)/2), (yb+yt)/2, wz((y0+y1)/2)); o.castShadow = o.receiveShadow = true; S.archUp.add(o);
  // 漫游辅助：墙体棱线 + 踢脚线，让相邻墙面、墙角一眼可分（仅漫游模式显示）
  const ln = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry), edgeMat); ln.position.copy(o.position); ln.userData.walkOnly = true; ln.visible = opt.mode === 'walk'; S.archUp.add(ln);
  if (yb <= .001){
    const p = o.geometry.parameters, sh = Math.min(.12, yt), sk = new THREE.Mesh(new THREE.BoxGeometry(p.width + .02, sh, p.depth + .02), skirtMat);
    sk.position.set(o.position.x, sh/2, o.position.z); sk.userData.walkOnly = true; sk.visible = opt.mode === 'walk'; S.archUp.add(sk);
  }
}
const edgeMat = new THREE.LineBasicMaterial({color:0x6f675b}), skirtMat = new THREE.MeshStandardMaterial({color:'#8b7f6e', roughness:.6});
function shapeOf(poly, flip){ const s = new THREE.Shape(); poly.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](wx(x), flip ? wz(y) : -wz(y))); return s; }

function buildArch(){
  clearGroup(S.archFloor); clearGroup(S.archUp); S.lampG.clear(); S.doors.length = 0; S.colliders = [];
  const top = opt.cut;
  PLAN.rooms.forEach(r => {
    const m = floorMat(state.rooms[r.id].mat), bay = r.counted === false;
    const geo = bay ? new THREE.ExtrudeGeometry(shapeOf(r.poly), {depth:.45, bevelEnabled:false}) : new THREE.ShapeGeometry(shapeOf(r.poly));
    geo.rotateX(-Math.PI/2);
    const fl = new THREE.Mesh(geo, bay ? [m, mat('#e9e4da')] : m);
    fl.receiveShadow = true; fl.userData.room = r.id;
    if (bay){ fl.castShadow = true; S.archUp.add(fl); } else S.archFloor.add(fl);
    // 天花：法线朝下，只在室内仰视时可见
    const cg = new THREE.ShapeGeometry(shapeOf(r.poly, true)); cg.rotateX(Math.PI/2);
    const ceil = new THREE.Mesh(cg, mat('#fbfaf7', {roughness:1})); ceil.position.y = WALL_H; ceil.visible = top >= WALL_H; S.archUp.add(ceil);
    if (r.at){
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .02, 32), new THREE.MeshStandardMaterial({color:'#fff', emissive:'#fff2d6', emissiveIntensity:.3}));
      lamp.position.set(wx(r.at[0]), WALL_H - .012, wz(r.at[1])); lamp.visible = top >= WALL_H; S.lampG.add(lamp);
      const pl = new THREE.PointLight(0xffd9a8, 0, 7, 1.6); pl.position.set(wx(r.at[0]), WALL_H - .25, wz(r.at[1])); S.lampG.add(pl);
    }
  });
  [...PLAN.doors, ...PLAN.slides].forEach(d => { const [x0, y0, x1, y1] = d.rect; const s = box(M(x1-x0), .012, M(y1-y0), mat('#d8d0c0', {roughness:.3}), wx((x0+x1)/2), 0, wz((y0+y1)/2)); s.castShadow = false; S.archFloor.add(s); });
  PLAN.walls.forEach((w, i) => {
    if (state.demolished.includes('w'+i)) return;
    wallBox(w, 0, w[4] === 'low' ? Math.min(1, top) : top);
    S.colliders.push([wx(w[0]), wz(w[1]), wx(w[2]), wz(w[3])]);
  });
  // 门洞、飘窗洞口上方过梁（方案 JSON 的 lintels 提供额外洞口，如飘窗腔体）
  [...PLAN.doors.map(d => [d.rect, 2.1]), ...PLAN.slides.map(s => [s.rect, s.v ? 2.4 : 2.1]), ...PLAN.lintels.map(l => [l.rect, l.h])]
    .forEach(([r, h]) => { if (top > h) wallBox(r, h, top); });
  PLAN.wins.forEach(r => {
    const sill = r.sill ?? .9, head = 2.4;
    wallBox(r.rect, 0, Math.min(sill, top)); if (top > head) wallBox(r.rect, head, top);
    S.colliders.push([wx(r.rect[0]), wz(r.rect[1]), wx(r.rect[2]), wz(r.rect[3])]);
    const gTop = Math.min(head, top); if (gTop <= sill) return;
    const [x0, y0, x1, y1] = r.rect, hz = (x1-x0) >= (y1-y0), L = M(hz ? x1-x0 : y1-y0), gh = gTop - sill, cx = wx((x0+x1)/2), cz = wz((y0+y1)/2);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(hz ? L : .01, gh, hz ? .01 : L), S.glassMat); pane.position.set(cx, sill + gh/2, cz); S.archUp.add(pane);
    const n = Math.max(1, Math.round(L/.9));
    for (let k = 0; k <= n; k++){ const t = -L/2 + k*L/n, mu = new THREE.Mesh(new THREE.BoxGeometry(hz ? .04 : .06, gh, hz ? .06 : .04), S.frameMat);
      mu.position.set(cx + (hz ? t : 0), sill + gh/2, cz + (hz ? 0 : t)); mu.castShadow = true; S.archUp.add(mu); }
    [sill + .02, gTop - .02].forEach(y => { const tr = new THREE.Mesh(new THREE.BoxGeometry(hz ? L : .06, .04, hz ? .06 : L), S.frameMat); tr.position.set(cx, y, cz); S.archUp.add(tr); });
  });
  PLAN.doors.forEach(d => {
    const pivot = new THREE.Group(), L = M(d.len), dh = Math.min(2.05, top);
    pivot.position.set(wx(d.h[0]), 0, wz(d.h[1]));
    const leaf = box(L, dh, .04, mat(d.entry ? '#6b4f3a' : '#efe6d8', {roughness:.5}), L/2);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), metal()); knob.position.set(L - .07, Math.min(1, dh - .05), 0); knob.scale.z = 2.2;
    pivot.add(leaf, knob);
    const ang = v => Math.atan2(-v[1], v[0]), door = {pivot, a0:ang(d.c), a1:ang(d.o), open:true};
    if (door.a1 - door.a0 > Math.PI) door.a1 -= Math.PI*2; if (door.a0 - door.a1 > Math.PI) door.a1 += Math.PI*2;
    door.cur = door.a1; pivot.rotation.y = door.cur; leaf.userData.door = knob.userData.door = door;
    S.doors.push(door); S.archUp.add(pivot);
  });
  PLAN.slides.forEach(({rect:[x0, y0, x1, y1], v}) => {
    const L = M(v ? y1-y0 : x1-x0), ph = Math.min(v ? 2.4 : 2.1, top), pl = L*.55;
    [[-1, -.02], [1, .02]].forEach(([s, off]) => {
      const c = s < 0 ? -L/2 + pl/2 : L/2 - pl/2, x = v ? wx((x0+x1)/2) + off : wx(x0) + L/2 + c, z = v ? wz(y0) + L/2 + c : wz((y0+y1)/2) + off;
      const p = new THREE.Mesh(new THREE.BoxGeometry(v ? .02 : pl, ph, v ? pl : .02), S.glassMat); p.position.set(x, ph/2, z); S.archUp.add(p);
      [ph - .03, .03].forEach(y => { const fr = new THREE.Mesh(new THREE.BoxGeometry(v ? .04 : pl, .05, v ? pl : .04), S.frameMat); fr.position.set(x, y, z); S.archUp.add(fr); });
      [-1, 1].forEach(e => { const fr = new THREE.Mesh(new THREE.BoxGeometry(.04, ph, .04), S.frameMat); fr.position.set(v ? x : x + e*pl/2, ph/2, v ? z + e*pl/2 : z); S.archUp.add(fr); });
    });
  });
  applyLight(); applyGrow();
}

function buildFurn(){
  clearGroup(S.furnG);
  state.furniture.forEach(f => S.furnG.add(buildFurniture(f)));
  S.furnG.visible = opt.furn; invalidateSel(); applyGrow();
}

function buildLabels(){
  S.labelG.children.slice().forEach(o => { o.element.remove(); S.labelG.remove(o); });
  PLAN.rooms.filter(r => r.at).forEach(r => {
    const el = document.createElement('div'); el.className = 'rlabel';
    el.innerHTML = `${esc(nm(state.rooms[r.id].name))}<small>${area(r.poly).toFixed(1)}m²</small>`;
    const o = new CSS2DObject(el); o.position.set(wx(r.at[0]), opt.cut + .15, wz(r.at[1])); o.visible = S.labelG.visible; S.labelG.add(o);
  });
  const counted = PLAN.rooms.filter(r => r.counted !== false);
  $('#roomList').innerHTML = counted.map(r => `<button data-room="${r.id}"><span>${esc(nm(state.rooms[r.id].name))}</span><small>${area(r.poly).toFixed(2)} m²</small></button>`).join('')
    + `<button data-room="__all"><span>${tr('全屋', 'Whole home')}</span><small>${counted.reduce((a, r) => a + area(r.poly), 0).toFixed(2)} m²</small></button>`;
  document.querySelectorAll('#roomList button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#roomList button').forEach(x => x.classList.toggle('on', x === b));
    if (opt.mode === 'walk') setMode('orbit');
    b.dataset.room === '__all' ? flyTo(isoWhole()) : flyToRoom(b.dataset.room);
  });
}

// 只重建变化的部分
let sigArch = '', sigFurn = '', sigLabels = '';
function sync(force){
  if (!S.inited || (!S.active && !force)) return;
  const a = JSON.stringify([state.rooms, state.demolished, opt.cut]), f = JSON.stringify(state.furniture), l = JSON.stringify([state.rooms, opt.cut]);
  if (force || a !== sigArch){ sigArch = a; buildArch(); }
  if (force || f !== sigFurn){ sigFurn = f; buildFurn(); }
  if (force || l !== sigLabels){ sigLabels = l; buildLabels(); }
}

// CSS2DRenderer 只看标签自身的 visible，不继承父级，所以逐个设置
function showLabels(v){ S.labelG.visible = v; S.labelG.children.forEach(o => o.visible = v); }
function applyGrow(){
  if (!S.inited) return;
  S.archUp.scale.y = Math.max(S.grow, .001);
  S.furnG.scale.y = Math.max(S.furnGrow, .001);
  S.lampG.visible = S.grow > .99;
}

export {clearGroup, buildArch, buildFurn, buildLabels, sync, showLabels, applyGrow};
