import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import type { MetroData, MetroLine, MetroRules, MetroService } from '../src/engine/metro/data.ts'
import { buildGraph, fareForKm, planRoute, shortestKm } from '../src/engine/metro/network.ts'
import { ServicePath } from '../src/engine/metro/path.ts'
import { DAY, departures, headwaySec, serviceTimes, trainsAt } from '../src/engine/metro/timetable.ts'

const rules: MetroRules = {
  fare: { baseKm: 6, baseYuan: 3, stepKm: 10, stepYuan: 1 },
  maglevFare: 50,
  // 30 km/h：每公里 2 分钟；停站 60 秒
  avgSpeedKmh: { subway: 30, apm: 25, maglev: 300 },
  dwellSec: 60,
  headwayMin: { peak: 3, offpeak: 6, express: 20 },
  peakHours: [[7, 9]],
  serviceHours: [6, 22]
}

const svc = (id: string, stops: number[], chainage: number[]): MetroService => ({
  id,
  name: id,
  stops,
  chainage,
  express: false,
  // 轨迹沿 x 轴，1 km = 200 格
  path: chainage.flatMap((km) => [km * 200, 0, 9, km])
})
const line = (id: string, kind: MetroLine['kind'], stops: number[], chainage: number[]): MetroLine => {
  const total = chainage[chainage.length - 1]!
  return {
    id,
    ref: id,
    name: id,
    nameEn: id,
    color: '#000000',
    kind,
    loop: false,
    services: [svc(`${id}-a`, stops, chainage), svc(`${id}-b`, stops.slice().reverse(), chainage.map((c) => total - c).reverse())]
  }
}

// 站：0 A、1 B、2 C、3 D、4 E
// X 线 A-B-C（0、3、8 km）；Y 线 D-B-E（0、2、5 km）；磁浮 C-E（30 km）；
// W 线 A-D-E 不用换乘，但比 X 换 Y 慢 2 分钟（0、5、9 km：11 + 9 = 20 分钟，X 换 Y 是 18 分钟）
const data: MetroData = {
  version: 1,
  generatedAt: '',
  osmTimestamp: '',
  rules,
  lines: [line('X', 'subway', [0, 1, 2], [0, 3, 8]), line('Y', 'subway', [3, 1, 4], [0, 2, 5]), line('M', 'maglev', [2, 4], [0, 30]), line('W', 'subway', [0, 3, 4], [0, 5, 9])],
  stations: ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ id: n, name: n, nameEn: n, pos: [i, 0], lines: [], platforms: [], exits: [], transferMin: 4 })),
  entrances: [],
  tracks: [],
  chunks: {}
}
const g = buildGraph(data)

describe('票价', () => {
  test('6 公里内 3 元，之后每 10 公里加 1 元', () => {
    expect(fareForKm(0.5, rules)).toBe(3)
    expect(fareForKm(6, rules)).toBe(3)
    expect(fareForKm(6.1, rules)).toBe(4)
    expect(fareForKm(16, rules)).toBe(4)
    expect(fareForKm(16.01, rules)).toBe(5)
  })
  test('按最短里程计价，磁浮不算进地铁里程', () => {
    // A→E 最短：X 到 B（3）+ Y 到 E（3）= 6 km
    expect(shortestKm(g, 0, 4)).toBeCloseTo(6)
    expect(shortestKm(g, 2, 4)).toBeCloseTo(5 + 3) // C→B→E，不走磁浮
  })
})

describe('路线规划', () => {
  test('最快：A → B 换 Y → E', () => {
    const r = planRoute(g, 0, 4, 'fastest')!
    expect(r.legs.map((l) => [l.line, data.stations[l.from]!.name, data.stations[l.to]!.name])).toEqual([
      ['X', 'A', 'B'],
      ['Y', 'B', 'E']
    ])
    expect(r.transfers).toBe(1)
    // 3 km（6 分 + 停站 1 分）+ 换乘 4 分 + 3 km（6 分 + 停站 1 分）
    expect(r.minutes).toBeCloseTo(7 + 4 + 7)
    expect(r.fare).toBe(3)
  })
  test('少换乘：换乘多计 10 分钟，改选慢 2 分钟但不用换乘的 W 线', () => {
    const r = planRoute(g, 0, 4, 'fewest')!
    expect(r.legs.map((l) => l.line)).toEqual(['W'])
    expect(r.transfers).toBe(0)
    expect(r.legs[0]!.stations).toEqual([0, 3, 4])
  })
  test('坐磁浮单独加磁浮票价', () => {
    const r = planRoute(g, 2, 4, 'fastest')!
    expect(r.legs.map((l) => l.line)).toEqual(['M'])
    expect(r.fare).toBe(50)
  })
  test('同站返回 null', () => {
    expect(planRoute(g, 1, 1)).toBeNull()
  })
})

