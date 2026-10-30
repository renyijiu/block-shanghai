// 时刻表：列车位置只由游戏时间决定（docs/04 第 1、6 节），纯函数，不用逐帧模拟、也不用存档
import type { LineKind, MetroRules, MetroService } from './data.ts'

export const DAY = 86400

export interface ServiceTimes {
  /** 各站到达、发车时刻（秒，相对始发站发车） */
  arrive: number[]
  depart: number[]
  /** 全程（秒，到达终点） */
  total: number
}

export function serviceTimes(s: MetroService, kind: LineKind, rules: MetroRules): ServiceTimes {
  const v = rules.avgSpeedKmh[kind]
  const arrive = [0]
  const depart = [0]
  for (let i = 1; i < s.stops.length; i++) {
    arrive.push(depart[i - 1]! + ((s.chainage[i]! - s.chainage[i - 1]!) / v) * 3600)
    depart.push(arrive[i]! + rules.dwellSec)
  }
  return { arrive, depart, total: arrive[arrive.length - 1]! }
}

/** 某时刻（当天的秒）的发车间隔（秒） */
export function headwaySec(daySec: number, express: boolean, rules: MetroRules) {
  if (express) return rules.headwayMin.express * 60
  const h = daySec / 3600
  const peak = rules.peakHours.some(([a, b]) => h >= a && h < b)
  return (peak ? rules.headwayMin.peak : rules.headwayMin.offpeak) * 60
}

/** 一天里从始发站发车的时刻（当天的秒），首班到末班 */
export function departures(s: MetroService, rules: MetroRules): number[] {
  const [open, close] = rules.serviceHours
  const out: number[] = []
  for (let t = open * 3600; t <= close * 3600; t += headwaySec(t, s.express, rules)) out.push(t)
  return out
}

export interface TrainState {
  /** 第几班（当天发车序号） */
  run: number
  /** 车头所在的真实里程（km） */
  km: number
  /** 停站中：停靠站下标；行驶中：null */
  atStop: number | null
  /** 下一站下标 */
  next: number
}

// 区间内的速度曲线：两端速度为零（加速、减速）
const ease = (f: number) => (1 - Math.cos(Math.PI * f)) / 2

/** 某交路在游戏时刻 t（秒，可跨天）在线运行的列车 */
export function trainsAt(s: MetroService, times: ServiceTimes, deps: number[], t: number): TrainState[] {
  const out: TrainState[] = []
  const day = ((t % DAY) + DAY) % DAY
  // 当天发的车，加上前一天深夜发、跨过零点还没到终点的车
  for (const base of [day, day + DAY]) {
    for (let k = lowerBound(deps, base - times.total); k < deps.length && deps[k]! <= base; k++) {
      const e = base - deps[k]!
      if (e >= times.total) continue
      out.push(stateAt(s, times, e, k))
    }
  }
  return out
}

function stateAt(s: MetroService, times: ServiceTimes, e: number, run: number): TrainState {
  const { arrive, depart } = times
  // 找到 depart[i] <= e < depart[i + 1]
  let i = 0
  while (i + 1 < depart.length && depart[i + 1]! <= e) i++
  if (e < depart[i]!) return { run, km: s.chainage[i]!, atStop: i, next: i + 1 }
  if (i + 1 >= arrive.length) return { run, km: s.chainage[i]!, atStop: i, next: i }
  if (e >= arrive[i + 1]!) return { run, km: s.chainage[i + 1]!, atStop: i + 1, next: i + 2 }
  const f = (e - depart[i]!) / (arrive[i + 1]! - depart[i]!)
  return { run, km: s.chainage[i]! + (s.chainage[i + 1]! - s.chainage[i]!) * ease(f), atStop: null, next: i + 1 }
}

function lowerBound(a: number[], v: number) {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (a[m]! < v) lo = m + 1
    else hi = m
  }
  return lo
}
