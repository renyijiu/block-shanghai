// 上海的程序化建筑和行道树（docs/05 第 3 节）。高度按建筑尺度：1 格 ≈ 2.5 米；树按人物尺度
import type { Builder } from '../../engine/build/Builder.ts'
import { range, type Rng } from '../../engine/build/random.ts'
import type { BuildingStyle, CityBuildings, Place, TreeStyle } from '../../engine/city.ts'
import type { Season } from '../../engine/sky/weather.ts'
import type { Lot } from '../../engine/world/lots.ts'

// ---------------------------------------------------------------- 风格分区
// 中心点是大致位置（WGS-84），只用来决定一片区域的建筑风格，不是景点坐标

interface Zone {
  name: string
  lat: number
  lon: number
  radiusKm: number
  mix: Record<string, number>
}

const ZONES: Zone[] = [
  { name: '陆家嘴', lat: 31.2365, lon: 121.505, radiusKm: 0.75, mix: { supertall: 0.75, office: 0.25 } },
  { name: '世纪大道', lat: 31.229, lon: 121.523, radiusKm: 1.6, mix: { office: 0.55, highrise: 0.45 } },
  { name: '人民广场 · 南京东路', lat: 31.235, lon: 121.48, radiusKm: 0.8, mix: { office: 0.5, shikumen: 0.5 } },
  { name: '南京西路', lat: 31.229, lon: 121.456, radiusKm: 0.9, mix: { office: 0.6, shikumen: 0.25, villa: 0.15 } },
  { name: '北外滩', lat: 31.251, lon: 121.498, radiusKm: 0.6, mix: { office: 0.6, shikumen: 0.4 } },
  { name: '徐家汇', lat: 31.194, lon: 121.437, radiusKm: 0.8, mix: { office: 0.65, highrise: 0.35 } },
  { name: '衡复风貌区', lat: 31.208, lon: 121.443, radiusKm: 1.5, mix: { villa: 0.65, shikumen: 0.2, xincun: 0.15 } },
  { name: '杨浦滨江', lat: 31.256, lon: 121.54, radiusKm: 0.9, mix: { industrial: 0.6, xincun: 0.4 } },
  { name: '徐汇西岸', lat: 31.168, lon: 121.46, radiusKm: 0.9, mix: { industrial: 0.55, office: 0.45 } },
  { name: '虹桥商务区', lat: 31.196, lon: 121.317, radiusKm: 1.4, mix: { office: 0.7, highrise: 0.3 } },
  { name: '朱家角', lat: 31.109, lon: 121.054, radiusKm: 0.9, mix: { jiangnan: 1 } },
  { name: '七宝', lat: 31.156, lon: 121.349, radiusKm: 0.5, mix: { jiangnan: 0.8, highrise: 0.2 } },
  // 度假区外面一圈以低层为主（停车场、公路、村镇），高层住宅离得远一些
  { name: '度假区周边', lat: 31.143, lon: 121.661, radiusKm: 2.8, mix: { suburban: 0.75, highrise: 0.1, industrial: 0.15 } }
]

/**
 * 上海国际旅游度假区：外面那圈环形河道围起来的范围（按烘焙的水面数据描的，[纬度, 经度]）。
 * 里面不盖住宅楼，大部分地块是园林绿地，零星几栋低层的度假酒店；湖、湖边小镇和星愿游乐园是景点
 */
export const RESORT: [number, number][] = [
  [31.15273, 121.64267],
  [31.15347, 121.65902],
  [31.1561, 121.66999],
  [31.15725, 121.67223],
  [31.13892, 121.67945],
  [31.13791, 121.678],
  [31.13435, 121.66711],
  [31.1295, 121.65137],
  [31.14535, 121.64433],
  [31.15288, 121.64201]
]

/** 点在多边形里（射线法，经纬度直接当平面坐标用，范围很小） */
export function inPolygon(lat: number, lon: number, poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ai, bi] = poly[i]!
    const [aj, bj] = poly[j]!
    if (bi > lon !== bj > lon && lat < ((aj - ai) * (lon - bi)) / (bj - bi) + ai) inside = !inside
  }
  return inside
}

const CORE_KM = 12 // 约到中环
const kmBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 110.574)

const PUXI_CORE = ['huangpu', 'jingan', 'xuhui', 'changning', 'putuo', 'hongkou', 'yangpu']

