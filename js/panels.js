/* 右侧属性面板（总览 / 房间 / 家具）与底部浮动工具条、侧栏开合 */
import {PLAN} from './data.js';
import {state, mutate, getF} from './state.js';
import {ui, esc, toast} from './ui.js';
import {tr, nm} from './i18n.js';
import {$, COARSE, narrow} from './dom.js';
import {area, perim, bbox, fmt, norm} from './geometry.js';
import {select, rotateSel, deleteSel, duplicateSel} from './interact.js';
import {is3D, getView3D} from './mode.js';

function renderPanel(){
  renderFab();
  const p = $('#panel');
  if (ui.sel?.kind === 'furn'){ const f = getF(ui.sel.id); if (f){ p.innerHTML = furnPanel(f); bindFurnPanel(f); return; } }
  if (ui.sel?.kind === 'room'){ p.innerHTML = roomPanel(PLAN.rooms.find(r => r.id === ui.sel.id)); bindRoomPanel(); return; }
  p.innerHTML = overviewPanel(); bindOverview();
}

function overviewPanel(){
  const rows = PLAN.rooms.map(r => {
    const st = state.rooms[r.id];
    return `<tr class="click" data-room="${r.id}"><td><span class="sw" style="background:${PLAN.mats[st.mat].sw}"></span>${esc(nm(st.name))}${r.counted===false?' <span class="muted">*</span>':''}</td>
      <td class="r">${fmt(area(r.poly))} m²</td></tr>`;
  }).join('');
  const tot = PLAN.rooms.filter(r => r.counted !== false).reduce((a,r) => a + area(r.poly), 0);
  const byMat = {};
  PLAN.rooms.forEach(r => { const m = state.rooms[r.id].mat; byMat[m] = (byMat[m]||0) + area(r.poly); });
  let cost = 0;
  const matRows = Object.entries(byMat).map(([m,a]) => { const c = a*PLAN.mats[m].price*1.05; cost += c;
    return `<tr><td><span class="sw" style="background:${PLAN.mats[m].sw}"></span>${nm(PLAN.mats[m].name)}</td><td class="r">${fmt(a,1)} m²</td><td class="r">¥${Math.round(c).toLocaleString()}</td></tr>`; }).join('');
  const dem = state.demolished.map(id => PLAN.walls[+id.slice(1)]);
  const demLen = dem.reduce((a,w) => a + Math.max(w[2]-w[0], w[3]-w[1]), 0) / 1000;
  return `
  <section><h3>${tr('房间面积','Room Areas')} <small>${tr('点击查看 / 更换地面','Click to view / change flooring')}</small></h3>
    <table>${rows}</table>
    <div class="total"><span>${tr('套内使用面积','Net floor area')}</span><b>${fmt(tot)} m²</b></div>
    <div class="muted" style="font-size:11px;margin-top:4px">${tr('* 飘窗不计入使用面积；面积按墙体内净尺寸计算','* Bay windows are excluded; areas use net inner wall dimensions')}</div></section>
  <section><h3>${tr('地面材料估算','Flooring Estimate')} <small>${tr('含 5% 损耗','incl. 5% waste')}</small></h3>
    <table>${matRows}</table>
    <div class="total"><span>${tr('地面材料合计','Flooring total')}</span><b>¥${Math.round(cost).toLocaleString()}</b></div></section>
  <section><h3>${tr('方案统计','Plan Stats')}</h3>
    <div class="stats"><div><small>${tr('家具数量','Furniture')}</small><span class="big">${state.furniture.length}</span></div>
      <div><small>${tr('拆除墙体','Walls removed')}</small><span class="big">${fmt(demLen,1)}</span> m</div></div>
    <div class="actions"><button class="btn" id="clearMeasure">${tr('清除测量','Clear measures')} (${state.measures.length})</button>
      <button class="btn danger" id="clearFurn">${tr('清空布置','Clear layout')}</button></div></section>
  ${COARSE ? tr(`<section><h3>触屏操作</h3><div class="kbd">
    <kbd>单指拖动</kbd><span>空白处平移画面</span><kbd>双指</kbd><span>捏合缩放、拖动平移</span>
    <kbd>家具库</kbd><span>点一下放到画面中央，或按住向右拖到指定位置</span>
    <kbd>点家具</kbd><span>选中后拖动移动；拖顶部圆点旋转、右下方块改尺寸</span>
    <kbd>工具条</kbd><span>选中后底部可旋转 / 复制 / 删除</span>
    <kbd>测量</kbd><span>按住拖出一条线，或依次点两点</span>
    <kbd>3D 漫游</kbd><span>左下摇杆移动，拖动屏幕转向，点门开关</span>
  </div></section>`, `<section><h3>Touch Controls</h3><div class="kbd">
    <kbd>1-finger drag</kbd><span>Pan on empty space</span><kbd>2 fingers</kbd><span>Pinch to zoom, drag to pan</span>
    <kbd>Library</kbd><span>Tap to place at center, or hold and drag right to a spot</span>
    <kbd>Tap item</kbd><span>Drag to move; top dot rotates, bottom-right square resizes</span>
    <kbd>Toolbar</kbd><span>Bottom bar can rotate / duplicate / delete</span>
    <kbd>Measure</kbd><span>Hold and drag a line, or tap two points</span>
    <kbd>3D walk</kbd><span>Joystick moves, drag to look, tap doors to open</span>
  </div></section>`) : ''}
  ${tr(`<section><h3>键盘快捷键</h3><div class="kbd">
    <kbd>拖拽</kbd><span>左侧家具拖入平面图</span><kbd>V</kbd><span>选择 / 移动</span><kbd>M</kbd><span>测量（Shift 水平/垂直）</span>
    <kbd>X</kbd><span>拆改非承重墙（黑色为承重墙）</span><kbd>R</kbd><span>旋转 90°（Shift 反向）</span><kbd>方向键</kbd><span>微调 10mm（Shift 100mm）</span>
    <kbd>⌘/Ctrl D</kbd><span>复制</span><kbd>Delete</kbd><span>删除</span><kbd>⌘/Ctrl Z</kbd><span>撤销</span><kbd>T</kbd><span>切换 2D / 3D</span><kbd>F</kbd><span>适应窗口</span><kbd>Esc</kbd><span>取消选择</span>
  </div></section>`, `<section><h3>Keyboard Shortcuts</h3><div class="kbd">
    <kbd>Drag</kbd><span>Drag furniture onto the plan</span><kbd>V</kbd><span>Select / move</span><kbd>M</kbd><span>Measure (Shift: horizontal/vertical)</span>
    <kbd>X</kbd><span>Demolish non-bearing walls (black = bearing)</span><kbd>R</kbd><span>Rotate 90° (Shift reverses)</span><kbd>Arrows</kbd><span>Nudge 10mm (Shift 100mm)</span>
    <kbd>⌘/Ctrl D</kbd><span>Duplicate</span><kbd>Delete</kbd><span>Delete</span><kbd>⌘/Ctrl Z</kbd><span>Undo</span><kbd>T</kbd><span>Toggle 2D / 3D</span><kbd>F</kbd><span>Fit to window</span><kbd>Esc</kbd><span>Deselect</span>
  </div></section>`)}`;
}
function bindOverview(){
  document.querySelectorAll('#panel tr[data-room]').forEach(tr => tr.onclick = () => { select({kind:'room', id:tr.dataset.room}); if (is3D()) getView3D()?.flyToRoom(tr.dataset.room); });
  $('#clearMeasure').onclick = () => state.measures.length && mutate(() => state.measures = []);
  $('#clearFurn').onclick = clearLayout;
}

