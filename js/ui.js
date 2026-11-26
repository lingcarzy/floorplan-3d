/* 界面级共享状态：工具与选择、图层开关、消息提示、HTML 转义 */
export const ui = {tool:'select', sel:null, mA:null, mCur:null,
  layers:{dims:true, labels:true, furn:true, grid:false, bearing:false, wallSnap:true}};

export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let toastT;
export function toast(msg){ const t = document.querySelector('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }
