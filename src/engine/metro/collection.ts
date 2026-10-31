// 地铁的收集和任务（docs/04 第 8 节）：地铁事件、集站图鉴、线路徽章、成就、每日任务。
// 纯函数：进度存在存档里，事件来了就更新进度、返回新达成的东西
import type { MetroData } from './data.ts'
import { localize, nameOf, tr } from '../../i18n/core.ts'

/** 一次进站到出站：进站的车站和坐过的每一段 */
export interface Trip {
  entry: number
  legs: { line: string; from: number; to: number }[]
}

/** 地铁事件：站内流程和快速到达都会发出 */
export type MetroEvent =
  | { type: 'metroEnter'; station: number }
  | { type: 'metroExit'; station: number; exit: string; fare: number; trip: Trip }
  | { type: 'metroRide'; line: string; from: number; to: number; stations: number[]; t0: number }
  | { type: 'metroTransfer'; station: number; from: string; to: string }
  /** 从某个出入口回到街上 */
  | { type: 'metroLeave'; station: number; entrance: number }

export interface MetroProgress {
  /** 完成的乘车次数（一次进出站算一次） */
  rides: number
  /** 到访过的车站 id → 第一次到访的游戏时间（秒）；进站、出站、换乘算到访，只坐车经过不算 */
  visits: Record<string, number>
  /** 坐过的区间：“线路:站A|站B”（站 id 排序，不分方向） */
  segments: string[]
  /** 换乘过的车站 id */
  transfers: string[]
  /** 成就 id → 达成时的游戏时间 */
  achievements: Record<string, number>
  /** 每日任务：日期（现实日期 YYYY-MM-DD）、当天坐过的线路、完成的任务 id */
  daily: { date: string; lines: string[]; done: string[] }
}

export const newProgress = (): MetroProgress => ({ rides: 0, visits: {}, segments: [], transfers: [], achievements: {}, daily: { date: '', lines: [], done: [] } })

export interface Achievement {
  id: string
  name: string
  desc: string
}

export const ACHIEVEMENTS: Achievement[] = localize([
  { id: 'first-ride', name: '第一次坐地铁', desc: '完成一次乘车（以后在纪念品里换纪念交通卡）' },
  { id: 'loop-4', name: '环线一周', desc: '4 号线不出站坐满一圈' },
  { id: 'century-avenue', name: '四线换乘', desc: '在世纪大道站换乘一次' },
  { id: 'transfer-5', name: '换乘达人', desc: '在 5 个不同车站换乘过' },
  { id: 'rush-hour', name: '早高峰体验', desc: '7:30–9:00 乘坐 1 号线或 2 号线' },
  { id: 'maglev', name: '磁浮初体验', desc: '乘坐磁浮' },
  { id: 'under-river', name: '黄浦江底下', desc: '乘 2 号线从南京东路到陆家嘴（或反过来）' },
  { id: 'end-to-end', name: '从头坐到尾', desc: '到访任一线路的两个终点站' },
  { id: 'collect-50', name: '集站 50', desc: '到访 50 个车站' },
  { id: 'collect-100', name: '集站 100', desc: '到访 100 个车站' },
  { id: 'collect-all', name: '全网打卡', desc: '到访全部车站' }
])

const segKey = (data: MetroData, line: string, a: number, b: number) => {
  const [x, y] = [data.stations[a]!.id, data.stations[b]!.id].sort()
  return `${line}:${x}|${y}`
}

const cache = new WeakMap<MetroData, { segments: Map<string, Set<string>>; stations: Map<string, Set<number>> }>()

/** 每条线的全部区间、全部车站（所有交路合起来） */
export function lineIndex(data: MetroData) {
  let c = cache.get(data)
  if (!c) {
    c = { segments: new Map(), stations: new Map() }
    for (const l of data.lines) {
      const segs = new Set<string>()
      const sts = new Set<number>()
      for (const s of l.services) {
        s.stops.forEach((st, i) => {
          sts.add(st)
          if (i && s.stops[i - 1] !== st) segs.add(segKey(data, l.id, s.stops[i - 1]!, st))
        })
      }
      c.segments.set(l.id, segs)
      c.stations.set(l.id, sts)
    }
    cache.set(data, c)
  }
  return c
}

/** 线路徽章：每条线坐过的区间 / 全部区间 */
export function badges(data: MetroData, p: MetroProgress) {
  const { segments } = lineIndex(data)
  const done = new Set(p.segments)
  return data.lines.map((l) => {
    const all = segments.get(l.id)!
    let n = 0
    for (const s of all) if (done.has(s)) n++
    return { line: l.id, done: n, total: all.size, lit: all.size > 0 && n === all.size }
  })
}

/** 新达成的东西：成就、点亮的线路徽章、完成的每日任务 */
export interface Gain {
  achievements: string[]
  badges: string[]
  daily: string[]
}

export interface DailyTask {
  id: string
  title: string
}

/** 每日任务里“从指定出口出站去某个景点”的候选：景点名和离它最近的出入口 */
export interface ExitTarget {
  landmark: string
  entrance: number
}

