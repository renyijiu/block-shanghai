import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { badges, dailyTasks, lineIndex, newProgress, recheck, record, type MetroEvent } from '../src/engine/metro/collection.ts'
import type { MetroData } from '../src/engine/metro/data.ts'

const data = JSON.parse(readFileSync(new URL('../src/cities/shanghai/data/metro.json', import.meta.url), 'utf8')) as MetroData
const st = (name: string) => data.stations.findIndex((s) => s.name === name)
const H = 3600
const DATE = '2026-11-01'

test('进站、出站算到访；完成一次乘车达成“第一次坐地铁”', () => {
  const p = newProgress()
  const tasks = dailyTasks(data, DATE, [])
  record(data, p, { type: 'metroEnter', station: st('人民广场') }, 9 * H, DATE, tasks)
  expect(Object.keys(p.visits)).toEqual(['peoples-square'])
  // 进站又出站、没坐车：不算一次乘车
  expect(record(data, p, { type: 'metroExit', station: st('人民广场'), exit: '', fare: 0, trip: { entry: st('人民广场'), legs: [] } }, 9 * H, DATE, tasks).achievements).toEqual([])
  const g = record(data, p, { type: 'metroExit', station: st('陆家嘴'), exit: '', fare: 3, trip: { entry: st('人民广场'), legs: [{ line: 'L2', from: st('人民广场'), to: st('陆家嘴') }] } }, 10 * H, DATE, tasks)
  expect(p.rides).toBe(1)
  expect(g.achievements).toContain('first-ride')
  expect(p.visits['lujiazui']).toBe(10 * H)
})

test('2 号线过江、早高峰、记下坐过的区间', () => {
  const p = newProgress()
  const stations = ['人民广场', '南京东路', '陆家嘴'].map(st)
  const e: MetroEvent = { type: 'metroRide', line: 'L2', from: stations[0]!, to: stations[2]!, stations, t0: 8 * H }
  const g = record(data, p, e, 8.2 * H, DATE, [])
  expect(g.achievements).toEqual(expect.arrayContaining(['under-river', 'rush-hour']))
  expect(p.segments).toHaveLength(2)
  // 同一段再坐一次不重复记
  record(data, p, e, 9 * H, DATE, [])
  expect(p.segments).toHaveLength(2)
  // 9 点以后坐 1 号线不算早高峰
  const q = newProgress()
  expect(record(data, q, { ...e, line: 'L1', t0: 9.5 * H }, 10 * H, DATE, []).achievements).not.toContain('rush-hour')
})

test('世纪大道换乘、换乘达人', () => {
  const p = newProgress()
  const g = record(data, p, { type: 'metroTransfer', station: st('世纪大道'), from: 'L2', to: 'L4' }, H, DATE, [])
  expect(g.achievements).toContain('century-avenue')
  for (const name of ['人民广场', '徐家汇', '上海火车站', '龙阳路']) record(data, p, { type: 'metroTransfer', station: st(name), from: 'L1', to: 'L2' }, H, DATE, [])
  expect(p.achievements['transfer-5']).toBeDefined()
})

test('4 号线坐满一圈：达成“环线一周”，4 号线徽章点亮', () => {
  const p = newProgress()
  const loop = data.lines.find((l) => l.id === 'L4')!.services[0]!.stops
  const g = record(data, p, { type: 'metroRide', line: 'L4', from: loop[0]!, to: loop[loop.length - 1]!, stations: loop, t0: 12 * H }, 13 * H, DATE, [])
  expect(g.achievements).toContain('loop-4')
  expect(g.badges).toEqual(['L4'])
  const b = badges(data, p).find((x) => x.line === 'L4')!
  expect(b.lit).toBe(true)
  expect(b.done).toBe(lineIndex(data).segments.get('L4')!.size)
})

test('每日任务：两条线、新车站、指定出口；换一天重新开始', () => {
  const ent = data.stations[st('南京东路')]!.exits[0]!
  const tasks = dailyTasks(data, DATE, [{ landmark: '外滩', entrance: ent }])
  expect(tasks.map((t) => t.id)).toEqual(['lines-2', 'new-station', `exit-${ent}`])
  expect(tasks[2]!.title).toContain('南京东路站')
  const p = newProgress()
  const ride = (line: string): MetroEvent => ({ type: 'metroRide', line, from: 0, to: 1, stations: [], t0: 10 * H })
  expect(record(data, p, ride('L2'), 10 * H, DATE, tasks).daily).toEqual([])
  expect(record(data, p, ride('L2'), 10 * H, DATE, tasks).daily).toEqual([])
  expect(record(data, p, ride('L10'), 10 * H, DATE, tasks).daily).toEqual(['lines-2'])
  expect(record(data, p, { type: 'metroEnter', station: st('南京东路') }, 11 * H, DATE, tasks).daily).toEqual(['new-station'])
  expect(record(data, p, { type: 'metroLeave', station: st('南京东路'), entrance: ent }, 11 * H, DATE, tasks).daily).toEqual([`exit-${ent}`])
  // 第二天：重新计
  const next = '2026-11-02'
  record(data, p, ride('L2'), 34 * H, next, dailyTasks(data, next, []))
  expect(p.daily).toEqual({ date: next, lines: ['L2'], done: [] })
})

test('从头坐到尾、读档补算', () => {
  const p = newProgress()
  const s = data.lines.find((l) => l.id === 'L1')!.services[0]!
  p.visits[data.stations[s.stops[0]!]!.id] = 0
  p.visits[data.stations[s.stops[s.stops.length - 1]!]!.id] = 0
  p.rides = 3
  const g = recheck(data, p, 100)
  expect(g.achievements).toEqual(expect.arrayContaining(['first-ride', 'end-to-end']))
  expect(recheck(data, p, 200).achievements).toEqual([])
})
