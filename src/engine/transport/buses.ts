// 观光巴士：沿路线开到头再掉头往回开，按时刻表算车的位置（纯函数，和船、地铁一个思路）
import { Polyline } from './boats.ts'

export interface BusLine {
  id: string
  name: string
  fare: number
  path: Polyline
  /** 站：名字和在路线上的弧长位置（格），按路线顺序 */
  stops: { name: string; s: number }[]
  speed: number
  /** 首班、末班、发车间隔、每站停靠（秒） */
  first: number
  last: number
  headway: number
  dwell: number
}

export interface BusPose {
  x: number
  z: number
  /** 车头朝向（atan2(dz, dx)） */
  angle: number
}

const DAY = 86400
/** 靠右行驶：车偏到前进方向右侧这么多格（不撞高架的桥墩、来回两个方向错开） */
export const BUS_LANE = 2.4
/** 站牌离路线的默认距离（找不到路的时候） */
export const STOP_OFFSET = BUS_LANE + 3.2
/** 站牌离路线最远多少格（宽马路上车道在路中间，站牌也不离车太远） */
export const STOP_MAX = BUS_LANE + 5

/** 一段地面道路：中线上离查询点最近的点、路宽、走向（弧度） */
export interface RoadNear {
  x: number
  z: number
  width: number
  dir: number
}

/**
 * 站牌离路线多远：立在这一侧路缘外 1.5 格的人行道上，窄路宽路都贴着路边，人站在站牌下就能扫共享单车。
 * road 是离路线上这一点最近的地面道路，h 是路线走向（弧度），站牌在 (-sin h, cos h) 一侧；
 * 路和路线不顺着（路口的横路）或者没找到路时用默认距离。最近不压到车身（车顶高过候车亭），最远 STOP_MAX
 */
export function stopOffset(road: RoadNear | null, x: number, z: number, h: number) {
  if (!road || Math.abs(Math.sin(road.dir - h)) > 0.5) return STOP_OFFSET
  const c = (road.x - x) * -Math.sin(h) + (road.z - z) * Math.cos(h)
  return Math.min(STOP_MAX, Math.max(BUS_LANE + 2, c + road.width / 2 + 1.5))
}

/** 候车亭占的地方（相对站牌杆）：沿路线方向 ±1.9，顶棚往外到 1、往里到 0.4；每半格取一个点，细柱子也漏不掉 */
const SHELTER: [along: number, out: number][] = Array.from({ length: 9 }, (_, i) => -1.9 + i * 0.475).flatMap((a) => [-0.4, 0.3, 1].map((b): [number, number] => [a, b]))
/** 只立站牌（不带候车亭）占的点：杆子和两边的牌子 */
const POLE: [along: number, out: number][] = [
  [0, 0],
  [-0.7, 0],
  [0.7, 0]
]

/**
 * 站牌立在路线上的哪儿：从 s0 开始前后找（0、+2、-2、+4……最远 40 格），取第一个立得下的地方——
 * 旁边的路顺着路线走（不在路口拐弯处），站牌和候车亭不压在任何地面道路上、也不碰别的东西（地铁出入口、房子），
 * 站牌离路缘不超过 2 格（路线画得偏离路中线时，按最近距离立的站牌会离路太远，站在站牌下扫不了共享单车）。
 * 人行道太窄、哪儿都放不下候车亭的（外滩的楼贴着马路），就只立一根站牌，再按同样的办法找一遍。
 * at 给路线上一点的坐标和走向，roadAt 给最近的地面道路，edgeAt 给一点离最近路面边缘多远（在路面上是负的），
 * blocked 说一点有没有被别的东西占着。
 * 都立不下就还在 s0，用默认距离
 */
export function placeStop(
  s0: number,
  length: number,
  at: (s: number) => { x: number; z: number; h: number },
  roadAt: (x: number, z: number) => RoadNear | null,
  edgeAt: (x: number, z: number) => number,
  blocked: (x: number, z: number) => boolean = () => false
) {
  const pole = (s: number, off: number, shelter: boolean) => {
    const p = at(s)
    const [nx, nz, ux, uz] = [-Math.sin(p.h), Math.cos(p.h), Math.cos(p.h), Math.sin(p.h)]
    const x = p.x + nx * off
    const z = p.z + nz * off
    const clear =
      edgeAt(x, z) <= 2 &&
      (shelter ? SHELTER : POLE).every(([a, b]) => {
        const [px, pz] = [x + ux * a + nx * b, z + uz * a + nz * b]
        return edgeAt(px, pz) >= 0.2 && !blocked(px, pz)
      })
    return { s, x, z, h: p.h, shelter, clear }
  }
  for (const shelter of [true, false]) {
    for (let k = 0; k <= 40; k++) {
      const s = s0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2
      if (s < 0 || s > length) continue
      const p = at(s)
      const road = roadAt(p.x, p.z)
      if (!road || Math.abs(Math.sin(road.dir - p.h)) > 0.3) continue
      const placed = pole(s, stopOffset(road, p.x, p.z, p.h), shelter)
      if (placed.clear) return placed
    }
  }
  return pole(s0, STOP_OFFSET, true)
}