function mixAt(p: Place): Record<string, number> | null {
  if (!p.district) return null
  if (inPolygon(p.lat, p.lon, RESORT)) return { resortgarden: 0.75, resorthotel: 0.25 }
  for (const z of ZONES) if (kmBetween(p, z) < z.radiusKm) return z.mix
  if (p.distKm < CORE_KM) {
    if (['huangpu', 'jingan', 'hongkou'].includes(p.district)) return { shikumen: 0.55, xincun: 0.15, office: 0.15, highrise: 0.15 }
    if (['yangpu', 'putuo'].includes(p.district)) return { xincun: 0.55, highrise: 0.3, industrial: 0.15 }
    if (['xuhui', 'changning'].includes(p.district)) return { xincun: 0.35, highrise: 0.35, villa: 0.15, office: 0.15 }
    if (p.district === 'pudong') return { highrise: 0.5, xincun: 0.3, office: 0.2 }
    return { highrise: 0.5, xincun: 0.4, industrial: 0.1 }
  }
  if (p.district === 'chongming') return { suburban: 0.95, highrise: 0.05 }
  if (p.distKm < 25) return { highrise: 0.55, xincun: 0.15, industrial: 0.15, suburban: 0.15 }
  return { suburban: 0.75, industrial: 0.15, highrise: 0.1 }
}

// 浦西核心区以法国梧桐为主，配香樟；浦东和外圈以香樟为主（docs/05 第 3 节）
function treeMixAt(p: Place): Record<string, number> | null {
  if (!p.district) return null
  if (PUXI_CORE.includes(p.district) && p.distKm < CORE_KM) return { plane: 0.6, camphor: 0.3, ginkgo: 0.08, magnolia: 0.02 }
  return { camphor: 0.75, plane: 0.1, ginkgo: 0.1, magnolia: 0.05 }
}

// ---------------------------------------------------------------- 工具

const choose = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!
// 高度偏向低值：大多数楼不太高，少数很高
const skewed = (rng: Rng, a: number, b: number, k = 1.6) => a + Math.pow(rng(), k) * (b - a)
const center = (l: Lot) => [(l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2] as const

/** 以 (cx, cz) 为中心、宽 w 深 d 的方块 */
function boxAt(b: Builder, cx: number, cz: number, w: number, d: number, y0: number, y1: number, color: number, o: Parameters<Builder['box']>[7] = {}) {
  b.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y1, cz + d / 2, color, o)
}

// ---------------------------------------------------------------- 建筑风格

const supertall: BuildingStyle = (b, l, rng) => {
  const [cx, cz] = center(l)
  boxAt(b, cx, cz, l.x1 - l.x0 - 1, l.z1 - l.z0 - 1, 0, 5, 0xb8b2a6)
  const s = range(rng, 9, 13.5)
  const h = skewed(rng, 60, 180)
  const glass = choose(rng, [0x6f8fa8, 0x86a3b8, 0x5b7a91, 0x7a90a0])
  const step = 0.6 + rng() * 0.15
  boxAt(b, cx, cz, s, s, 5, h * step, glass, { glass: true })
  boxAt(b, cx, cz, s * 0.78, s * 0.78, h * step, h, glass, { glass: true })
  // 塔冠
  boxAt(b, cx, cz, s * 0.5, s * 0.5, h, h + range(rng, 3, 8), 0x9aa7b0, { windows: 0 })
}

const office: BuildingStyle = (b, l, rng) => {
  const [cx, cz] = center(l)
  const ph = range(rng, 4, 6)
  boxAt(b, cx, cz, l.x1 - l.x0 - range(rng, 1, 3), l.z1 - l.z0 - range(rng, 1, 3), 0, ph, choose(rng, [0xa59e92, 0xb8b2a6, 0x9c968c]))
  const w = range(rng, 8, 13)
  const d = range(rng, 8, 13)
  const h = skewed(rng, 30, 90)
  const isGlass = rng() < 0.5
  const color = isGlass ? choose(rng, [0x7c97ab, 0x6d889c, 0x8aa0ae]) : choose(rng, [0xc9c0b0, 0xb8b2a6, 0xd6d0c4, 0xa9a39a])
  boxAt(b, cx, cz, w, d, ph, h, color, { glass: isGlass })
  boxAt(b, cx + range(rng, -1, 1), cz + range(rng, -1, 1), w * 0.4, d * 0.4, h, h + 2.5, 0x8f8b84, { windows: 0 })
}

