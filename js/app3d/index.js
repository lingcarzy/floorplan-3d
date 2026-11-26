/* 3D 场景入口：初始化 three.js、2D↔3D 过渡、主循环，导出 View3D API。
 * 2D → 3D：相机先以正俯视对齐当前 2D 视口（比例、位置一致），交叉淡入后镜头倾斜环绕、
 *          墙体从地面升起、家具随后立起；3D → 2D 反向。 */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PointerLockControls} from 'three/addons/controls/PointerLockControls.js';
import {CSS2DRenderer} from 'three/addons/renderers/CSS2DRenderer.js';
import {S, opt, stage, host, FOV, wx, wz, SW, SH} from './context.js';
import {snap, commit, getF} from '../state.js';
import {ui} from '../ui.js';
import {tr} from '../i18n.js';
import {$, COARSE, TAP} from '../dom.js';
import {clamp01} from '../geometry.js';
import {renderAll} from '../render2d.js';
import {snapMove} from '../snap.js';
import {closeDrawers} from '../panels.js';
import {select} from '../interact.js';
import {mat, initEnv, resetFloorMats} from './materials.js';
import {buildArch, buildFurn, buildLabels, sync, showLabels, applyGrow} from './arch.js';
import {applyLight} from './lighting.js';
import {planPose, isoFrom, isoWhole, topWhole, curPose, camTween, setPose, animate, wait, flyTo, flyToRoom, ease} from './camera.js';
import {pick, groundAt, updateSel} from './picking.js';
import {HINT_ORBIT, touchWalk, lookBy, startTouchWalk, stopTouchWalk, bindJoystick, setMode, stepWalk, syncModeBtns, syncCutBtns, syncWalkTexts} from './walk.js';