/** 方向 dir（0 顺着路线，1 反过来）上各站的弧长，按经过的顺序 */
function order(l: BusLine, dir: 0 | 1) {
  const L = l.path.length
  const s = l.stops.map((st) => (dir === 0 ? st.s : L - st.s))
  return dir === 0 ? s : s.reverse()
}

/** 第 k 站（按经过顺序）的到站时刻，相对始发（秒）：前面每个中间站都停 dwell */
export function arriveAt(l: BusLine, dir: 0 | 1, k: number) {
  const s = order(l, dir)
  return (s[k]! - s[0]!) / l.speed + Math.max(0, k - 1) * l.dwell
}

/** 单程时间（秒） */
export const tripTime = (l: BusLine) => arriveAt(l, 0, l.stops.length - 1)

/** 站序号（路线顺序）换成方向 dir 上的经过顺序 */
export const seq = (l: BusLine, dir: 0 | 1, stop: number) => (dir === 0 ? stop : l.stops.length - 1 - stop)

/** 始发 dep 的这一班在 t 时的位置：没发车或者已经到终点返回 null */
export function busPose(l: BusLine, dir: 0 | 1, dep: number, t: number): BusPose | null {
  const dt = t - dep
  if (dt < 0 || dt > tripTime(l)) return null
  const s = order(l, dir)
  let along = s[s.length - 1]!
  for (let k = 1; k < s.length; k++) {
    const a = arriveAt(l, dir, k)
    if (dt < a) {
      // 在第 k-1 站和第 k 站之间：先在第 k-1 站停 dwell（始发站不停）
      const leave = k - 1 === 0 ? 0 : arriveAt(l, dir, k - 1) + l.dwell
      along = dt < leave ? s[k - 1]! : s[k - 1]! + (dt - leave) * l.speed
      break
    }
    if (dt < a + l.dwell && k < s.length - 1) {
      along = s[k]!
      break
    }
  }
  const real = dir === 0 ? along : l.path.length - along
  const [x, z] = l.path.at(real)
  const h = l.path.heading(real, 6) + (dir === 0 ? 0 : Math.PI)
  return { x: x - Math.sin(h) * BUS_LANE, z: z + Math.cos(h) * BUS_LANE, angle: h }
}

/** 两头始发的班次：first 起每 headway 一班，到 last 为止 */
function departures(l: BusLine, day: number) {
  const out: number[] = []
  for (let d = l.first; d <= l.last; d += l.headway) out.push(day + d)
  return out
}

/** 在 t 时路上的所有车 */
export function busesAt(l: BusLine, t: number): { dir: 0 | 1; dep: number; pose: BusPose }[] {
  const day = Math.floor(t / DAY) * DAY
  const out: { dir: 0 | 1; dep: number; pose: BusPose }[] = []
  for (const dir of [0, 1] as const)
    for (const dep of departures(l, day)) {
      const pose = busPose(l, dir, dep, t)
      if (pose) out.push({ dir, dep, pose })
    }
  return out
}

/** 从站 from 去站 to（路线顺序）的下一班：始发时刻、到 from 站、到 to 站的时刻；今天没车了就是明天的头班 */
export function nextBus(l: BusLine, from: number, to: number, t: number) {
  const dir: 0 | 1 = to > from ? 0 : 1
  const a = arriveAt(l, dir, seq(l, dir, from))
  const b = arriveAt(l, dir, seq(l, dir, to))
  const day = Math.floor(t / DAY) * DAY
  for (const d of [day, day + DAY])
    for (const dep of departures(l, d)) if (dep + a >= t) return { dir, dep, board: dep + a, arrive: dep + b }
  return { dir, dep: day + DAY + l.first, board: day + DAY + l.first + a, arrive: day + DAY + l.first + b }
}
