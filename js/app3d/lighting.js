/* 日照 / 夜景：太阳方位随时间变化，夜景切换室内点光 */
import * as THREE from 'three';
import {S, opt} from './context.js';
import {$} from '../dom.js';
import {setEnvIntensity} from './materials.js';

function applyLight(){
  const t = (opt.hour - 6) / 12, az = Math.PI * (.15 + t*.7), el = Math.sin(Math.PI*t) * 1.05 + .15, warm = 1 - Math.sin(Math.PI*t);
  S.sun.position.set(Math.cos(az)*18, Math.sin(el)*20 + 3, -Math.sin(az)*10 + 8); S.sun.target.position.set(0, 0, 0);
  S.sun.color.setHSL(.09, .5 + warm*.4, .92 - warm*.12);
  S.sun.intensity = opt.night ? .05 : 1.4 + Math.sin(Math.PI*t)*1.6;
  S.hemi.intensity = opt.night ? .12 : 1.1;
  S.scene.background = new THREE.Color(opt.night ? 0x1c2130 : 0xf7f4ee);
  S.ground.material.color.set(opt.night ? 0x2a2e38 : 0xf2eee7);
  S.lampG.children.forEach(o => { if (o.isPointLight) o.intensity = opt.night ? 6 : 0; else o.material.emissiveIntensity = opt.night ? 2 : .3; });
  S.renderer.toneMappingExposure = opt.night ? 1.25 : 1.05;
  setEnvIntensity(opt.night ? .15 : 1);
  const h = Math.floor(opt.hour), m = Math.round((opt.hour - h)*60);
  $('#sunT').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

export {applyLight};
