/* 3D 共享上下文：渲染器 / 场景等跨子模块的可变引用集中在 S 上。
 * 世界坐标：户型中心为原点，单位米（wx/wz 把平面 mm 坐标转世界坐标）。 */
import {PLAN} from '../data.js';
import {$} from '../dom.js';

export const stage = $('#stage'), host = $('#view3d');
export const FOV = 45, WALL_H = 2.8;                 // 视场角 / 层高 2.8 m
export const wx = x => (x - PLAN.center[0]) / 1000, wz = y => (y - PLAN.center[1]) / 1000, M = v => v / 1000;
export const SW = () => stage.clientWidth, SH = () => stage.clientHeight;
export const opt = {cut:2.8, furn:true, labels:true, night:false, hour:10, mode:'orbit'};

export const S = {
  inited:false, active:false, raf:0, anim:null, fly:null,
  renderer:null, labelRenderer:null, scene:null, camera:null, orbit:null, walkCtl:null,
  hemi:null, sun:null, ground:null,
  glassMat:null, wallMat:null, capMat:null, frameMat:null,
  archFloor:null, archUp:null, furnG:null, labelG:null, lampG:null,
  colliders:[], doors:[],
  sigArch:'', sigFurn:'', sigLabels:'', grow:1, furnGrow:1,
};
