/* 设计状态 / 历史 / 存储。
 * state = {furniture, rooms:{id:{name,mat}}, demolished:['w3',...], measures:[{a,b}]}
 * 每个户型方案独立存储（huxing-design-v1:<planId>）；旧版单文件的 huxing-design-v1
 * 作为 default 方案的遗留键兼容读取。 */
import {PLAN} from './data.js';
import {F} from './catalog.js';
import {ui} from './ui.js';
import {tr} from './i18n.js';
import {toast} from './ui.js';
import {renderAll} from './render2d.js';

export let state = null;

const undoStack = [], redoStack = [];
export {undoStack, redoStack};

export const storeKey = () => 'huxing-design-v1:' + PLAN.id;
const legacyKey = 'huxing-design-v1';

export function defaultState(){
  const rooms = {};
  PLAN.rooms.forEach(r => rooms[r.id] = {name:r.name, mat:r.mat});
  return {furniture:PLAN.furniture.map(f => F(f.type, f.name, f.cx, f.cy, f.w, f.d, f.rot || 0, f.color)), rooms, demolished:[], measures:[]};
}

export function fixState(s){
  const d = defaultState();
  s.rooms = Object.assign(d.rooms, s.rooms || {});
  s.demolished = s.demolished || []; s.measures = s.measures || [];
  return s;
}

export function loadStored(){
  try {
    let raw = localStorage.getItem(storeKey());
    if (!raw && PLAN.id === 'default') raw = localStorage.getItem(legacyKey);   // 旧版数据迁移
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.furniture)) return fixState(s);
  } catch(e) {}
  return null;
}

export function setState(s){ state = s; }

export function resetHistory(){ undoStack.length = 0; redoStack.length = 0; }

function save(){ try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch(e) {} }
export const snap = () => JSON.stringify(state);
export function commit(before){ undoStack.push(before); if (undoStack.length > 150) undoStack.shift(); redoStack.length = 0; save(); }
export function mutate(fn){ const b = snap(); fn(); commit(b); renderAll(); }
export function undo(){ if (!undoStack.length) return toast(tr('没有可撤销的操作', 'Nothing to undo')); redoStack.push(snap()); state = JSON.parse(undoStack.pop()); validateSel(); save(); renderAll(); }
export function redo(){ if (!redoStack.length) return; undoStack.push(snap()); state = JSON.parse(redoStack.pop()); validateSel(); save(); renderAll(); }
function validateSel(){ if (ui.sel?.kind==='furn' && !getF(ui.sel.id)) ui.sel = null; }
export const getF = id => state.furniture.find(f => f.id === id);