// 石库门：成排的两三层砖楼，排与排之间是弄堂；坡屋顶
const shikumen: BuildingStyle = (b, l, rng) => {
  const alongX = rng() < 0.5
  const len = alongX ? l.x1 - l.x0 : l.z1 - l.z0
  const depth = alongX ? l.z1 - l.z0 : l.x1 - l.x0
  const rowW = 3.2
  const lane = 1.8
  const rows = Math.floor((depth + lane) / (rowW + lane))
  const wall = choose(rng, [0x9a6b55, 0x8b847a, 0xa47a62, 0x948c80])
  for (let i = 0; i < rows; i++) {
    const h = range(rng, 3, 4.4)
    const o = i * (rowW + lane)
    const [x0, z0, x1, z1] = alongX ? [l.x0, l.z0 + o, l.x0 + len, l.z0 + o + rowW] : [l.x0 + o, l.z0, l.x0 + o + rowW, l.z0 + len]
    b.box(x0, 0, z0, x1, h, z1, wall, { windows: 0.7 })
    b.gable(x0 - 0.15, z0 - 0.2, x1 + 0.15, z1 + 0.2, h, 1.1, alongX ? 'x' : 'z', 0x4a4a4e, wall)
  }
}

// 老洋房：一两栋独立住宅，红瓦坡屋顶，花园围墙，院里有树
const villa: BuildingStyle = (b, l, rng, season) => {
  const [cx, cz] = center(l)
  const wallC = 0xd9d2c3
  const t = 0.4
  b.box(l.x0, 0, l.z0, l.x1, 1.2, l.z0 + t, wallC, { windows: 0 })
  b.box(l.x0, 0, l.z1 - t, l.x1, 1.2, l.z1, wallC, { windows: 0 })
  b.box(l.x0, 0, l.z0, l.x0 + t, 1.2, l.z1, wallC, { windows: 0 })
  b.box(l.x1 - t, 0, l.z0, l.x1, 1.2, cz - 1.5, wallC, { windows: 0 })
  b.box(l.x1 - t, 0, cz + 1.5, l.x1, 1.2, l.z1, wallC, { windows: 0 })
  const houses = rng() < 0.4 ? 2 : 1
  for (let i = 0; i < houses; i++) {
    const w = range(rng, 6.5, 9)
    const d = range(rng, 5.5, 7.5)
    const hx = houses === 2 ? cx + (i ? 4.5 : -4.5) : cx + range(rng, -2, 2)
    const hz = cz + range(rng, -2.5, 0.5)
    const h = range(rng, 4, 5.5)
    const wall = choose(rng, [0xe8dcc6, 0xd8c3a0, 0xb88a6a, 0xefe6d4])
    boxAt(b, hx, hz, w, d, 0, h, wall)
    const axis = w > d ? 'x' : 'z'
    b.gable(hx - w / 2 - 0.3, hz - d / 2 - 0.3, hx + w / 2 + 0.3, hz + d / 2 + 0.3, h, 2.2, axis, choose(rng, [0xa0523d, 0x8c4a3a, 0x6b4a3a]), wall)
    boxAt(b, hx + w / 4, hz, 0.8, 0.8, h, h + 2.6, 0x8c6a55, { windows: 0, collide: false })
  }
  camphor(b, l.x0 + 2.5, l.z1 - 2.5, rng, season)
  if (rng() < 0.6) plane(b, l.x1 - 2.5, l.z1 - 2.5, rng, season)
}

// 工人新村：五六层板楼，东西向平行排列、朝南
const xincun: BuildingStyle = (b, l, rng) => {
  const color = choose(rng, [0xe8dfc8, 0xd9c9a8, 0xf0e6d6, 0xc9b9a0, 0xe0c9c0])
  const slabD = 4.5
  const gap = 4
  const n = Math.floor((l.z1 - l.z0 + gap) / (slabD + gap))
  for (let i = 0; i < n; i++) {
    const z0 = l.z0 + i * (slabD + gap)
    const len = range(rng, 14, l.x1 - l.x0)
    const x0 = l.x0 + range(rng, 0, l.x1 - l.x0 - len)
    const h = range(rng, 6, 7.4)
    b.box(x0, 0, z0, x0 + len, h, z0 + slabD, color, { top: 0x9d968a })
    b.box(x0 + len / 2 - 1, h, z0 + 1, x0 + len / 2 + 1, h + 1, z0 + 3, 0x9d968a, { windows: 0, collide: false })
  }
}