// 底部浮动工具条：触屏没有键盘，旋转 / 复制 / 删除都放在这里
function renderFab(){
  const fab = $('#fab'), f = ui.sel?.kind === 'furn' && getF(ui.sel.id), r = ui.sel?.kind === 'room' && PLAN.rooms.find(r => r.id === ui.sel.id);
  if (!f && !r){ fab.classList.remove('show'); return; }
  fab.innerHTML = f
    ? `<span class="name">${esc(nm(f.name))}</span><button class="btn" data-a="rotL">↺</button><button class="btn" data-a="rotR">↻ ${tr('旋转','Rotate')}</button>
       <button class="btn" data-a="dup">${tr('复制','Duplicate')}</button><button class="btn danger" data-a="del">${tr('删除','Delete')}</button><span class="sep"></span>
       <button class="btn narrow-only" data-a="prop">${tr('属性','Properties')}</button><button class="btn" data-a="done">${tr('完成','Done')}</button>`
    : `<span class="name">${esc(nm(state.rooms[r.id].name))}</span><button class="btn narrow-only" data-a="prop">${tr('地面 / 属性','Floor / Properties')}</button><button class="btn" data-a="done">${tr('完成','Done')}</button>`;
  fab.classList.add('show');
  fab.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({
    rotL:() => rotateSel(-90), rotR:() => rotateSel(90), dup:duplicateSel, del:deleteSel,
    prop:() => drawer('panel', true), done:() => { select(null); closeDrawers(); },
  })[b.dataset.a]());
}

