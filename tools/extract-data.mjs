// 从旧版单文件 floor3d.html 中提取户型数据 → data/*.json（一次性迁移脚本）
import {readFileSync, writeFileSync} from 'fs';
import path from 'path';

// 紧凑序列化：纯原始值（数字/字符串）数组保持单行，便于阅读编辑
function pretty(v, indent = 0){
  const pad = ' '.repeat(indent), pad2 = ' '.repeat(indent + 1);
  if (Array.isArray(v) && v.every(x => x === null || typeof x !== 'object'))
    return '[' + v.map(x => JSON.stringify(x)).join(', ') + ']';
  if (Array.isArray(v))
    return '[\n' + v.map(x => pad2 + pretty(x, indent + 1)).join(',\n') + '\n' + pad + ']';
  if (v && typeof v === 'object'){
    const ks = Object.entries(v);
    if (!ks.length) return '{}';
    return '{\n' + ks.map(([k, x]) => pad2 + JSON.stringify(k) + ': ' + pretty(x, indent + 1)).join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(v);
}

const SRC = 'E:/laragon/www/floor3d.html';
const OUT = 'E:/laragon/www/floor3d/data';
const src = readFileSync(SRC, 'utf8');

const start = src.indexOf('const WALLS');
const end = src.indexOf('const STORE');
if (start < 0 || end < 0 || end <= start) throw new Error('marker not found');
const body = src.slice(start, end);
const d = new Function(body + '; return {WALLS, WINS, DOORS, SLIDES, ROOMS, MATS, LIB, furniture: defaultFurniture()};')();

// 窗：原代码按索引硬编码窗台高（i===0→1.4 客厅高窗，i>=6→.45 飘窗，其余 .9）
const sills = d.WINS.map((_, i) => i === 0 ? 1.4 : i >= 6 ? .45 : .9);
const windows = d.WINS.map((w, i) => ({rect: w.slice(0, 4), sill: sills[i]}));

// 入户门 → 漫游出生点 / 朝向 / 2D 入户箭头（通用推导，替代原硬编码坐标）
const entryDoor = d.DOORS.find(x => x.entry) || d.DOORS[0];
const ec = [(entryDoor.rect[0] + entryDoor.rect[2]) / 2, (entryDoor.rect[1] + entryDoor.rect[3]) / 2];
const o = entryDoor.o, L = entryDoor.len;
const entry = {
  door: entryDoor.name,
  spawn: [Math.round(ec[0] - o[0] * (L / 2 + 55)), Math.round(ec[1] - o[1] * (L / 2 + 55))],
  look: [Math.round(ec[0] + o[0] * 2300), Math.round(ec[1] + o[1] * 2300)],
  arrow: {tip: [Math.round(ec[0] - o[0] * 300), Math.round(ec[1] - o[1] * 300)],
          head: [Math.round(ec[0] - o[0] * 550), Math.round(ec[1] - o[1] * 550)],
          from: [Math.round(ec[0] - o[0] * 1350), Math.round(ec[1] - o[1] * 1350)]},
};

// 尺寸标注链（原 renderDims 中硬编码的 8 条链）
const dims = [
  {h: 1, at: -750, start: 0, segs: [1580, 240, 2760, 240, 1540, 240, 3670]},
  {h: 1, at: -1250, start: 0, segs: [10270]},
  {h: 1, at: 11350, start: 0, segs: [2180, 240, 2160, 240, 5450, 240, 1340]},
  {h: 1, at: 11850, start: 0, segs: [11850]},
  {h: 0, at: -800, start: 0, segs: [3370, 1580, 240, 2770, 240, 2360]},
  {h: 0, at: -1300, start: 0, segs: [10560]},
  {h: 0, at: 12750, start: 0, segs: [3370, 240, 2760, 240, 3950]},
  {h: 0, at: 13250, start: 0, segs: [10560]},
];

const plan = {
  id: 'default',
  name: '三室两厅两卫',
  nameEn: '3BR · 2LR · 2BA',
  desc: '原始户型 · 尺寸单位 mm，原点 = 左侧/顶部外墙内皮',
  walls: d.WALLS,
  windows,
  doors: d.DOORS,
  slides: d.SLIDES,
  rooms: d.ROOMS,
  lintels: [{rect: [10270, 800, 10510, 2600], h: 2.4}, {rect: [10270, 4260, 10510, 5740], h: 2.4}],
  mats: d.MATS,
  lib: d.LIB,
  furniture: d.furniture.map(({id, ...rest}) => rest),   // id 运行时重新生成
  bounds: {x: -1850, y: -1750, w: 15600, h: 14100},
  center: [6000, 5300],
  entry,
  dims,
};
writeFileSync(path.join(OUT, 'plans/default.json'), pretty(plan) + '\n');
writeFileSync(path.join(OUT, 'materials.json'), pretty(d.MATS) + '\n');
writeFileSync(path.join(OUT, 'catalog.json'), pretty(d.LIB) + '\n');
writeFileSync(path.join(OUT, 'plans/index.json'), pretty({plans: [
  {id: 'default', name: plan.name, nameEn: plan.nameEn},
  {id: 'studio', name: '一室一厅 · 示例', nameEn: 'Studio · Sample'},
]}) + '\n');
console.log('walls:', d.WALLS.length, 'wins:', d.WINS.length, 'doors:', d.DOORS.length,
  'rooms:', d.ROOMS.length, 'furniture:', plan.furniture.length, 'entry:', JSON.stringify(entry.spawn));
