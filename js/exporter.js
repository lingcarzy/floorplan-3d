/* 导出：下载助手 + PNG 截图（2D 用 SVG 序列化，3D 直接取 canvas） */
import {PLAN} from './data.js';
import {ui} from './ui.js';
import {tr} from './i18n.js';
import {svg} from './dom.js';
import {is3D, getView3D} from './mode.js';

export function download(name, blob){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
export function exportPNG(){
  if (is3D()) return getView3D()?.shot();
  const B = PLAN.bounds;
  const clone = svg.cloneNode(true), W = 3200, H = Math.round(W*B.h/B.w);
  clone.setAttribute('viewBox', `${B.x} ${B.y} ${B.w} ${B.h}`);
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  clone.querySelector('#gSel').innerHTML = '';
  clone.querySelector('#gGrid').innerHTML = `<rect x="-20000" y="-20000" width="55000" height="55000" fill="${ui.layers.grid?'url(#grid)':'#f7f4ee'}"/>`;
  const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
  Object.entries({x:-20000,y:-20000,width:55000,height:55000,fill:'#f7f4ee'}).forEach(([k,v]) => bg.setAttribute(k,v));
  clone.insertBefore(bg, clone.querySelector('#gGrid'));
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(img, 0, 0, W, H);
    cv.toBlob(b => download(tr('户型装修方案', 'floor-plan-design') + '.png', b));
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
}
