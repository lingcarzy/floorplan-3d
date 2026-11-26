/* 应用入口 / 装配层：加载方案 → 初始化状态 → 绑定工具栏、快捷键、2D/3D 切换、方案切换 */
import {loadPlans, loadPlan, plans, PLAN} from './data.js';
import {state, setState, defaultState, fixState, loadStored, snap, commit, resetHistory,
        undoStack, redoStack, undo, redo, mutate, getF} from './state.js';
import {ui, esc, toast} from './ui.js';
import {tr, LANG, setLang, applyStaticLang, s2t} from './i18n.js';
import {$, svg, COARSE} from './dom.js';
import {renderAll, renderOpenings, renderDims, buildDefs, renderMeasure} from './render2d.js';
import {select, setTool, syncModeHint, rotateSel, deleteSel, duplicateSel} from './interact.js';
import {view, applyView, fitView, zoomCenter, setRatio} from './view2d.js';
import {buildLib} from './library.js';
import {clearLayout, drawer, syncPaneBtns} from './panels.js';
import {download, exportPNG} from './exporter.js';
import {is3D, setViewMode, getView3D, setView3D} from './mode.js';

/* ---------- 3D 引擎按需加载（three.js 约 600KB，失败时 2D 仍可用） ---------- */
let v3dPromise = null;
async function ensure3D(){
  if (getView3D()) return getView3D();
  v3dPromise ||= import('./app3d/index.js')
    .then(m => { setView3D(m.View3D); return m.View3D; })
    .catch(e => { v3dPromise = null; console.error(e); return null; });
  return v3dPromise;
}

let switching = false;
const TIPS = () => COARSE
  ? {'2d':tr('点或拖动家具库添加 · 单指拖动平移 · 双指缩放 · 选中家具后底部工具条可旋转 / 复制 / 删除', 'Tap or drag from the library · 1 finger pans · pinch zooms · bottom bar rotates / duplicates / deletes'),
     '3d':tr('单指旋转 · 双指缩放 / 平移 · 点家具或地面编辑 · 点门开关', '1 finger orbits · 2 fingers zoom / pan · tap furniture or floor to edit · tap doors to open')}
  : {'2d':tr('拖动左侧家具到平面图 · 滚轮缩放 · 拖动空白处平移 · T 切换 3D', 'Drag furniture onto the plan · scroll to zoom · drag empty space to pan · T for 3D'),
     '3d':tr('3D 场景与平面方案实时同步 · 右侧面板修改会立即生效 · T 返回 2D', '3D stays in sync with the plan · panel edits apply instantly · T for 2D')};

async function setView(m){
  if (m === (is3D() ? '3d' : '2d') || switching) return;
  if (m === '3d' && !await ensure3D()) return toast(tr('3D 引擎仍在加载或加载失败（需要联网加载 three.js）', '3D engine is still loading or failed to load (three.js needs a network connection)'));
  switching = true; document.body.classList.add('busy');
  try {
    setViewMode(m);
    const v3 = getView3D();
    if (m === '3d'){ if (ui.tool !== 'select') setTool('select'); ui.mA = null; document.body.classList.add('m3d'); await v3.enter(); }
    else { document.body.classList.remove('m3d'); await v3.exit(); applyView(); }
    $('#tip').textContent = TIPS()[m];
  } catch(err){                                   // WebGL 初始化 / 动画失败：回到可用的 2D，别把界面锁死
    console.error(err);
    setViewMode('2d');
    document.body.classList.remove('m3d');
    $('#stage').classList.remove('is3d', 'animating');
    $('#tip').textContent = TIPS()['2d'];
    toast(tr('3D 场景启动失败，已返回平面图', 'Could not start the 3D scene — returned to the plan'));
  } finally {
    switching = false; document.body.classList.remove('busy');
  }
}