function clearLayout(){
  const n = state.furniture.length;
  if (!n) return toast(tr('当前没有布置任何家具', 'There is no furniture to clear'));
  if (!confirm(tr(`确定清空全部 ${n} 件家具 / 家电吗？\n墙体、地面材料和测量线会保留，可点「撤销」恢复。`, `Remove all ${n} furniture / appliance items?\nWalls, flooring and measurements are kept. You can Undo this.`))) return;
  ui.sel = null; mutate(() => state.furniture = []);
  toast(tr('已清空布置，可点「撤销」恢复', 'Layout cleared — Undo to restore'));
}

/* 侧栏开合：which = 'lib' | 'panel' | null，open 不传则切换。
 * 宽屏：侧栏在布局中收起 / 展开（记住选择）；窄屏：侧栏是浮层抽屉，一次只开一个，which = null 表示全部关闭 */
const PANES = 'huxing-panes';
const panes = (() => { try { return JSON.parse(localStorage.getItem(PANES)) || {}; } catch(e) { return {}; } })();
function drawer(which, open){
  const app = $('.app'), els = {lib:$('aside.lib'), panel:$('aside.right')}, n = narrow();
  if (n){
    Object.entries(els).forEach(([k, el]) => el.classList.toggle('open', k === which && (open ?? !el.classList.contains('open'))));
  } else {
    Object.values(els).forEach(el => el.classList.remove('open'));
    if (which){
      const k = which === 'lib' ? 'hideLib' : 'hidePanel';
      panes[k] = open === undefined ? !panes[k] : !open;
      try { localStorage.setItem(PANES, JSON.stringify(panes)); } catch(e) {}
    }
  }
  app.classList.toggle('hide-lib', !!panes.hideLib); app.classList.toggle('hide-panel', !!panes.hidePanel);
  syncPaneBtns();
}
function syncPaneBtns(){
  const els = {lib:$('aside.lib'), panel:$('aside.right')}, n = narrow();
  const vis = k => n ? els[k].classList.contains('open') : !panes[k === 'lib' ? 'hideLib' : 'hidePanel'];
  $('#tgLib').classList.toggle('on', vis('lib')); $('#tgPanel').classList.toggle('on', vis('panel'));
  $('#tgLib').title = vis('lib') ? tr('收起家具库 ( [ )', 'Hide library ( [ )') : tr('展开家具库 ( [ )', 'Show library ( [ )');
  $('#tgPanel').title = vis('panel') ? tr('收起属性面板 ( ] )', 'Hide properties ( ] )') : tr('展开属性面板 ( ] )', 'Show properties ( ] )');
  $('#stage').classList.toggle('drawer-panel', n && vis('panel'));   // 属性抽屉盖住画面时让出底部工具条
}
function closeDrawers(){ if (narrow()) drawer(null); }

function roomPanel(r){
  const st = state.rooms[r.id], a = area(r.poly), [x0,y0,x1,y1] = bbox(r.poly), inside = state.furniture.filter(f => f.cx>x0&&f.cx<x1&&f.cy>y0&&f.cy<y1);
  const mats = Object.entries(PLAN.mats).map(([k,m]) => `<button class="mat ${k===st.mat?'on':''}" data-mat="${k}"><i style="background:${m.sw}"></i><span>${nm(m.name)}<small>¥${m.price}/m²</small></span></button>`).join('');
  return `<section><h3>${tr('房间','Room')}</h3>
    <div class="form"><label class="full">${tr('名称','Name')}<input id="rName" value="${esc(nm(st.name))}"></label></div>
    <div class="stats" style="margin-top:10px">
      <div><small>${tr('使用面积','Floor area')}</small><span class="big">${fmt(a)}</span> m²</div>
      <div><small>${tr('周长','Perimeter')}</small><span class="big">${fmt(perim(r.poly),1)}</span> m</div>
      <div><small>${tr('开间','Width')}</small><span class="big">${x1-x0}</span> mm</div>
      <div><small>${tr('进深','Depth')}</small><span class="big">${y1-y0}</span> mm</div></div>
    <div class="muted">${tr(`墙面面积（层高 2.8m，未扣门窗）约 ${fmt(perim(r.poly)*2.8,1)} m²`, `Wall area (2.8m ceiling, openings not deducted) ≈ ${fmt(perim(r.poly)*2.8,1)} m²`)}</div></section>
  <section><h3>${tr('地面材料','Flooring')}</h3><div class="mats">${mats}</div>
    <div class="total"><span>${tr('材料估价','Estimated cost')}</span><b>¥${Math.round(a*PLAN.mats[st.mat].price*1.05).toLocaleString()}</b></div></section>
  <section><h3>${tr('房间内家具','Furniture in room')} <small>${tr(`${inside.length} 件`, `${inside.length} items`)}</small></h3>
    <table>${inside.map(f => `<tr class="click" data-fid="${f.id}"><td>${esc(nm(f.name))}</td><td class="r muted">${f.w}×${f.d}</td></tr>`).join('') || `<tr><td class="muted">${tr('暂无','None')}</td></tr>`}</table>
    <div class="actions"><button class="btn" id="back">${tr('← 返回总览','← Back to overview')}</button></div></section>`;
}
function bindRoomPanel(){
  const id = ui.sel.id;
  $('#rName').onchange = e => mutate(() => state.rooms[id].name = e.target.value.trim() || state.rooms[id].name);
  document.querySelectorAll('#panel [data-mat]').forEach(b => b.onclick = () => mutate(() => state.rooms[id].mat = b.dataset.mat));
  document.querySelectorAll('#panel tr[data-fid]').forEach(tr => tr.onclick = () => select({kind:'furn', id:tr.dataset.fid}));
  $('#back').onclick = () => select(null);
}

