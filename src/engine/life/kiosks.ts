// 街边小店和文化牌（docs/05 第 5–7 节）：挂在景点上，跟着景点加载 / 卸载，用景点的局部坐标摆放
import type { Anchor, LifeContent, ShopDef } from '../city.ts'
import type { LandmarkBuilder, PlacedLandmark } from '../landmarks/LandmarkManager.ts'
import type { Lot } from '../world/lots.ts'

const KIND_NAMES = { food: '小吃', gift: '纪念品', coffee: '咖啡' } as const
const SIGN = { food: 0xd8452f, gift: 0x2f7fd8, coffee: 0x8a5a3a } as const
const AWNING = { food: [0xd8452f, 0xf4efe6], gift: [0x2f7fd8, 0xf4efe6], coffee: [0x3c6e47, 0xf0e6d2] } as const
const LIGHT = { light: true, collide: false } as const
/** 小店占地的半宽、半深（格），盖房子时让开 */
const KIOSK = { w: 1.8, d: 1.2 }

/** 店里卖什么的简称：“小吃”“纪念品”“咖啡” */
export const shopKindName = (s: ShopDef) => KIND_NAMES[s.kind]

// 小店局部坐标（店面朝 +z）→ 景点局部坐标
function frame(a: Anchor) {
  const f = a.face ?? 0
  const c = Math.cos(f)
  const s = Math.sin(f)
  return (ox: number, oz: number): [number, number] => [a.x + ox * c - oz * s, a.z + ox * s + oz * c]
}

function kiosk(lb: LandmarkBuilder, shop: ShopDef) {
  const a = shop.at
  const at = frame(a)
  const tw = a.face ?? 0
  const y = a.y ?? 0
  const part = (ox: number, oz: number, w: number, d: number, y0: number, y1: number, color: number, o = {}) => {
    const [x, z] = at(ox, oz)
    lb.slab(x, z, w, d, y + y0, y + y1, color, tw, { windows: 0, ...o })
  }
  // 后半间（墙）+ 前面的柜台
  part(0, -0.35, 3.4, 1.7, 0, 2.3, 0xe9e1d0)
  part(0, 0.75, 3.4, 0.5, 0, 1.05, 0x8a6a4a)
  part(0, 0.75, 3.6, 0.6, 1.05, 1.15, 0xcfc4b0, { collide: false })
  // 柜台上摆的东西
  for (const ox of [-1, 0, 1]) part(ox, 0.7, 0.5, 0.35, 1.15, 1.4, [0xf2c46b, 0xffffff, 0xe07a4f][ox + 1]!, { collide: false })
  // 条纹雨棚：往前伸出去
  const [c0, c1] = AWNING[shop.kind]
  for (let i = 0; i < 8; i++) part(-1.75 + 0.4375 * (i + 0.5), 0.95, 0.4375, 0.9, 2.15, 2.3, i % 2 ? c1 : c0, { collide: false })
  part(0, -0.2, 3.6, 2.2, 2.3, 2.45, 0x5a5652, { collide: false })
  // 屋顶上的招牌（夜里亮）
  part(0, 0.2, 2.8, 0.18, 2.45, 3.05, SIGN[shop.kind], LIGHT)
  part(0, 0.2, 3, 0.22, 2.42, 2.5, 0x2a2a2a, { collide: false })
  const [fx, fz] = at(0, 2)
  const [wx, wz] = lb.p.toWorld(fx, fz)
  lb.points.push({ x: wx, z: wz, r: 2.6, label: `${shop.name} · ${KIND_NAMES[shop.kind]}`, action: '逛逛', kind: 'shop', shop: shop.id })
}

function plaque(lb: LandmarkBuilder, id: string, name: string, a: Anchor) {
  const at = frame(a)
  const tw = a.face ?? 0
  const y = a.y ?? 0
  const part = (ox: number, oz: number, w: number, d: number, y0: number, y1: number, color: number, o = {}) => {
    const [x, z] = at(ox, oz)
    lb.slab(x, z, w, d, y + y0, y + y1, color, tw, { windows: 0, ...o })
  }
  // 石座 + 铜牌，顶上一道金边
  part(0, 0, 1.4, 0.6, 0, 0.35, 0x9a968c)
  part(0, 0, 1.1, 0.16, 0.35, 1.7, 0x5b4a2e)
  part(0, 0.09, 0.9, 0.04, 0.6, 1.5, 0xc9a24a, { collide: false })
  part(0, 0, 1.2, 0.2, 1.7, 1.78, 0xffd98a, LIGHT)
  const [fx, fz] = at(0, 1.2)
  const [wx, wz] = lb.p.toWorld(fx, fz)
  lb.points.push({ x: wx, z: wz, r: 2.2, label: `文化牌 · ${name}`, action: '阅读', kind: 'culture', culture: id })
}

/** 景点加载时调用：把挂在这个景点上的小店和文化牌一起建出来 */
export function buildLife(content: LifeContent, p: PlacedLandmark, lb: LandmarkBuilder) {
  const id = p.def.id
  for (const s of content.shops) if (s.at.landmark === id) kiosk(lb, s)
  for (const c of content.culture) if ('plaque' in c.unlock && c.unlock.plaque.landmark === id) plaque(lb, c.id, c.name, c.unlock.plaque)
}

/** 小店和文化牌的世界占地（分块盖房子、种树时让开） */
export function lifeFootprints(content: LifeContent, placed: PlacedLandmark[]): Lot[] {
  const byId = new Map(placed.map((p) => [p.def.id, p]))
  const anchors: [Anchor, number][] = [...content.shops.map((s) => [s.at, KIOSK.w + 1] as [Anchor, number]), ...content.culture.flatMap((c) => ('plaque' in c.unlock ? [[c.unlock.plaque, 1.5] as [Anchor, number]] : []))]
  return anchors.flatMap(([a, r]) => {
    const p = byId.get(a.landmark)
    if (!p) return []
    const [x, z] = p.toWorld(a.x, a.z)
    return [{ x0: x - r, z0: z - r, x1: x + r, z1: z + r }]
  })
}
