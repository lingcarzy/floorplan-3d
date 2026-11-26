/* 家具目录：类型默认色 + id / 家具对象工厂（目录内容来自 data/catalog.json → PLAN.lib） */
import {PLAN} from './data.js';

const typeColor = t => { for (const c of PLAN.lib) for (const i of c.items) if (i[0]===t) return i[4]; return '#eee'; };

let _n = 1;
const uid = () => 'f' + Date.now().toString(36) + (_n++);
const F = (type,name,cx,cy,w,d,rot=0,color) => ({id:uid(),type,name,cx,cy,w,d,rot,color:color||typeColor(type)});
export {typeColor, uid, F};
