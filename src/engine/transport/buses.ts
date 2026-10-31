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
