// 乘车流程用到的纯函数（docs/04 第 7 节）：站台两侧开往哪里、下一班几点到、逐站的时刻、报站文字、车厢拥挤程度
import type { MetroData } from '../metro/data.ts'
import type { MetroSystem, ServiceRuntime } from '../metro/MetroSystem.ts'
import { DAY } from '../metro/timetable.ts'

/** 站台的一侧：停靠的交路（和本站在交路里的站序）、开往哪里 */
export interface PlatformSide {
  runs: { rt: ServiceRuntime; stop: number }[]
  /** “莘庄”“上海火车站 / 莘庄”“内圈” */
  toward: string
  towardEn: string
}

/** 一班车在某站的停靠：交路、站序、这一班从始发站发车的时刻、到站和开车时刻（都是游戏秒，可以跨天） */
export interface TrainCall {
  rt: ServiceRuntime
  stop: number
  dep: number
  arrive: number
  depart: number
}

const stationPos = (data: MetroData, i: number) => data.stations[i]!.pos

/**
 * 某条线在某站的两侧站台：经过本站、后面还有站的交路，按开往下一站的方向分成两组
 * （环线、支线、大站车都按方向归到同一侧）。终到本站的交路不能上车，不算
 */
export function platformSides(metro: MetroSystem, station: number, line: string): PlatformSide[] {
  const groups: { dir: [number, number]; runs: { rt: ServiceRuntime; stop: number }[] }[] = []
  for (const rt of metro.services) {
    if (rt.line.id !== line) continue
    const stops = rt.service.stops
    const i = stops.indexOf(station)
    if (i < 0 || i >= stops.length - 1) continue
    const [ax, az] = stationPos(metro.data, station)
    const [bx, bz] = stationPos(metro.data, stops[i + 1]!)
    const len = Math.hypot(bx - ax, bz - az) || 1
    const dir: [number, number] = [(bx - ax) / len, (bz - az) / len]
    const g = groups.find((g) => g.dir[0] * dir[0] + g.dir[1] * dir[1] > 0) ?? (groups.length < 2 ? groups[groups.push({ dir, runs: [] }) - 1]! : groups[0]!)
    g.runs.push({ rt, stop: i })
  }
  return groups.map((g) => {
    const names = new Set<string>()
    const namesEn = new Set<string>()
    for (const { rt } of g.runs) {
      const loop = /内圈|外圈/.exec(rt.service.name)
      if (loop) {
        names.add(loop[0])
        namesEn.add(loop[0] === '内圈' ? 'Inner Loop' : 'Outer Loop')
        continue
      }
      const last = metro.data.stations[rt.service.stops[rt.service.stops.length - 1]!]!
      names.add(last.name)
      namesEn.add(last.nameEn)
    }
    return { runs: g.runs, toward: [...names].join(' / '), towardEn: [...namesEn].join(' / ') }
  })
}

/** 某交路第 run 班（始发时刻 dep）在站序 stop 的到站、开车时刻 */
export function callAt(rt: ServiceRuntime, stop: number, dep: number): TrainCall {
  return { rt, stop, dep, arrive: dep + rt.times.arrive[stop]!, depart: dep + rt.times.depart[stop]! }
}

/** 这一侧下一班到站（到站时刻 ≥ t 里最早的一班） */
export function nextCall(side: PlatformSide, t: number): TrainCall | null {
  let best: TrainCall | null = null
  const day = Math.floor(t / DAY) * DAY
  for (const { rt, stop } of side.runs) {
    const off = rt.times.arrive[stop]!
    for (const base of [day - DAY, day, day + DAY]) {
      // 二分找第一个到站时刻 ≥ t 的发车
      const deps = rt.deps
      let lo = 0
      let hi = deps.length
      while (lo < hi) {
        const m = (lo + hi) >> 1
        if (base + deps[m]! + off < t) lo = m + 1
        else hi = m
      }
      if (lo < deps.length) {
        const c = callAt(rt, stop, base + deps[lo]!)
        if (!best || c.arrive < best.arrive) best = c
        break
      }
    }
  }
  return best
}

/** 环线跑完一圈后接着坐：同一交路从始发站开出的下一班 */
export function loopContinue(rt: ServiceRuntime, t: number): TrainCall | null {
  return nextCall({ runs: [{ rt, stop: 0 }], toward: '', towardEn: '' }, t)
}

/** 本站还能换乘的其他线路 */
export function transferLines(data: MetroData, station: number, line: string) {
  const ids = data.stations[station]!.lines.filter((l) => l !== line)
  return ids.map((id) => data.lines.find((l) => l.id === id)!).filter(Boolean)
}

const joinEn = (a: string[]) => (a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

export interface Announcement {
  zh: string
  en: string
}

/** 报站：next = true 是“下一站”（开车后），false 是“到了”（进站开门）；terminal 是终点站 */
export function announce(data: MetroData, station: number, line: string, next: boolean, terminal: boolean): Announcement {
  const st = data.stations[station]!
  const other = transferLines(data, station, line)
  const zhT = other.length ? `可换乘${other.map((l) => l.name).join('、')}。` : ''
  const enT = other.length ? ` You can transfer to ${joinEn(other.map((l) => l.nameEn))}.` : ''
  if (next) {
    if (terminal) return { zh: `下一站：终点站 ${st.name}。${zhT}`, en: `Next stop: ${st.nameEn}, the terminal station.${enT}` }
    return { zh: `下一站：${st.name}。${zhT}`, en: `Next stop: ${st.nameEn}.${enT}` }
  }
  if (terminal) return { zh: `终点站 ${st.name} 到了，请全体乘客下车。`, en: `This is the terminal station, ${st.nameEn}. Please get off the train.` }
  return { zh: `${st.name} 到了。${zhT}`, en: `We are now at ${st.nameEn}.${enT}` }
}

/** 行驶区间的展示时长（现实秒）：按真实运行秒数缩放，限制在 10–15 秒（docs/04 第 7 节“时间压缩”） */
export const segmentSeconds = (gameSec: number) => Math.min(15, Math.max(10, gameSec / 12))

export type Crowd = 'full' | 'busy' | 'normal' | 'sparse'

/** 干线：早晚高峰车厢满员 */
const TRUNK = new Set(['L1', 'L2', 'L8', 'L9', 'L11'])

/** 车厢拥挤程度（docs/04 第 7 节“车厢里的人”）：干线高峰满员、其他线高峰没座位、平峰有座、深夜空 */
export function crowdLevel(line: string, daySec: number, peakHours: [number, number][]): Crowd {
  const h = daySec / 3600
  if (h < 6.5 || h >= 21.5) return 'sparse'
  if (peakHours.some(([a, b]) => h >= a && h < b)) return TRUNK.has(line) ? 'full' : 'busy'
  return 'normal'
}

const DIRS = ['东', '东南', '南', '西南', '西', '西北', '北', '东北']

/** 出口在车站的哪个方向（x 东、z 南） */
export function exitDirection(from: [number, number], to: [number, number]) {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0])
  return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]!
}
