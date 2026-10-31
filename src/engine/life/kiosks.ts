// 街边小店和文化牌（docs/05 第 5–7 节）：挂在景点上的跟着景点加载 / 卸载，用景点的局部坐标摆放；
// Citywalk 沿途的小店按经纬度摆，由 WalkSystem 建
import type { Anchor, GeoAnchor, LifeContent, PartOptions, ShopDef } from '../city.ts'
import type { Projection } from '../geo/projection.ts'
import type { PlacedLandmark } from '../landmarks/LandmarkManager.ts'
import type { InteractPoint } from '../world/interact.ts'
import type { Lot } from '../world/lots.ts'
import { tr } from '../../i18n/core.ts'

const KIND_NAMES = { food: '小吃', gift: '纪念品', coffee: '咖啡' } as const
const SIGN = { food: 0xd8452f, gift: 0x2f7fd8, coffee: 0x8a5a3a } as const
const AWNING = { food: [0xd8452f, 0xf4efe6], gift: [0x2f7fd8, 0xf4efe6], coffee: [0x3c6e47, 0xf0e6d2] } as const
const LIGHT = { light: true, collide: false } as const
/** 小店占地的半宽（格），盖房子时让开 */
const KIOSK_R = 2.8

/** 店里卖什么的简称：“小吃”“纪念品”“咖啡” */
export const shopKindName = (s: ShopDef) => KIND_NAMES[s.kind]

export const isGeo = (a: Anchor | GeoAnchor): a is GeoAnchor => 'lat' in a

/** 摆小店的地方：景点（LandmarkBuilder）或者世界里的一个点；坐标是它自己的局部坐标 */
export interface KioskHost {
  slab(cx: number, cz: number, w: number, d: number, y0: number, y1: number, color: number, twist?: number, o?: PartOptions): void
  toWorld(x: number, z: number): [number, number]
  readonly points: InteractPoint[]
}

/** 小店的位置：局部坐标、转角、地面高度 */
interface Spot {
  x: number
  z: number
  face: number
  y: number
}

// 小店局部坐标（店面朝 +z）→ 宿主的局部坐标
function frame(a: Spot) {
  const c = Math.cos(a.face)
  const s = Math.sin(a.face)
  return (ox: number, oz: number): [number, number] => [a.x + ox * c - oz * s, a.z + ox * s + oz * c]
}

/** 建一个小店：后半间、柜台、条纹雨棚、夜里亮的招牌，柜台前登记交互点 */
export function kiosk(h: KioskHost, shop: ShopDef, spot: Spot) {
  const at = frame(spot)
  const part = (ox: number, oz: number, w: number, d: number, y0: number, y1: number, color: number, o: PartOptions = {}) => {
    const [x, z] = at(ox, oz)
    h.slab(x, z, w, d, spot.y + y0, spot.y + y1, color, spot.face, { windows: 0, ...o })
  }
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
  const [wx, wz] = h.toWorld(...at(0, 2))
  h.points.push({ x: wx, z: wz, r: 2.6, label: `${shop.name} · ${tr(KIND_NAMES[shop.kind])}`, action: '逛逛', kind: 'shop', shop: shop.id })
}

function plaque(h: KioskHost, id: string, name: string, a: Anchor) {
  const spot = { x: a.x, z: a.z, face: a.face ?? 0, y: a.y ?? 0 }
  const at = frame(spot)
  const part = (ox: number, oz: number, w: number, d: number, y0: number, y1: number, color: number, o: PartOptions = {}) => {
    const [x, z] = at(ox, oz)
    h.slab(x, z, w, d, spot.y + y0, spot.y + y1, color, spot.face, { windows: 0, ...o })
  }
  // 石座 + 铜牌，顶上一道金边
  part(0, 0, 1.4, 0.6, 0, 0.35, 0x9a968c)
  part(0, 0, 1.1, 0.16, 0.35, 1.7, 0x5b4a2e)
  part(0, 0.09, 0.9, 0.04, 0.6, 1.5, 0xc9a24a, { collide: false })
  part(0, 0, 1.2, 0.2, 1.7, 1.78, 0xffd98a, LIGHT)
  const [wx, wz] = h.toWorld(...at(0, 1.2))
  h.points.push({ x: wx, z: wz, r: 2.2, label: tr('文化牌 · {name}', { name }), action: '阅读', kind: 'culture', culture: id })
}

/** 景点加载时调用：把挂在这个景点上的小店和文化牌一起建出来 */
export function buildLife(content: LifeContent, p: PlacedLandmark, h: KioskHost) {
  const id = p.def.id
  for (const s of content.shops) if (!isGeo(s.at) && s.at.landmark === id) kiosk(h, s, { x: s.at.x, z: s.at.z, face: s.at.face ?? 0, y: s.at.y ?? 0 })
  for (const c of content.culture) if ('plaque' in c.unlock && c.unlock.plaque.landmark === id) plaque(h, c.id, c.name, c.unlock.plaque)
}

/** 小店、文化牌的世界坐标 */
export function anchorWorld(a: Anchor | GeoAnchor, placed: PlacedLandmark[], proj: Projection): [number, number] | null {
  if (isGeo(a)) {
    const p = proj.project(a.lat, a.lon)
    return [p.x, p.z]
  }
  const p = placed.find((q) => q.def.id === a.landmark)
  return p ? p.toWorld(a.x, a.z) : null
}

/** 小店和文化牌的世界占地（分块盖房子、种树时让开） */
export function lifeFootprints(content: LifeContent, placed: PlacedLandmark[], proj: Projection): Lot[] {
  const anchors: [Anchor | GeoAnchor, number][] = [
    ...content.shops.map((s): [Anchor | GeoAnchor, number] => [s.at, KIOSK_R]),
    ...content.culture.flatMap((c): [Anchor, number][] => ('plaque' in c.unlock ? [[c.unlock.plaque, 1.5]] : []))
  ]
  return anchors.flatMap(([a, r]) => {
    const w = anchorWorld(a, placed, proj)
    return w ? [{ x0: w[0] - r, z0: w[1] - r, x1: w[0] + r, z1: w[1] + r }] : []
  })
}