// 高层住宅：点式塔楼
const highrise: BuildingStyle = (b, l, rng) => {
  const [cx, cz] = center(l)
  const two = rng() < 0.45
  const color = choose(rng, [0xeae3d6, 0xd8cfc0, 0xc6c9cf, 0xe2d5c2, 0xd4c2b0])
  for (let i = 0; i < (two ? 2 : 1); i++) {
    const s = range(rng, 7, 8.5)
    const h = skewed(rng, 25, 45, 1.2)
    const x = two ? cx + (i ? 4.6 : -4.6) : cx + range(rng, -2, 2)
    const z = two ? cz + (i ? 3 : -3) : cz + range(rng, -2, 2)
    boxAt(b, x, z, s, s, 0, h, color, { top: 0x8c8a86 })
    boxAt(b, x, z, s * 0.45, s * 0.45, h, h + 1.6, 0x8c8a86, { windows: 0, collide: false })
  }
}

// 工业：大厂房、烟囱、油罐
const industrial: BuildingStyle = (b, l, rng) => {
  const [cx, cz] = center(l)
  const w = range(rng, 12, l.x1 - l.x0)
  const d = range(rng, 10, l.z1 - l.z0)
  const h = range(rng, 6, 10)
  const wall = choose(rng, [0xa9aeb2, 0x8c9399, 0xb3a28a, 0x9a8f80])
  boxAt(b, cx, cz, w, d, 0, h, wall, { windows: 0.4 })
  b.gable(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h, 1.6, w > d ? 'x' : 'z', 0x6f7a80, wall)
  if (rng() < 0.35) boxAt(b, l.x0 + 2, l.z0 + 2, 1.6, 1.6, 0, range(rng, 16, 26), 0x9a6a55, { windows: 0 })
  else if (rng() < 0.4) {
    for (let i = 0; i < 2; i++) boxAt(b, l.x0 + 3 + i * 6, l.z1 - 3, 4.5, 4.5, 0, 5, 0xc8c8c8, { windows: 0, top: 0xb0b0b0 })
  }
}

// 江南水乡：粉墙黛瓦的小房子，密
const jiangnan: BuildingStyle = (b, l, rng) => {
  const n = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < n; i++) {
    const w = range(rng, 4.5, 7)
    const d = range(rng, 4, 6)
    const x = range(rng, l.x0 + w / 2, l.x1 - w / 2)
    const z = range(rng, l.z0 + d / 2, l.z1 - d / 2)
    const h = range(rng, 2.5, 3.6)
    boxAt(b, x, z, w, d, 0, h, 0xf2efe6, { windows: 0.5 })
    b.gable(x - w / 2 - 0.3, z - d / 2 - 0.3, x + w / 2 + 0.3, z + d / 2 + 0.3, h, 1.4, w > d ? 'x' : 'z', 0x3a3b40, 0xf2efe6)
  }
}

// 远郊村镇：稀疏的小楼
const suburban: BuildingStyle = (b, l, rng) => {
  if (rng() < 0.45) return
  const n = 1 + Math.floor(rng() * 3)
  for (let i = 0; i < n; i++) {
    const w = range(rng, 5, 7)
    const d = range(rng, 5, 6)
    const x = range(rng, l.x0 + w / 2, l.x1 - w / 2)
    const z = range(rng, l.z0 + d / 2, l.z1 - d / 2)
    const h = range(rng, 3, 4.6)
    boxAt(b, x, z, w, d, 0, h, choose(rng, [0xece7dc, 0xe3dccd, 0xf2eee6]))
    if (rng() < 0.7) b.gable(x - w / 2 - 0.3, z - d / 2 - 0.3, x + w / 2 + 0.3, z + d / 2 + 0.3, h, 1.5, w > d ? 'x' : 'z', choose(rng, [0x4a6fa0, 0xa04a3a, 0x5a5d62]), 0xece7dc)
  }
}