/* ---------- 方案切换 ---------- */
const planLabel = p => LANG === 'en' ? p.nameEn : LANG === 'zht' ? s2t(p.name) : p.name;
function buildPlanSel(){
  $('#planSel').innerHTML = plans.map(p => `<option value="${p.id}" ${p.id === PLAN.id ? 'selected' : ''}>${esc(planLabel(p))}</option>`).join('');
}
function updateBrand(){
  $('#brandTitle').textContent = planLabel(PLAN);
}
async function switchPlan(id){
  if (id === PLAN.id) return;
  await loadPlan(id);
  setState(loadStored() || defaultState());
  resetHistory(); ui.sel = null; ui.mA = null;
  buildPlanSel(); updateBrand();
  buildDefs(); buildLib();                       // 户型可带自己的材料表 / 家具目录，需随方案重建
  renderOpenings(); renderDims();                // 标注链 / 入户箭头随方案变化，renderAll 不含这两项
  fitView(); renderAll();
  const v3 = getView3D();
  if (v3){ v3.reloadPlan(); if (is3D()) $('#tip').textContent = TIPS()['3d']; }
  toast(tr(`已切换到「${planLabel(PLAN)}」`, `Switched to "${planLabel(PLAN)}"`));
}

/* ---------- 全屏 ---------- */
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFullscreen(){
  const de = document.documentElement;
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!req) return toast(tr('当前浏览器不支持网页全屏，可在 Safari 中「添加到主屏幕」后以全屏方式打开', 'Fullscreen is not supported here — in Safari, use "Add to Home Screen" to open it fullscreen'));
    Promise.resolve(req.call(de)).catch(() => toast(tr('无法进入全屏', 'Could not enter fullscreen')));
  }
}
function syncFullscreen(){
  const on = !!fsEl(), b = $('#fullscreen');
  b.textContent = '⛶ ' + (on ? tr('退出全屏', 'Exit fullscreen') : tr('全屏', 'Fullscreen'));
  b.title = (on ? tr('退出全屏', 'Exit fullscreen') : tr('全屏', 'Fullscreen')) + ' (Shift+F)';
}

/* ---------- 键盘快捷键 ---------- */
document.addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea')) return;
  if (getView3D()?.walking()) return;
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (mod && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y'){ e.preventDefault(); redo(); return; }
  if (mod && k === 'd'){ e.preventDefault(); duplicateSel(); return; }
  if (mod) return;
  if (k === '[' || k === ']'){ drawer(k === '[' ? 'lib' : 'panel'); return; }
  if (k === 'f' && e.shiftKey){ toggleFullscreen(); return; }
  if (k === 't') setView(is3D() ? '2d' : '3d');
  else if (is3D() && ['v','m','x','f','+','=','-'].includes(k)) return;
  else if (k === 'v') setTool('select');
  else if (k === 'm') setTool('measure');
  else if (k === 'x') setTool('demolish');
  else if (k === 'f') fitView();
  else if (k === 'r') rotateSel(e.shiftKey ? -90 : 90);
  else if (k === 'delete' || k === 'backspace'){ e.preventDefault(); deleteSel(); }
  else if (k === 'escape'){ if (ui.mA){ ui.mA = null; renderMeasure(); } else { if (ui.tool !== 'select') setTool('select'); select(null); } }
  else if (k.startsWith('arrow') && ui.sel?.kind === 'furn'){
    e.preventDefault(); const st = e.shiftKey ? 100 : 10;
    mutate(() => { const f = getF(ui.sel.id); if (k==='arrowleft') f.cx -= st; if (k==='arrowright') f.cx += st; if (k==='arrowup') f.cy -= st; if (k==='arrowdown') f.cy += st; });
  }
  else if (k === '+' || k === '=') zoomCenter(1.25);
  else if (k === '-') zoomCenter(.8);
});

/* ---------- 语言切换 ---------- */
function applyLang(l){
  setLang(l);
  syncFullscreen(); syncModeHint(); syncPaneBtns();
  updateBrand(); buildPlanSel();
  buildLib(); renderOpenings(); renderAll();
  $('#tip').textContent = TIPS()[is3D() ? '3d' : '2d'];
  getView3D()?.relang();
}
$('#langSel').onclick = e => { const l = e.target.closest('[data-lang]')?.dataset.lang; if (l && l !== LANG) applyLang(l); };

