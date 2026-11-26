/* 2D 视图：视口变换 / 缩放 / 适应窗口 / 屏幕坐标 → mm */
import {PLAN} from './data.js';
import {$, svg, PX_MM} from './dom.js';
import {renderSel, renderMeasure} from './render2d.js';

const view = {x0:0, y0:0, s:.06};
function applyView(){
  const W = svg.clientWidth, H = svg.clientHeight;
  svg.setAttribute('viewBox', `${view.x0} ${view.y0} ${W/view.s} ${H/view.s}`);
  const ratio = 1/(view.s*PX_MM);
  $('#ratio').textContent = '1:' + Math.round(ratio);
  const nice = [100,200,500,1000,2000,5000].find(v => v*view.s >= 60) || 5000;
  $('#sbBar').style.width = nice*view.s + 'px';
  $('#sbText').textContent = nice >= 1000 ? `${nice/1000} m` : `${nice} mm`;
  renderSel(); renderMeasure();
}
function fitView(){
  const W = svg.clientWidth, H = svg.clientHeight;
  view.s = Math.min(W/PLAN.bounds.w, H/PLAN.bounds.h);
  view.x0 = PLAN.bounds.x - (W/view.s - PLAN.bounds.w)/2; view.y0 = PLAN.bounds.y - (H/view.s - PLAN.bounds.h)/2;
  applyView();
}
function zoomAt(ns, mx, my){
  ns = Math.max(.012, Math.min(2, ns));
  const px = view.x0 + mx/view.s, py = view.y0 + my/view.s;
  view.s = ns; view.x0 = px - mx/ns; view.y0 = py - my/ns; applyView();
}
const zoomCenter = k => zoomAt(view.s*k, svg.clientWidth/2, svg.clientHeight/2);
const setRatio = r => zoomAt(1/(r*PX_MM), svg.clientWidth/2, svg.clientHeight/2);

function toMM(e){
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
const svgXY = (x, y) => { const r = svg.getBoundingClientRect(); return [x - r.left, y - r.top]; };
export {view, applyView, fitView, zoomAt, zoomCenter, setRatio, toMM, svgXY};
