import { expect, test } from 'vitest'
import type { RoadInfo } from '../src/engine/world/data.ts'
import { blockedByRoad, findLots, LOT_SIZE, segRectDist, streetTreeSpots, type LotInputs } from '../src/engine/world/lots.ts'

const road = (width: number): RoadInfo => ({ name: '', class: 'primary', width, level: 0, bridge: false })

test('线段到矩形的距离', () => {
  const r = { x0: 0, z0: 0, x1: 10, z1: 10 }
  expect(segRectDist(-5, 5, 15, 5, r)).toBe(0) // 穿过
  expect(segRectDist(-5, 15, 15, 15, r)).toBe(5) // 平行在下方
  expect(segRectDist(12, 12, 20, 20, r)).toBeCloseTo(Math.SQRT2 * 2)
})

test('道路穿过的地块不能盖房子，其余地块都可以', () => {
  // 沿 z = 120 东西向的 12 格宽道路
  const inp: LotInputs = { roads: [[0, [0, 120, 0, 240, 120, 0]]], roadInfo: [road(12)], water: [], parks: [] }
  const lots = findLots(0, 0, 240, inp)
  const perRow = 240 / LOT_SIZE
  // 道路压到 z = 120 两侧的两排地块
  expect(lots).toHaveLength(perRow * perRow - perRow * 2)
  expect(lots.every((l) => !blockedByRoad(l, inp))).toBe(true)
})

test('水面里的地块不能盖房子', () => {
  const inp: LotInputs = { roads: [], roadInfo: [], water: [{ kind: 'river', polygon: [[0, 0, 240, 0, 240, 48, 0, 48]] }], parks: [] }
  expect(findLots(0, 0, 240, inp)).toHaveLength(100 - 20)
})

test('行道树沿道路两侧等距排列，离路边一定距离', () => {
  const inp: LotInputs = { roads: [[0, [0, 50, 0, 60, 50, 0]]], roadInfo: [road(10)], water: [], parks: [] }
  const spots = streetTreeSpots(inp.roads, inp, 6)
  expect(spots).toHaveLength(20)
  expect(spots.every((s) => Math.abs(Math.abs(s.z - 50) - 6.2) < 1e-9)).toBe(true)
})

test('快速路和高架不种行道树', () => {
  const inp: LotInputs = {
    roads: [
      [0, [0, 0, 0, 60, 0, 0]],
      [1, [0, 30, 7, 60, 30, 7]]
    ],
    roadInfo: [{ ...road(14), class: 'motorway' }, { ...road(8), level: 1 }],
    water: [],
    parks: []
  }
  expect(streetTreeSpots(inp.roads, inp, 6)).toHaveLength(0)
})