function furnPanel(f){
  return `<section><h3>${tr('家具属性','Furniture')}</h3>
    <div class="form">
      <label class="full">${tr('名称','Name')}<input id="fName" value="${esc(nm(f.name))}"></label>
      <label>${tr('宽','Width')} (mm)<input type="number" id="fW" value="${f.w}" min="50" step="10"></label>
      <label>${tr('深','Depth')} (mm)<input type="number" id="fD" value="${f.d}" min="50" step="10"></label>
      <label>${tr('中心','Center')} X (mm)<input type="number" id="fX" value="${Math.round(f.cx)}" step="10"></label>
      <label>${tr('中心','Center')} Y (mm)<input type="number" id="fY" value="${Math.round(f.cy)}" step="10"></label>
      <label>${tr('旋转','Rotation')} (°)<input type="number" id="fR" value="${f.rot}" step="15"></label>
      <label>${tr('颜色','Color')}<input type="color" id="fC" value="${f.color}"></label>
    </div>
    <div class="muted" style="margin-top:8px">${tr('占地面积','Footprint')} ${fmt(f.w*f.d/1e6)} m²</div>
    <div class="actions">
      <button class="btn" id="aRot">${tr('旋转 90°','Rotate 90°')}</button><button class="btn" id="aDup">${tr('复制','Duplicate')}</button>
      <button class="btn" id="aTop">${tr('置于顶层','Bring to front')}</button><button class="btn" id="aBot">${tr('置于底层','Send to back')}</button>
      <button class="btn danger" id="aDel">${tr('删除','Delete')}</button><button class="btn" id="back">${tr('← 返回','← Back')}</button>
    </div></section>
  <section class="muted" style="font-size:12px">${tr('拖动家具移动；拖动上方圆点旋转；拖动右下角方块调整尺寸。开启「贴墙吸附」后靠近墙面会自动贴齐。', 'Drag to move; drag the top dot to rotate; drag the bottom-right square to resize. With "Wall snap" on, items snap flush to nearby walls.')}</section>`;
}
function bindFurnPanel(f){
  const upd = (fn) => mutate(() => { const g = getF(f.id); if (g) fn(g); });
  const num = (id, fn) => $(id).onchange = e => { const v = parseFloat(e.target.value); if (!isNaN(v)) upd(g => fn(g, v)); };
  $('#fName').onchange = e => upd(g => g.name = e.target.value.trim() || g.name);
  num('#fW', (g,v) => g.w = Math.max(50, Math.round(v)));
  num('#fD', (g,v) => g.d = Math.max(50, Math.round(v)));
  num('#fX', (g,v) => g.cx = v); num('#fY', (g,v) => g.cy = v); num('#fR', (g,v) => g.rot = norm(v));
  $('#fC').onchange = e => upd(g => g.color = e.target.value);
  $('#aRot').onclick = () => rotateSel(90);
  $('#aDup').onclick = duplicateSel;
  $('#aDel').onclick = deleteSel;
  $('#aTop').onclick = () => mutate(() => { const i = state.furniture.findIndex(g => g.id===f.id); state.furniture.push(...state.furniture.splice(i,1)); });
  $('#aBot').onclick = () => mutate(() => { const i = state.furniture.findIndex(g => g.id===f.id); state.furniture.unshift(...state.furniture.splice(i,1)); });
  $('#back').onclick = () => select(null);
}
export {renderPanel, overviewPanel, bindOverview, renderFab, clearLayout, drawer, syncPaneBtns, closeDrawers, roomPanel, bindRoomPanel, furnPanel, bindFurnPanel};
