/* DOM 引用与环境常量 */
export const PX_MM = 25.4 / 96;                       // 1 CSS px = 0.2646 mm
export const COARSE = matchMedia('(pointer:coarse)').matches;   // iPad / 手机等触屏为主的设备
export const TAP = COARSE ? 9 : 4;                    // 手指按下后移动超过该像素才算拖动
export const narrow = () => matchMedia('(max-width:1100px)').matches;
export const $ = s => document.querySelector(s);
export const svg = $('#plan');