// 日期 → 种子
const hash = (s: string) => {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

/** 当天的每日任务（docs/04 第 8 节“每日任务池”）：坐两条不同的线、到访一个新车站、从指定出口出站去某个景点 */
export function dailyTasks(data: MetroData, date: string, exits: ExitTarget[]): DailyTask[] {
  const tasks: DailyTask[] = [
    { id: 'lines-2', title: tr('今天乘坐 2 条不同线路') },
    { id: 'new-station', title: tr('今天到访 1 个新车站') }
  ]
  const target = exits.length ? exits[hash(date) % exits.length]! : null
  if (target) {
    const e = data.entrances[target.entrance]!
    const st = data.stations[e.station]!
    const vars = { station: nameOf(st), ref: e.ref, place: target.landmark }
    tasks.push({ id: `exit-${target.entrance}`, title: e.ref ? tr('从{station}站 {ref} 号口出站，去{place}', vars) : tr('从{station}站出站，去{place}', vars) })
  }
  return tasks
}

/** 每日任务完成的奖励（元） */
export const DAILY_REWARD = 10

/** 换了一天就清空当天的记录 */
export function rollDay(p: MetroProgress, date: string) {
  if (p.daily.date !== date) p.daily = { date, lines: [], done: [] }
}

const unlock = (p: MetroProgress, id: string, t: number, out: Gain) => {
  if (p.achievements[id] !== undefined) return
  p.achievements[id] = t
  out.achievements.push(id)
}

// 只看进度就能判断的成就（读档后也补一遍）
function checkState(data: MetroData, p: MetroProgress, t: number, out: Gain) {
  if (p.rides >= 1) unlock(p, 'first-ride', t, out)
  if (p.transfers.length >= 5) unlock(p, 'transfer-5', t, out)
  const n = Object.keys(p.visits).length
  if (n >= 50) unlock(p, 'collect-50', t, out)
  if (n >= 100) unlock(p, 'collect-100', t, out)
  if (n >= data.stations.length) unlock(p, 'collect-all', t, out)
  for (const l of data.lines) {
    if (l.loop) continue
    if (l.services.some((s) => p.visits[data.stations[s.stops[0]!]!.id] !== undefined && p.visits[data.stations[s.stops[s.stops.length - 1]!]!.id] !== undefined)) {
      unlock(p, 'end-to-end', t, out)
      break
    }
  }
}

/** 读档后补算：迁移过来的老存档、改了规则以后，状态已经满足的成就直接记上 */
export function recheck(data: MetroData, p: MetroProgress, t: number): Gain {
  const out: Gain = { achievements: [], badges: [], daily: [] }
  checkState(data, p, t, out)
  return out
}

/**
 * 记一个地铁事件。t 是游戏时间，date 是现实日期，tasks 是当天的每日任务。
 * 返回新达成的成就、点亮的徽章、完成的每日任务
 */
export function record(data: MetroData, p: MetroProgress, e: MetroEvent, t: number, date: string, tasks: DailyTask[]): Gain {
  const out: Gain = { achievements: [], badges: [], daily: [] }
  rollDay(p, date)
  const finish = (id: string) => {
    if (p.daily.done.includes(id) || !tasks.some((d) => d.id === id)) return
    p.daily.done.push(id)
    out.daily.push(id)
  }
  const visit = (station: number) => {
    const id = data.stations[station]!.id
    if (p.visits[id] !== undefined) return
    p.visits[id] = t
    finish('new-station')
  }
  switch (e.type) {
    case 'metroEnter':
      visit(e.station)
      break
    case 'metroExit':
      visit(e.station)
      if (e.trip.legs.length) p.rides++
      break
    case 'metroTransfer':
      visit(e.station)
      if (!p.transfers.includes(data.stations[e.station]!.id)) p.transfers.push(data.stations[e.station]!.id)
      if (data.stations[e.station]!.name === '世纪大道') unlock(p, 'century-avenue', t, out)
      break
    case 'metroLeave':
      finish(`exit-${e.entrance}`)
      break
    case 'metroRide': {
      const before = badges(data, p).find((b) => b.line === e.line)
      const have = new Set(p.segments)
      for (let i = 1; i < e.stations.length; i++) {
        if (e.stations[i] === e.stations[i - 1]) continue
        const k = segKey(data, e.line, e.stations[i - 1]!, e.stations[i]!)
        if (!have.has(k)) {
          have.add(k)
          p.segments.push(k)
        }
      }
      const after = badges(data, p).find((b) => b.line === e.line)
      if (after?.lit && !before?.lit) out.badges.push(e.line)
      if (!p.daily.lines.includes(e.line)) p.daily.lines.push(e.line)
      if (p.daily.lines.length >= 2) finish('lines-2')
      const names = e.stations.map((s) => data.stations[s]!.name)
      if (e.line === 'LMG') unlock(p, 'maglev', t, out)
      const h = ((e.t0 % 86400) + 86400) % 86400 / 3600
      if ((e.line === 'L1' || e.line === 'L2') && h >= 7.5 && h < 9) unlock(p, 'rush-hour', t, out)
      if (e.line === 'L2') {
        for (let i = 1; i < names.length; i++) {
          const pair = [names[i - 1], names[i]].sort().join('|')
          if (pair === ['南京东路', '陆家嘴'].sort().join('|')) unlock(p, 'under-river', t, out)
        }
      }
      if (e.line === 'L4') {
        const all = lineIndex(data).stations.get('L4')!
        const seen = new Set(e.stations)
        if ([...all].every((s) => seen.has(s))) unlock(p, 'loop-4', t, out)
      }
      break
    }
  }
  checkState(data, p, t, out)
  return out
}
