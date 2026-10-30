import { expect, test } from 'vitest'
import { arrivalOf, boatsAt, crossing, cruiseDuration, nextDeparture, Polyline, runPose, type BoatLine } from '../src/engine/transport/boats.ts'

const H = 3600
// 渡轮：东西向 100 格，0.5 格/秒 → 单程 200 秒，两头各停 100 秒，一个来回 600 秒
const ferry: BoatLine = { id: 'f', name: '测试渡轮', kind: 'ferry', fare: 2, path: new Polyline([[0, 0], [100, 0]]), piers: ['西', '东'], speed: 0.5, first: 6 * H, last: 22 * H, dwell: 100, headway: 0 }
// 游船：去程 300 格，1 格/秒 → 往返 600 秒；10:00 起每 1200 秒一班，末班 11:00
const cruise: BoatLine = { id: 'c', name: '测试游船', kind: 'cruise', fare: 50, path: new Polyline([[0, 0], [0, -300]]), piers: ['码头'], speed: 1, first: 10 * H, last: 11 * H, dwell: 120, headway: 1200 }

test('折线按弧长取点、方向', () => {
  const p = new Polyline([[0, 0], [10, 0], [10, 10]])
  expect(p.length).toBe(20)
  expect(p.at(15)).toEqual([10, 5])
  expect(p.at(-5)).toEqual([0, 0])
  expect(p.heading(3, 1)).toBeCloseTo(0)
  expect(p.heading(17, 1)).toBeCloseTo(Math.PI / 2)
})

test('渡轮时刻表：两头错开半个周期，末班后到第二天首班', () => {
  expect(crossing(ferry)).toBe(200)
  expect(nextDeparture(ferry, 0, 6 * H - 10)).toBe(6 * H)
  expect(nextDeparture(ferry, 0, 6 * H + 1)).toBe(6 * H + 600)
  expect(nextDeparture(ferry, 1, 6 * H)).toBe(6 * H + 300)
  expect(nextDeparture(ferry, 0, 23 * H)).toBe(86400 + 6 * H)
  expect(arrivalOf(ferry, 6 * H)).toBe(6 * H + 200)
})

test('渡轮位置：开出、对岸停靠、开回，船头跟着走向', () => {
  const at = (t: number) => boatsAt(ferry, t)[0]!
  expect(at(5 * H).x).toBe(0)
  expect(at(6 * H + 100).x).toBeCloseTo(50)
  expect(at(6 * H + 100).angle).toBeCloseTo(0)
  expect(at(6 * H + 250).x).toBeCloseTo(100)
  const back = at(6 * H + 400)
  expect(back.x).toBeCloseTo(50)
  expect(Math.cos(back.angle)).toBeCloseTo(-1)
  expect(at(6 * H + 550).x).toBeCloseTo(0)
})

test('游船：发船前停在码头上客，去程靠右、回程掉头，同时可以有两条', () => {
  expect(cruiseDuration(cruise)).toBe(600)
  expect(nextDeparture(cruise, 0, 10 * H + 1)).toBe(10 * H + 1200)
  expect(nextDeparture(cruise, 0, 11 * H + 1)).toBe(86400 + 10 * H)
  // 发船前 2 分钟内已经停在码头上客
  expect(boatsAt(cruise, 10 * H - 60)).toHaveLength(1)
  expect(boatsAt(cruise, 10 * H - 200)).toHaveLength(0)
  // 去程北上（-z），右侧是东（+x）
  const out = runPose(cruise, 0, 10 * H, 10 * H + 150)
  expect(out.z).toBeCloseTo(-150)
  expect(out.x).toBeCloseTo(10)
  const back = runPose(cruise, 0, 10 * H, 10 * H + 450)
  expect(back.z).toBeCloseTo(-150)
  expect(back.x).toBeCloseTo(-10)
  // 到港后停回码头
  expect(runPose(cruise, 0, 10 * H, 10 * H + 700).z).toBeCloseTo(0)
})
