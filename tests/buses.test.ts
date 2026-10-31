import { expect, test } from 'vitest'
import { Polyline } from '../src/engine/transport/boats.ts'
import { arriveAt, BUS_LANE, busesAt, busPose, nextBus, placeStop, STOP_MAX, STOP_OFFSET, stopOffset, tripTime, type BusLine } from '../src/engine/transport/buses.ts'

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

test('站牌立在路缘外 1.5 格：窄路往里收，宽路最远 STOP_MAX，横路和找不到路用默认距离', () => {
  // 路线朝 +x（h = 0），站牌在 +z 一侧；路中线就在路线上
  const road = (width: number, z = 0, dir = 0) => ({ x: 0, z, width, dir })
  expect(stopOffset(road(6), 0, 0, 0)).toBeCloseTo(4.5)
  // 路中线偏到站牌这一侧 0.5 格，路缘也跟着外移
  expect(stopOffset(road(6, 0.5), 0, 0, 0)).toBeCloseTo(5)
  // 反方向的路（dir = π）也算顺着路线
  expect(stopOffset(road(6, 0, Math.PI), 0, 0, 0)).toBeCloseTo(4.5)
  expect(stopOffset(road(10), 0, 0, 0)).toBeCloseTo(6.5)
  expect(stopOffset(road(20), 0, 0, 0)).toBe(STOP_MAX)
  expect(stopOffset(road(2), 0, 0, 0)).toBe(BUS_LANE + 2)
  expect(stopOffset(road(6, 0, Math.PI / 2), 0, 0, 0)).toBe(STOP_OFFSET)
  expect(stopOffset(null, 0, 0, 0)).toBe(STOP_OFFSET)
})

// 一条朝 +x 的 6 格宽直路（中线 z = 0），x = 100 处有一条 6 格宽的横路
const at = (s: number) => ({ x: s, z: 0, h: 0 })
const main = (x: number) => ({ x, z: 0, width: 6, dir: 0 })
const cross = (z: number) => ({ x: 100, z, width: 6, dir: Math.PI / 2 })
const roadAt = (x: number, z: number) => (Math.abs(x - 100) <= Math.abs(z) ? cross(z) : main(x))
const edgeAt = (x: number, z: number) => Math.min(Math.abs(z) - 3, Math.abs(x - 100) - 3)

test('站牌离路口远就立在原地，贴着路缘', () => {
  const p = placeStop(50, 300, at, roadAt, edgeAt)
  expect(p.s).toBe(50)
  expect(p.z).toBeCloseTo(4.5)
  expect(p.shelter).toBe(true)
})

test('站牌落在路口就沿路线挪到最近的、候车亭不压横路的地方', () => {
  const p = placeStop(100, 300, at, roadAt, edgeAt)
  expect(p.s).toBe(106)
  expect(p.x).toBeCloseTo(106)
  expect(p.z).toBeCloseTo(4.5)
  // 往回挪也行：离路口 6 格以外就够了
  expect(placeStop(97, 300, at, roadAt, edgeAt).s).toBe(93)
})

test('哪儿都立不下就留在原处，用默认距离', () => {
  const p = placeStop(100, 300, at, () => null, () => -1)
  expect([p.s, p.z]).toEqual([100, STOP_OFFSET])
})

test('路线偏离路中线、站牌会离路太远的地方也跳过', () => {
  // x < 60 这段路中线偏到 z = -2（站牌对面），按最近距离立的站牌离路缘 3.4 格
  const zc = (x: number) => (x < 60 ? -2 : 0)
  const roadAt2 = (x: number) => ({ x, z: zc(x), width: 6, dir: 0 })
  const edgeAt2 = (x: number, z: number) => Math.abs(z - zc(x)) - 3
  const p = placeStop(50, 300, at, roadAt2, edgeAt2)
  expect(p.s).toBe(60)
  expect(edgeAt2(p.x, p.z)).toBeCloseTo(1.5)
})

test('站牌和候车亭不碰别的东西（地铁出入口之类）', () => {
  // x 在 48–53、站牌这一侧（z 3–8）有个出入口
  const blocked = (x: number, z: number) => x > 48 && x < 53 && z > 3 && z < 8
  // 50、52、48、54 都碰到，46 的候车亭（44.1–47.9）刚好让开
  expect(placeStop(50, 300, at, roadAt, edgeAt, blocked).s).toBe(46)
})

test('人行道窄得放不下候车亭，就只立站牌', () => {
  // 路缘外 2 格就是一排房子（z > 5），候车亭顶棚伸到 5.5 碰到房子，单根站牌（4.5）立得下
  const p = placeStop(50, 300, at, roadAt, edgeAt, (_x, z) => z > 5)
  expect([p.s, p.shelter]).toEqual([50, false])
  expect(p.z).toBeCloseTo(4.5)
})