function init(){
  if (S.inited) return; S.inited = true;
  S.renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  S.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  S.renderer.setSize(SW(), SH());
  S.renderer.shadowMap.enabled = true; S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping; S.renderer.toneMappingExposure = 1.05;
  host.prepend(S.renderer.domElement);
  S.labelRenderer = new CSS2DRenderer();
  S.labelRenderer.setSize(SW(), SH());
  Object.assign(S.labelRenderer.domElement.style, {position:'absolute', inset:'0', pointerEvents:'none'});
  host.appendChild(S.labelRenderer.domElement);

  S.scene = new THREE.Scene();
  S.camera = new THREE.PerspectiveCamera(FOV, SW()/SH(), .05, 300);
  S.orbit = new OrbitControls(S.camera, S.renderer.domElement);
  S.orbit.enableDamping = true; S.orbit.maxPolarAngle = Math.PI*.495; S.orbit.minDistance = 1.5; S.orbit.maxDistance = 45;
  S.walkCtl = new PointerLockControls(S.camera, document.body);
  S.walkCtl.addEventListener('lock', () => { $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'block'; });
  S.walkCtl.addEventListener('unlock', () => { if (opt.mode === 'walk'){ $('#walkOverlay').style.display = 'flex'; $('#cross').style.display = 'none'; } });

  S.hemi = new THREE.HemisphereLight(0xfff8ee, 0xb9a88f, 1.1);
  S.sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
  S.sun.castShadow = true; S.sun.shadow.mapSize.setScalar(COARSE ? 2048 : 4096);   // 平板 GPU 用小一点的阴影贴图
  Object.assign(S.sun.shadow.camera, {left:-11, right:11, top:11, bottom:-11, near:1, far:60});
  S.sun.shadow.bias = -0.0004; S.sun.shadow.normalBias = 0.02;
  S.ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({color:0xf2eee7, roughness:1}));
  S.ground.rotation.x = -Math.PI/2; S.ground.position.y = -0.015; S.ground.receiveShadow = true;
  S.scene.add(S.hemi, S.sun, S.sun.target, S.ground);

  initEnv(S.renderer);
  S.glassMat = new THREE.MeshPhysicalMaterial({color:0xcfe6ef, roughness:.05, transparent:true, opacity:.28, depthWrite:false, side:THREE.DoubleSide});
  S.wallMat = mat('#f4f1eb', {roughness:.92}); S.capMat = mat('#34312d', {roughness:.9}); S.frameMat = mat('#5d6166', {roughness:.5, metalness:.4});

  S.archFloor = new THREE.Group(); S.archUp = new THREE.Group(); S.furnG = new THREE.Group(); S.labelG = new THREE.Group(); S.lampG = new THREE.Group();
  S.scene.add(S.archFloor, S.archUp, S.furnG, S.labelG, S.lampG);

  const cv = S.renderer.domElement; let downAt = null, look = null;
  cv.addEventListener('pointerdown', e => {
    downAt = [e.clientX, e.clientY]; closeDrawers();
    if (touchWalk && !look){ look = {id:e.pointerId, x:e.clientX, y:e.clientY}; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => {
    if (!look || e.pointerId !== look.id) return;
    lookBy(e.clientX - look.x, e.clientY - look.y); look.x = e.clientX; look.y = e.clientY;
  });
  cv.addEventListener('pointercancel', e => { if (look?.id === e.pointerId) look = null; });

  // 按住已选中的家具拖动：沿地面摆放（与 2D 共用网格和贴墙吸附）。
  // 在父元素上用捕获阶段监听，赶在 OrbitControls 之前关掉它，避免同时旋转镜头
  let fdrag = null;
  host.addEventListener('pointerdown', e => {
    if (e.target !== cv || !e.isPrimary || S.anim || opt.mode !== 'orbit' || ui.sel?.kind !== 'furn') return;
    const h = pick(e), f = h?.fid === ui.sel.id && getF(h.fid), g = f && groundAt(e.clientX, e.clientY);
    if (!g) return;
    fdrag = {id:f.id, pid:e.pointerId, sx:e.clientX, sy:e.clientY, ox:g.x - f.cx, oy:g.y - f.cy, before:snap(), moved:false};
    S.orbit.enabled = false; S.fly = null; cv.setPointerCapture(e.pointerId);
  }, true);
  cv.addEventListener('pointermove', e => {
    if (!fdrag || e.pointerId !== fdrag.pid) return;
    if (!fdrag.moved && Math.hypot(e.clientX - fdrag.sx, e.clientY - fdrag.sy) < TAP) return;
    const f = getF(fdrag.id), g = groundAt(e.clientX, e.clientY); if (!f || !g) return;
    fdrag.moved = true; cv.style.cursor = 'grabbing';
    [f.cx, f.cy] = snapMove(f, g.x - fdrag.ox, g.y - fdrag.oy);
    S.furnG.children.find(o => o.userData.fid === f.id)?.position.set(wx(f.cx), 0, wz(f.cy));   // 拖动中只挪模型，松手再整体同步
  });
  const endF = e => {
    if (!fdrag || e.pointerId !== fdrag.pid) return;
    const d = fdrag; fdrag = null; S.orbit.enabled = true; cv.style.cursor = '';
    if (d.moved){ commit(d.before); renderAll(); }
  };
  cv.addEventListener('pointerup', endF); cv.addEventListener('pointercancel', endF);

  cv.addEventListener('pointerup', e => {
    const tap = downAt && Math.hypot(e.clientX-downAt[0], e.clientY-downAt[1]) <= TAP;
    if (look?.id === e.pointerId){
      look = null;
      if (tap){ const h = pick(e); if (h?.door && h.dist < 3.5) h.door.open = !h.door.open; }   // 漫游时点门开关
      return;
    }
    if (S.anim || opt.mode !== 'orbit' || !tap) return;
    const h = pick(e);
    if (h?.door) h.door.open = !h.door.open;
    else if (h?.fid) select({kind:'furn', id:h.fid});
    else if (h?.room) select({kind:'room', id:h.room});
    else select(null);
  });
  new ResizeObserver(() => {
    S.renderer.setSize(SW(), SH()); S.labelRenderer.setSize(SW(), SH());
    S.camera.aspect = SW()/SH(); S.camera.updateProjectionMatrix();
  }).observe(stage);
  bindUI();
}

async function enter(){
  init(); S.active = true;
  S.renderer.setSize(SW(), SH()); S.labelRenderer.setSize(SW(), SH()); S.camera.aspect = SW()/SH(); S.camera.updateProjectionMatrix();
  sync(true);
  opt.mode = 'orbit'; S.orbit.enabled = false; showLabels(false);
  const A = planPose(), B = isoFrom(A);
  S.grow = 0; S.furnGrow = 0; applyGrow(); setPose(A);
  stage.classList.add('animating');
  startLoop(); S.renderer.render(S.scene, S.camera);
  stage.classList.add('is3d');                       // 交叉淡入：此刻 3D 画面与 2D 平面完全重合
  await wait(420);
  await animate(1700, t => {
    camTween(A, B, ease(clamp01(t/.85)));
    S.grow = ease(clamp01((t - .1)/.55));
    S.furnGrow = ease(clamp01((t - .45)/.5));
    applyGrow();
  });
  S.orbit.enabled = true; showLabels(opt.labels);
  stage.classList.remove('animating');
}
async function exit(){
  if (opt.mode === 'walk'){ S.walkCtl.unlock(); stopTouchWalk(); $('#hint3d').textContent = HINT_ORBIT(); $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'none';
    const dir = new THREE.Vector3(); S.camera.getWorldDirection(dir); S.orbit.target.copy(S.camera.position).addScaledVector(dir, 3).setY(0); opt.mode = 'orbit'; syncModeBtns(); }
  S.fly = null; S.orbit.enabled = false; showLabels(false); stage.classList.add('animating');
  const A = curPose(), B = planPose();
  await animate(1300, t => {
    camTween(A, B, ease(clamp01((t - .1)/.9)));
    S.furnGrow = 1 - ease(clamp01(t/.45));
    S.grow = 1 - ease(clamp01((t - .2)/.6));
    applyGrow();
  });
  stage.classList.remove('is3d');                    // 此刻 3D 已压平为正俯视，与 2D 重合后淡出
  await wait(450);
  S.active = false; cancelAnimationFrame(S.raf); S.raf = 0;
  stage.classList.remove('animating');
  S.grow = S.furnGrow = 1; applyGrow();
}

function bindUI(){
  document.querySelectorAll('#modes3d .btn').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  // 触屏设备用摇杆漫游；桌面端锁定鼠标，锁定失败时也退回到摇杆
  $('#walkOverlay').onclick = () => COARSE ? startTouchWalk() : S.walkCtl.lock();
  document.addEventListener('pointerlockerror', () => { if (S.active && opt.mode === 'walk') startTouchWalk(); });
  $('#walkExit').onclick = () => setMode('orbit');
  bindJoystick();
  syncWalkTexts();
  $('#vIso').onclick = () => { if (opt.mode === 'walk') setMode('orbit'); else flyTo(isoWhole()); };
  $('#vTop').onclick = () => { if (opt.mode === 'walk') setMode('orbit'); flyTo(topWhole()); };
  document.querySelectorAll('[data-cut]').forEach(b => b.onclick = () => { if (opt.mode === 'walk') return; opt.cut = +b.dataset.cut; syncCutBtns(); sync(); });
  document.querySelectorAll('#toggles3d .btn').forEach(b => b.onclick = () => {
    const k = b.dataset.t; opt[k] = !opt[k]; b.classList.toggle('on', opt[k]);
    if (k === 'furn'){ S.furnG.visible = opt.furn; if (!opt.furn && ui.sel?.kind === 'furn') select(null); }
    if (k === 'labels') showLabels(opt.labels && opt.mode === 'orbit' && !S.anim);
    if (k === 'night') applyLight();
  });
  $('#sun').oninput = e => { opt.hour = +e.target.value; applyLight(); };
}

/* ======================= 主循环 ======================= */
const clock = new THREE.Clock();
function startLoop(){ if (!S.raf){ clock.getDelta(); S.raf = requestAnimationFrame(loop); } }
function loop(){
  S.raf = requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), .05), now = performance.now();
  if (S.anim){ const t = clamp01((now - S.anim.t0)/S.anim.dur); S.anim.fn(t); if (t >= 1){ const r = S.anim.res; S.anim = null; r(); } }
  else if (S.fly){ const t = clamp01((now - S.fly.t0)/S.fly.dur); camTween(S.fly.A, S.fly.B, ease(t)); if (t >= 1) S.fly = null; }
  else if (opt.mode === 'orbit') S.orbit.update();
  else stepWalk(dt);
  S.doors.forEach(d => { const tg = d.open ? d.a1 : d.a0; d.cur += (tg - d.cur) * Math.min(1, dt*6); d.pivot.rotation.y = d.cur; });
  updateSel();
  S.renderer.render(S.scene, S.camera);
  S.labelRenderer.render(S.scene, S.camera);
}

function shot(){ const a = document.createElement('a'); a.download = tr('户型装修方案', 'floor-plan-design') + '-3D.png'; a.href = S.renderer.domElement.toDataURL('image/png'); a.click(); }

function relang(){ syncWalkTexts(); if (S.inited) buildLabels(); }

/* 切换户型后整体重建（漫游中先回到鸟瞰） */
function reloadPlan(){
  if (opt.mode === 'walk') setMode('orbit');
  resetFloorMats();
  sync(true);
}

export const View3D = {enter, exit, relang, sync:() => sync(), shot, groundAt, flyToRoom:id => S.active && !S.anim && flyToRoom(id),
  walking:() => S.active && opt.mode === 'walk', reloadPlan};