// 度假区的园林：草坪、弯弯的步道、花坛和几丛树（不盖楼）
const resortgarden: BuildingStyle = (b, l, rng) => {
  const flat = { windows: 0, collide: false } as const
  b.box(l.x0, 0, l.z0, l.x1, 0.04, l.z1, choose(rng, [0x7fb069, 0x86b56e, 0x78a862]), flat)
  // 一条斜穿地块的步道
  const alongX = rng() < 0.5
  const t = range(rng, 0.3, 0.7)
  if (alongX) b.box(l.x0, 0, l.z0 + (l.z1 - l.z0) * t - 1, l.x1, 0.06, l.z0 + (l.z1 - l.z0) * t + 1, 0xd9cdb4, flat)
  else b.box(l.x0 + (l.x1 - l.x0) * t - 1, 0, l.z0, l.x0 + (l.x1 - l.x0) * t + 1, 0.06, l.z1, 0xd9cdb4, flat)
  const n = Math.floor(((l.x1 - l.x0) * (l.z1 - l.z0)) / 60)
  for (let i = 0; i < n; i++) {
    const x = range(rng, l.x0 + 1.5, l.x1 - 1.5)
    const z = range(rng, l.z0 + 1.5, l.z1 - 1.5)
    if (rng() < 0.25) {
      // 花坛
      boxAt(b, x, z, range(rng, 2, 3.5), range(rng, 2, 3.5), 0, 0.4, choose(rng, [0xf2a0b8, 0xf7d36a, 0xe07a5a, 0xc8a0f0]), flat)
      continue
    }
    const h = range(rng, 3.5, 6)
    trunk(b, x, z, 0.4, h * 0.5, 0x6b4a32)
    crown(b, x, z, range(rng, 2.4, 3.4), h * 0.45, h, choose(rng, [0x3f7d3a, 0x4f8f3a, 0x5b9a46]))
  }
}

// 度假酒店：三四层的彩色长楼，坡屋顶，一头有座小塔，门前一片草坪
const resorthotel: BuildingStyle = (b, l, rng) => {
  const flat = { windows: 0, collide: false } as const
  b.box(l.x0, 0, l.z0, l.x1, 0.04, l.z1, 0x86b56e, flat)
  const [cx, cz] = center(l)
  const alongX = l.x1 - l.x0 >= l.z1 - l.z0
  const len = Math.min(26, (alongX ? l.x1 - l.x0 : l.z1 - l.z0) - 3)
  const dep = Math.min(9, (alongX ? l.z1 - l.z0 : l.x1 - l.x0) - 4)
  if (len < 10 || dep < 5) return resortgarden(b, l, rng, 'summer')
  const h = range(rng, 8, 11)
  const wall = choose(rng, [0xf4e6d0, 0xf2d6c8, 0xe8eef4, 0xf3e7b8])
  const roof = choose(rng, [0x3f7fbf, 0x2f7a6a, 0xa04a3a])
  const [w, d] = alongX ? [len, dep] : [dep, len]
  boxAt(b, cx, cz, w, d, 0, h, wall, { windows: 0.7 })
  b.gable(cx - w / 2 - 0.3, cz - d / 2 - 0.3, cx + w / 2 + 0.3, cz + d / 2 + 0.3, h, 2.4, alongX ? 'x' : 'z', roof, wall)
  // 一头的小塔，尖顶
  const [tx, tz] = alongX ? [cx + w / 2 - 2.5, cz] : [cx, cz + d / 2 - 2.5]
  boxAt(b, tx, tz, 4, 4, 0, h + 4, wall, { windows: 0.5 })
  boxAt(b, tx, tz, 3, 3, h + 4, h + 6, roof, { windows: 0 })
  boxAt(b, tx, tz, 1.4, 1.4, h + 6, h + 7.5, roof, { windows: 0 })
}

// ---------------------------------------------------------------- 行道树（人物尺度）

const trunk = (b: Builder, x: number, z: number, w: number, h: number, color: number) =>
  b.box(x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, color, { windows: 0, collide: true })
// 树冠只挡相机：人能从树下走过，第三人称相机不会钻进树冠
const crown = (b: Builder, x: number, z: number, w: number, y0: number, y1: number, color: number) =>
  b.box(x - w / 2, y0, z - w / 2, x + w / 2, y1, z + w / 2, color, { windows: 0, collide: 'camera' })

