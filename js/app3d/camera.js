/* 相机位姿 / 过渡动画：与 2D 视口对齐的正俯视、iso 环绕、球坐标插值飞行 */
import * as THREE from 'three';
import {S, FOV, wx, wz, M, SW, SH} from './context.js';
import {PLAN} from '../data.js';
import {view} from '../view2d.js';
import {clamp01} from '../geometry.js';

/* ======================= 相机位姿 / 动画 ======================= */
const ease = t => t < .5 ? 4*t*t*t : 1 - (-2*t + 2)**3/2;
const pose = (t, p) => ({t, p});
// 与当前 2D 视口完全重合的正俯视位姿：透视相机在该高度下，地面可视高度 = 2D 视口高度
function planPose(){
  const cx = view.x0 + SW()/2/view.s, cy = view.y0 + SH()/2/view.s, visH = SH()/view.s/1000;
  const dist = visH / 2 / Math.tan(FOV/2*Math.PI/180), t = new THREE.Vector3(wx(cx), 0, wz(cy));
  return pose(t, new THREE.Vector3(t.x, dist, t.z + 1e-4));
}
function isoFrom(P){
  const d = THREE.MathUtils.clamp(P.p.y, 5, 30), dir = new THREE.Vector3(.3, .82, .49).normalize();
  return pose(P.t.clone(), P.t.clone().addScaledVector(dir, d));
}
const isoWhole = () => pose(new THREE.Vector3(0, 0, 0), new THREE.Vector3(5.5, 15.5, 10));
const topWhole = () => pose(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 19, 1e-4));
const curPose = () => pose(S.orbit.target.clone(), S.camera.position.clone());
// 以目标点为中心做球坐标插值：镜头沿弧线倾斜环绕，而不是直线穿越
function camTween(A, B, e){
  const t = A.t.clone().lerp(B.t, e);
  const sa = new THREE.Spherical().setFromVector3(A.p.clone().sub(A.t)), sb = new THREE.Spherical().setFromVector3(B.p.clone().sub(B.t));
  let dth = sb.theta - sa.theta; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
  const s = new THREE.Spherical(sa.radius + (sb.radius - sa.radius)*e, sa.phi + (sb.phi - sa.phi)*e, sa.theta + dth*e);
  S.camera.position.copy(t).add(new THREE.Vector3().setFromSpherical(s)); S.camera.lookAt(t); S.orbit.target.copy(t);
}
function setPose(P){ S.camera.position.copy(P.p); S.orbit.target.copy(P.t); S.camera.lookAt(P.t); }
function animate(dur, fn){ return new Promise(res => { S.anim = {t0:performance.now(), dur, fn, res}; }); }
const wait = ms => new Promise(r => setTimeout(r, ms));
function flyTo(B, dur = 900){ S.fly = {t0:performance.now(), dur, A:curPose(), B}; }
function flyToRoom(id){
  const r = PLAN.rooms.find(r => r.id === id), xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]);
  const t = new THREE.Vector3(wx((Math.min(...xs)+Math.max(...xs))/2), .6, wz((Math.min(...ys)+Math.max(...ys))/2));
  const size = M(Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys)));
  const dir = S.camera.position.clone().sub(S.orbit.target).setY(0); if (dir.lengthSq() < .01) dir.set(.6, 0, .8); dir.normalize();
  const dist = size*1.3 + 2.2;
  flyTo(pose(t, new THREE.Vector3(t.x + dir.x*dist*.7, dist*1.05, t.z + dir.z*dist*.7)));
}

export {ease, planPose, isoFrom, isoWhole, topWhole, curPose, camTween, setPose, animate, wait, flyTo, flyToRoom};