/* ---------- 装配 ---------- */
async function boot(){
  await loadPlans();
  await loadPlan(plans[0]?.id || 'default');
  setState(loadStored() || defaultState());

  applyStaticLang(); updateBrand(); buildPlanSel();
  syncFullscreen(); syncPaneBtns();
  buildDefs(); buildLib(); renderOpenings(); renderDims();
  $('#tip').textContent = TIPS()['2d'];
  fitView(); renderAll();

  document.querySelectorAll('.menu-pop .btn').forEach(b => b.addEventListener('click', () => b.closest('details').open = false));
  document.querySelectorAll('#viewSeg .btn').forEach(b => b.onclick = () => setView(b.dataset.view));
  document.querySelectorAll('#tools .btn').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  document.querySelectorAll('#layers .btn').forEach(b => b.onclick = () => {
    const k = b.dataset.layer; ui.layers[k] = !ui.layers[k]; b.classList.toggle('on', ui.layers[k]);
    if (k === 'dims') $('#gDims').setAttribute('display', ui.layers.dims ? 'inline' : 'none');
    else if (k !== 'wallSnap') renderAll();
  });
  $('#zoomIn').onclick = () => zoomCenter(1.25);
  $('#zoomOut').onclick = () => zoomCenter(.8);
  $('#fit').onclick = fitView;
  $('#s60').onclick = () => { setRatio(60); toast(tr('已按 1:60 显示', 'Showing at 1:60')); };
  $('#s100').onclick = () => setRatio(100);
  $('#undo').onclick = undo; $('#redo').onclick = redo;
  $('#clearAll').onclick = clearLayout;
  $('#fullscreen').onclick = toggleFullscreen;
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(t => document.addEventListener(t, syncFullscreen));
  // 已从主屏幕以独立 App 方式打开时本就是全屏，隐藏按钮
  if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) $('#fullscreen').hidden = true;
  $('#tgLib').onclick = () => drawer('lib');
  $('#tgPanel').onclick = () => drawer('panel');
  // 触屏上点菜单以外的地方收起「文件」菜单
  document.addEventListener('pointerdown', e => { const m = $('details.menu'); if (m.open && !m.contains(e.target)) m.open = false; });
  matchMedia('(max-width:1100px)').addEventListener('change', () => drawer(null));
  drawer(null);                                  // 恢复上次的面板收起状态
  $('#exportPng').onclick = exportPNG;
  $('#exportJson').onclick = () => download(tr('户型装修方案', 'floor-plan-design') + '.json', new Blob([JSON.stringify(state, null, 2)], {type:'application/json'}));
  $('#importJson').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(txt => {
      try { const s = JSON.parse(txt); if (!Array.isArray(s.furniture)) throw 0; const b = snap(); setState(fixState(s)); ui.sel = null; commit(b); renderAll(); toast(tr('方案已导入', 'Plan imported')); }
      catch(err){ toast(tr('文件格式不正确', 'Invalid file format')); }
    });
    e.target.value = '';
  };
  $('#reset').onclick = () => { if (confirm(tr('恢复为默认设计方案？（可撤销）', 'Reset to the default design? (undoable)'))){ const b = snap(); setState(defaultState()); ui.sel = null; commit(b); renderAll(); } };
  $('#planSel').onchange = e => switchPlan(e.target.value).catch(err => {
    console.error(err); buildPlanSel(); toast(tr('方案加载失败', 'Could not load the plan'));
  });

  // 横竖屏切换、表头换行等都会改变画布尺寸；尺寸从 0 恢复（如首次布局）时重新适应窗口
  // 其余尺寸变化（收起 / 展开面板等）保持画面中心不动
  let lastW = 0, lastH = 0;
  new ResizeObserver(() => {
    const w = svg.clientWidth, h = svg.clientHeight; if (!w) return;
    if (!lastW) fitView();
    else { view.x0 -= (w - lastW)/2/view.s; view.y0 -= (h - lastH)/2/view.s; applyView(); }
    lastW = w; lastH = h;
  }).observe(svg);
}

boot().catch(err => { console.error(err); toast('初始化失败：' + err.message); });