// 冬天落叶：树干往上分几根枝杈
const bare = (b: Builder, x: number, z: number, h: number, spread: number, color: number) => {
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ] as const) {
    const ox = (dx * spread) / 3
    const oz = (dz * spread) / 3
    b.box(x + ox - 0.09, h - 0.3, z + oz - 0.09, x + ox + 0.09, h + spread * 0.55, z + oz + 0.09, color, { windows: 0, collide: 'camera' })
  }
  b.box(x - 0.12, h - 0.2, z - 0.12, x + 0.12, h + spread * 0.7, z + 0.12, color, { windows: 0, collide: 'camera' })
}

// 树冠颜色按季节：[下层, 上层]
const PLANE: Record<Season, [number, number] | null> = { spring: [0x9cc25a, 0xaccf6a], summer: [0x77a64a, 0x86b257], autumn: [0xc79b3a, 0xd6ae4a], winter: null }
const GINKGO: Record<Season, [number, number] | null> = { spring: [0xb5d06a, 0xc2da78], summer: [0xa6be4c, 0xb5c95a], autumn: [0xf0be2a, 0xf7d045], winter: null }
const CAMPHOR: Record<Season, [number, number]> = { spring: [0x4f8a3e, 0x7aa84e], summer: [0x3f7a3a, 0x4a8a40], autumn: [0x3f7a3a, 0x4a8a40], winter: [0x3a6e38, 0x44793c] }

// 法国梧桐：斑驳的浅色树干，宽而扁的树冠；秋天黄褐，冬天落叶
const plane: TreeStyle = (b, x, z, rng, season) => {
  const h = range(rng, 3, 3.6)
  trunk(b, x, z, 0.6, h, 0x9c927d)
  const w = range(rng, 4.2, 5)
  const ox = range(rng, -0.3, 0.3)
  const oz = range(rng, -0.3, 0.3)
  const c = PLANE[season]
  if (!c) return bare(b, x, z, h, w * 0.6, 0x8a806c)
  crown(b, x + ox, z + oz, w, h - 0.2, h + 1.6, c[0])
  crown(b, x, z, w * 0.72, h + 1.6, h + 2.8, c[1])
}

// 香樟：深色树干，浓绿的圆冠；四季常绿，春天新叶偏浅
const camphor: TreeStyle = (b, x, z, rng, season) => {
  const h = range(rng, 2.2, 2.7)
  trunk(b, x, z, 0.55, h, 0x5d4a36)
  const w = range(rng, 3.4, 4.2)
  const c = CAMPHOR[season]
  crown(b, x, z, w, h - 0.2, h + 2.4, c[0])
  crown(b, x, z, w * 0.66, h + 2.4, h + 3.3, c[1])
}

// 银杏：细高的树冠；秋天金黄，冬天落叶
const ginkgo: TreeStyle = (b, x, z, rng, season) => {
  const h = range(rng, 2.6, 3.1)
  trunk(b, x, z, 0.45, h, 0x6b5a45)
  const c = GINKGO[season]
  if (!c) return bare(b, x, z, h, 2.4, 0x6b5a45)
  crown(b, x, z, 2.2, h - 0.2, h + 3.6, c[0])
  crown(b, x, z, 1.4, h + 3.6, h + 4.6, c[1])
}

// 白玉兰（市花）：小乔木；春天满树白花，冬天落叶
const magnolia: TreeStyle = (b, x, z, rng, season) => {
  const h = range(rng, 1.8, 2.2)
  trunk(b, x, z, 0.45, h, 0x6b5a45)
  if (season === 'winter') return bare(b, x, z, h, 2, 0x6b5a45)
  crown(b, x, z, 3, h - 0.2, h + 2.2, season === 'spring' ? 0xf4efe6 : 0x6a9a4a)
  if (season === 'spring') crown(b, x, z, 1.8, h + 2.2, h + 2.8, 0xf8e8ec)
}

export const buildings: CityBuildings = {
  mixAt,
  styles: { supertall, office, shikumen, villa, xincun, highrise, industrial, jiangnan, suburban, resortgarden, resorthotel },
  treeMixAt,
  trees: { plane, camphor, ginkgo, magnolia },
  treeSpacing: 6
}
