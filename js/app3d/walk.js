/* 漫游模式：桌面指针锁定 / 触屏摇杆 + 碰撞；以及 3D 工具栏的同步函数 */
import * as THREE from 'three';
import {S, opt, wx, wz, WALL_H} from './context.js';
import {PLAN} from '../data.js';
import {tr} from '../i18n.js';
import {$, COARSE} from '../dom.js';
import {clamp01} from '../geometry.js';
import {select} from '../interact.js';
import {sync, showLabels} from './arch.js';
import {pick} from './picking.js';
import {flyTo, isoWhole} from './camera.js';

const HINT_ORBIT = () => COARSE ? tr('单指旋转 · 双指缩放 / 平移 · 点选家具后可拖动摆放 · 点门开关', '1 finger orbits · 2 fingers zoom / pan · select furniture to drag it · tap doors to open')
  : tr('左键旋转 · 右键平移 · 滚轮缩放 · 选中家具后拖动可摆放 · 点击门开关', 'Left-drag orbits · right-drag pans · scroll zooms · select furniture to drag it · click doors to open');
const HINT_TOUCHWALK = () => tr('左下摇杆移动 · 拖动画面转向 · 点门开关', 'Joystick moves · drag to look · tap doors to open');
const HINT_WALK = () => tr('WASD 移动 · 鼠标转向 · Shift 快走 · E 开关门 · Esc 暂停', 'WASD moves · mouse looks · Shift runs · E opens doors · Esc pauses');
function syncHint3d(){ $('#hint3d').textContent = opt.mode === 'orbit' ? HINT_ORBIT() : touchWalk ? HINT_TOUCHWALK() : HINT_WALK(); }
let touchWalk = false;
const joy = {x:0, y:0, id:null}, eul = new THREE.Euler(0, 0, 0, 'YXZ'), keys = {};
function lookBy(dx, dy){
  eul.setFromQuaternion(S.camera.quaternion);
  eul.y += dx * .005; eul.x = THREE.MathUtils.clamp(eul.x + dy * .005, -1.35, 1.35);
  S.camera.quaternion.setFromEuler(eul);
}
function startTouchWalk(){
  touchWalk = true;
  $('#walkOverlay').style.display = 'none'; $('#joy').style.display = 'block'; $('#walkExit').style.display = 'block';
  syncHint3d();
}
function stopTouchWalk(){
  touchWalk = false; joy.x = joy.y = 0; joy.id = null; $('#joy i').style.transform = '';
  $('#joy').style.display = 'none'; $('#walkExit').style.display = 'none';
}
function bindJoystick(){
  const el = $('#joy'), knob = $('#joy i'), R = 50;
  const upd = e => {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2);
    const L = Math.hypot(dx, dy); if (L > R){ dx *= R/L; dy *= R/L; }
    joy.x = dx/R; joy.y = dy/R; knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); joy.id = e.pointerId; el.setPointerCapture(e.pointerId); upd(e); });
  el.addEventListener('pointermove', e => { if (e.pointerId === joy.id) upd(e); });
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function setMode(m){
  if (S.anim) return;
  opt.mode = m; syncModeBtns();
  if (m === 'walk'){
    select(null);
    if (opt.cut < WALL_H){ opt.cut = WALL_H; syncCutBtns(); sync(); }
    S.orbit.enabled = false; S.fly = null;
    const sp = PLAN.entry?.spawn ?? [0, 0], lk = PLAN.entry?.look ?? [0, 0];   // 入户门外（方案 JSON 的 entry）
    S.camera.position.set(wx(sp[0]), 1.6, wz(sp[1])); S.camera.lookAt(wx(lk[0]), 1.5, wz(lk[1]));
    $('#walkOverlay').style.display = 'flex';
    syncHint3d();
  } else {
    S.walkCtl.unlock(); stopTouchWalk(); S.orbit.enabled = true;
    $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'none';
    syncHint3d();
    S.orbit.target.set(0, 0, 0); flyTo(isoWhole());
  }
  showLabels(opt.labels && m === 'orbit');
  S.archUp.traverse(o => { if (o.userData.walkOnly) o.visible = m === 'walk'; });
}
function blocked(x, z, r = .22){
  for (const [x0, z0, x1, z1] of S.colliders) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
  for (const d of S.doors){
    const a = d.pivot.rotation.y, px = d.pivot.position.x, pz = d.pivot.position.z, ex = px + Math.cos(a)*.9, ez = pz - Math.sin(a)*.9;
    const t = clamp01(((x-px)*(ex-px) + (z-pz)*(ez-pz)) / ((ex-px)**2 + (ez-pz)**2));
    if (Math.hypot(x - (px + t*(ex-px)), z - (pz + t*(ez-pz))) < r*.8) return true;
  }
  return false;
}
function stepWalk(dt){
  if (!S.walkCtl.isLocked && !touchWalk) return;
  const sp = (keys.ShiftLeft || keys.ShiftRight ? 2.6 : 1.4) * dt, fwd = new THREE.Vector3();
  S.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) mv.add(fwd); if (keys.KeyS || keys.ArrowDown) mv.sub(fwd);
  if (keys.KeyD || keys.ArrowRight) mv.add(right); if (keys.KeyA || keys.ArrowLeft) mv.sub(right);
  if (touchWalk){ mv.addScaledVector(fwd, -joy.y).addScaledVector(right, joy.x); }
  const mag = Math.min(1, mv.length());        // 摇杆推得越远走得越快
  if (mag < .05) return;
  mv.normalize().multiplyScalar(sp * mag);
  const p = S.camera.position;
  if (!blocked(p.x + mv.x, p.z)) p.x += mv.x;
  if (!blocked(p.x, p.z + mv.z)) p.z += mv.z;
}
addEventListener('keydown', e => {
  if (!S.active || e.target.matches('input,select,textarea')) return;
  keys[e.code] = true;
  if (opt.mode === 'walk' && e.code === 'KeyE'){ const h = pick(); if (h?.door && h.dist < 2.5) h.door.open = !h.door.open; }
});
addEventListener('keyup', e => keys[e.code] = false);