describe('时刻表', () => {
  const s = data.lines[0]!.services[0]!
  const times = serviceTimes(s, 'subway', rules)
  test('到发时刻：区间运行 + 停站', () => {
    expect(times.arrive).toEqual([0, 360, 1020])
    expect(times.depart).toEqual([0, 420, 1080])
    expect(times.total).toBe(1020)
  })
  test('高峰 3 分钟、平峰 6 分钟发车', () => {
    expect(headwaySec(8 * 3600, false, rules)).toBe(180)
    expect(headwaySec(12 * 3600, false, rules)).toBe(360)
    const deps = departures(s, rules)
    expect(deps[0]).toBe(6 * 3600)
    expect(deps[deps.length - 1]).toBeLessThanOrEqual(22 * 3600)
  })
  test('列车位置：区间中段在两站之间，停站时在站上', () => {
    const deps = [6 * 3600]
    const mid = trainsAt(s, times, deps, 6 * 3600 + 180)
    expect(mid).toHaveLength(1)
    expect(mid[0]!.atStop).toBeNull()
    expect(mid[0]!.km).toBeCloseTo(1.5) // 余弦加减速曲线的中点
    const dwell = trainsAt(s, times, deps, 6 * 3600 + 390)
    expect(dwell[0]!.atStop).toBe(1)
    expect(dwell[0]!.km).toBe(3)
    expect(trainsAt(s, times, deps, 6 * 3600 + 2000)).toHaveLength(0)
  })
  test('深夜发车的车跨过零点仍在线上', () => {
    const late = [DAY - 300]
    expect(trainsAt(s, times, late, DAY + 100)).toHaveLength(1)
    expect(trainsAt(s, times, late, 100)).toHaveLength(1)
  })
  test('行车轨迹：里程换算成游戏坐标', () => {
    const p = new ServicePath(s)
    expect(p.kmToArc(3)).toBeCloseTo(600)
    expect(p.at(p.kmToArc(5.5)).x).toBeCloseTo(1100)
  })
})

describe('真实线网（metro.json）', () => {
  const real = JSON.parse(readFileSync('src/cities/shanghai/data/metro.json', 'utf8')) as MetroData
  const rg = buildGraph(real)
  const st = (name: string) => real.stations.findIndex((s) => s.name === name)
  const lineName = (id: string) => real.lines.find((l) => l.id === id)!.name

  test('人民广场 → 陆家嘴：2 号线直达，3 元', () => {
    const r = planRoute(rg, st('人民广场'), st('陆家嘴'))!
    expect(r.legs.map((l) => lineName(l.line))).toEqual(['2号线'])
    expect(r.fare).toBe(3)
    expect(r.minutes).toBeLessThan(10)
  })

  test('龙阳路 → 浦东1号2号航站楼：最快坐磁浮，50 元', () => {
    const r = planRoute(rg, st('龙阳路'), st('浦东1号2号航站楼'))!
    expect(r.legs.map((l) => lineName(l.line))).toEqual(['磁浮线'])
    expect(r.fare).toBe(50)
  })

  test('任意两站都能规划出路线（抽查 200 对）', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 200; i++) {
      const a = Math.floor(rnd() * real.stations.length)
      const b = Math.floor(rnd() * real.stations.length)
      if (a === b) continue
      const r = planRoute(rg, a, b)
      expect(r, `${real.stations[a]!.name} → ${real.stations[b]!.name}`).not.toBeNull()
      expect(r!.minutes).toBeLessThan(240)
      expect(r!.fare).toBeGreaterThanOrEqual(3)
    }
  })
})
