import { expect, test } from 'vitest'
import { Polyline } from '../src/engine/transport/boats.ts'
import { arriveAt, BUS_LANE, busesAt, busPose, nextBus, tripTime, type BusLine } from '../src/engine/transport/buses.ts'

// 一条 300 格的直路，三个站：0、100、300；车速 1 格/秒，每站停 30 秒，8 点到 10 点每 10 分钟一班
const line: BusLine = {
  id: 't',
  name: '测试线',
  fare: 30,
  path: new Polyline([
    [0, 0],
    [300, 0]
  ]),
  stops: [
    { name: 'A', s: 0 },
    { name: 'B', s: 100 },
    { name: 'C', s: 300 }
  ],
  speed: 1,
  first: 8 * 3600,
  last: 10 * 3600,
  headway: 600,
  dwell: 30
}

test('到站时刻：中间站停靠时间算进去', () => {
  expect(arriveAt(line, 0, 1)).toBe(100)
  expect(arriveAt(line, 0, 2)).toBe(330)
  expect(tripTime(line)).toBe(330)
  // 反方向：C → B 200 秒，B → A 再 100 秒加 B 站停靠
  expect(arriveAt(line, 1, 1)).toBe(200)
  expect(arriveAt(line, 1, 2)).toBe(330)
})

test('车的位置：在站上停一会儿，靠右行驶', () => {
  const dep = 8 * 3600
  expect(busPose(line, 0, dep, dep - 1)).toBeNull()
  const atB = busPose(line, 0, dep, dep + 110)!
  expect(atB.x).toBeCloseTo(100)
  // 往 +x 开，右手边是 +z
  expect(atB.z).toBeCloseTo(BUS_LANE)
  expect(busPose(line, 0, dep, dep + 140)!.x).toBeCloseTo(110)
  const back = busPose(line, 1, dep, dep + 50)!
  expect(back.x).toBeCloseTo(250)
  expect(back.z).toBeCloseTo(-BUS_LANE)
  expect(busPose(line, 0, dep, dep + 400)).toBeNull()
})

test('下一班：在 B 站等去 C 的车、去 A 的车；末班以后是明天的头班', () => {
  const t = 8 * 3600 + 200
  const toC = nextBus(line, 1, 2, t)
  expect(toC.dir).toBe(0)
  expect(toC.board).toBe(8 * 3600 + 600 + 100)
  expect(toC.arrive - toC.board).toBe(230)
  const toA = nextBus(line, 1, 0, t)
  expect(toA.dir).toBe(1)
  expect(toA.board).toBe(8 * 3600 + 200)
  const late = nextBus(line, 0, 2, 23 * 3600)
  expect(late.dep).toBe(86400 + 8 * 3600)
})

test('路上同时跑着的车：两个方向都有', () => {
  const buses = busesAt(line, 9 * 3600 + 100)
  expect(buses.some((b) => b.dir === 0)).toBe(true)
  expect(buses.some((b) => b.dir === 1)).toBe(true)
  expect(busesAt(line, 6 * 3600)).toEqual([])
})
