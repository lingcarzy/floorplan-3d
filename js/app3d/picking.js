/* 拾取 / 地面交点 / 3D 选中框 */
import * as THREE from 'three';
import {S, opt, wx, wz, M} from './context.js';
import {PLAN} from '../data.js';
import {ui} from '../ui.js';

let selKey = null, selHelper = null;
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function pick(e){
  if (!e) ptr.set(0, 0);
  else { const r = S.renderer.domElement.getBoundingClientRect(); ptr.set((e.clientX - r.left)/r.width*2 - 1, -(e.clientY - r.top)/r.height*2 + 1); }
  ray.setFromCamera(ptr, S.camera);
  const hits = ray.intersectObjects([...(opt.furn ? [S.furnG] : []), S.archUp, S.archFloor], true);
  for (const h of hits){
    let o = h.object;
    if (o.material === S.glassMat) continue;
    if (o.userData.door) return {door:o.userData.door, dist:h.distance};
    if (o.userData.room) return {room:o.userData.room};
    while (o && !o.userData.fid && o !== S.scene) o = o.parent;
    if (o?.userData.fid) return {fid:o.userData.fid};
    return null;                                     // 被墙体挡住
  }
  return null;
}
// 屏幕点 → 地面（y = 0）上的户型坐标 mm；s = 该处每 mm 对应的屏幕像素，用于拖放时的幽灵图大小
const ground0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(x, y){
  if (!S.active || S.anim) return null;
  const r = S.renderer.domElement.getBoundingClientRect(), hit = new THREE.Vector3();
  ptr.set((x - r.left)/r.width*2 - 1, -(y - r.top)/r.height*2 + 1);
  ray.setFromCamera(ptr, S.camera);
  if (!ray.ray.intersectPlane(ground0, hit) || hit.distanceTo(S.camera.position) > 60) return null;
  // 视线先碰到墙体（或飘窗台）时，落点取碰到的位置，而不是穿过墙落到看不见的墙后
  const wall = ray.intersectObjects([S.archUp, S.archFloor], true).find(h => h.object.material !== S.glassMat && h.object.visible);
  if (wall && wall.distance < hit.distanceTo(S.camera.position) - .01) hit.set(wall.point.x, 0, wall.point.z);
  const px = v => new THREE.Vector2(v.x*r.width/2, v.y*r.height/2), a = px(hit.clone().project(S.camera));
  const s = Math.max(a.distanceTo(px(hit.clone().add(new THREE.Vector3(1, 0, 0)).project(S.camera))),
                     a.distanceTo(px(hit.clone().add(new THREE.Vector3(0, 0, 1)).project(S.camera)))) / 1000;
  return {x:hit.x*1000 + PLAN.center[0], y:hit.z*1000 + PLAN.center[1], s};
}
function updateSel(){
  const key = ui.sel?.kind === 'furn' ? ui.sel.id : '';
  if (key !== selKey){
    selKey = key;
    if (selHelper){ S.scene.remove(selHelper); selHelper.geometry.dispose(); selHelper = null; }
    const g = key && S.furnG.children.find(g => g.userData.fid === key);
    if (g){ selHelper = new THREE.BoxHelper(g, 0xb5653a); S.scene.add(selHelper); }
  }
  if (selHelper) selHelper.update();
}
function invalidateSel(){ selKey = null; }
export {pick, groundAt, updateSel, invalidateSel};