/* ---------- 3D 工具栏同步 ---------- */
function syncModeBtns(){ document.querySelectorAll('#modes3d .btn').forEach(b => b.classList.toggle('on', b.dataset.mode === opt.mode)); }
function syncCutBtns(){ document.querySelectorAll('[data-cut]').forEach(b => b.classList.toggle('on', +b.dataset.cut === opt.cut)); }
function syncWalkTexts(){
  const t = COARSE
    ? [tr('点击开始，从入户门进入', 'Tap to start at the front door'), tr('左下摇杆移动 · 在画面上拖动转向', 'Joystick moves · drag on screen to look'),
       tr('点门开关 · 点「退出漫游」回到鸟瞰', 'Tap doors to open · "Exit walk" returns to orbit')]
    : [tr('点击开始，从入户门进入', 'Click to start at the front door'),
       tr('<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> 移动 · 鼠标转向 · <kbd>Shift</kbd> 快走', '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move · mouse looks · <kbd>Shift</kbd> runs'),
       tr('<kbd>E</kbd> 开关正前方的门 · <kbd>Esc</kbd> 暂停', '<kbd>E</kbd> opens the door ahead · <kbd>Esc</kbd> pauses')];
  t.forEach((h, i) => $('#wo' + (i + 1)).innerHTML = h);
  syncHint3d();
}
export {HINT_ORBIT, HINT_TOUCHWALK, HINT_WALK, syncHint3d, lookBy, startTouchWalk, stopTouchWalk,
        bindJoystick, setMode, blocked, stepWalk, syncModeBtns, syncCutBtns, syncWalkTexts, touchWalk};
