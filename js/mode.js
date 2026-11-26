/* 视图模式（2D / 3D）与 3D 引擎引用。three.js 由 main.js 按需动态 import */
export let viewMode = '2d';
export const is3D = () => viewMode === '3d';
export function setViewMode(m){ viewMode = m; }

export let view3d = null;                          // app3d 提供的 View3D API
export function setView3D(v){ view3d = v; }
export const getView3D = () => view3d;
