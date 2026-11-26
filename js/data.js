/* 户型方案加载器：data/plans/index.json 清单 + 各方案 JSON。
 * PLAN 是全局唯一的“当前方案”对象，切换方案时整体替换其字段。 */

export const PLAN = {
  id: '', name: '', nameEn: '',
  walls: [], wins: [], doors: [], slides: [], rooms: [], lintels: [],
  mats: {}, lib: [], furniture: [],
  bounds: {x: -2000, y: -2000, w: 16000, h: 16000},
  center: [0, 0],
  entry: null,                                    // 漫游出生点 / 朝向 / 2D 入户箭头（未提供时自动推导）
  dims: [],                                       // 2D 尺寸标注链 [{h:1横向, at, start, segs}]
};

export let plans = [];                            // 清单：[{id, name, nameEn}]
let BASE_MATS = {}, BASE_LIB = [];                // 共享材料表 / 家具目录（方案 JSON 里 mats/lib 为 null 时使用）

const fetchJSON = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); });

export async function loadPlans(){
  const idx = await fetchJSON('data/plans/index.json');
  plans = idx.plans || [];
  [BASE_MATS, BASE_LIB] = await Promise.all([
    fetchJSON('data/materials.json').catch(() => ({})),
    fetchJSON('data/catalog.json').catch(() => []),
  ]);
}

/* 读取并规范化一个方案；normalize 保证缺省字段可用（bounds/center/entry 可自动推导） */
export async function loadPlan(id){
  const p = await fetchJSON(`data/plans/${id}.json`);
  p.id = p.id || id;
  p.name = p.name || id;
  p.nameEn = p.nameEn || p.name;
  p.walls ||= []; p.windows ||= []; p.doors ||= []; p.slides ||= []; p.rooms ||= []; p.lintels ||= [];
  p.mats = p.mats || BASE_MATS;                    // null = 使用共享材料表
  p.lib = p.lib || BASE_LIB;                       // null = 使用共享家具目录
  p.furniture ||= []; p.dims ||= [];
  p.entry = p.entry || null;                       // 无入户门信息时清掉上一个方案的值
  // JSON 字段 windows 规范化为内部使用的 wins（{rect, sill}）
  p.wins = p.windows.map(w => Array.isArray(w) ? {rect: w, sill: .9} : {sill: .9, ...w});
  if (!p.center){
    const xs = [], ys = [];
    [...p.walls, ...p.windows.map(w => w.rect), ...p.doors.map(d => d.rect), ...p.slides.map(s => s.rect)]
      .forEach(([x0, y0, x1, y1]) => { xs.push(x0, x1); ys.push(y0, y1); });
    p.rooms.forEach(r => r.poly.forEach(([x, y]) => { xs.push(x); ys.push(y); }));
    p.center = [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2)];
  }
  if (!p.bounds){
    const M = 1650;                                // 四周留白，容纳尺寸标注链
    const xs = [], ys = [];
    [...p.walls, ...p.windows.map(w => w.rect)].forEach(([x0, y0, x1, y1]) => { xs.push(x0, x1); ys.push(y0, y1); });
    const x0 = Math.min(...xs) - M, y0 = Math.min(...ys) - M;
    p.bounds = {x: x0, y: y0, w: Math.max(...xs) + M - x0, h: Math.max(...ys) + M - y0};
  }
  if (!p.entry){
    const d = p.doors.find(x => x.entry) || p.doors[0];
    if (d){
      const ec = [(d.rect[0] + d.rect[2]) / 2, (d.rect[1] + d.rect[3]) / 2], o = d.o, L = d.len;
      p.entry = {
        door: d.name,
        spawn: [Math.round(ec[0] - o[0] * (L / 2 + 55)), Math.round(ec[1] - o[1] * (L / 2 + 55))],
        look: [Math.round(ec[0] + o[0] * 2300), Math.round(ec[1] + o[1] * 2300)],
        arrow: {tip: [Math.round(ec[0] - o[0] * 300), Math.round(ec[1] - o[1] * 300)],
                head: [Math.round(ec[0] - o[0] * 550), Math.round(ec[1] - o[1] * 550)],
                from: [Math.round(ec[0] - o[0] * 1350), Math.round(ec[1] - o[1] * 1350)]},
      };
    }
  }
  Object.assign(PLAN, p);
  return PLAN;
}
