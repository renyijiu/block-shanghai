import { expect, test } from 'vitest'
import { burst, burstsAt, LIFE, RISE, schedule, sparksOf, type Show } from '../src/engine/sky/fireworkShow.ts'

const show: Show = { x: 1000, z: 500, start: 20.5 * 3600, duration: 1800, spread: 40 }

test('时刻表：从开场后开始，越到最后越密，最后一发炸完正好收场', () => {
  const t = schedule(show)
  expect(t.length).toBeGreaterThan(80)
  expect(t[0]).toBe(4)
  expect(t.at(-1)! + RISE + LIFE).toBeLessThanOrEqual(show.duration)
  const gaps = t.slice(1).map((v, i) => v - t[i]!)
  expect(Math.max(...gaps.slice(-10))).toBeLessThanOrEqual(4)
  expect(Math.min(...gaps.slice(0, 10))).toBeGreaterThanOrEqual(8)
  // 同一场每次算出来都一样
  expect(schedule(show)).toEqual(t)
})

test('同一时刻天上的烟花固定；没开场、散场后天上是空的', () => {
  const t = schedule(show)
  expect(burstsAt(show, t, -1)).toEqual([])
  expect(burstsAt(show, t, show.duration + 1)).toEqual([])
  const now = burstsAt(show, t, 600)
  expect(now.length).toBeGreaterThan(0)
  expect(burstsAt(show, t, 600)).toEqual(now)
  for (const b of now) {
    expect(Math.hypot(b.x - show.x, b.z - show.z)).toBeLessThanOrEqual(show.spread + 1e-9)
    expect(b.h).toBeGreaterThanOrEqual(60)
  }
})

test('升空时是一枚火箭加拖尾，炸开后火花在炸点附近，烧完就没了', () => {
  const b = burst(show, 3, 100)
  const rising = sparksOf(b, 100 + RISE / 2)
  expect(rising).toHaveLength(4)
  expect(rising[0]!.y).toBeLessThan(b.h)
  const open = sparksOf(b, 100 + RISE + LIFE / 3)
  expect(open).toHaveLength(b.n)
  for (const s of open) expect(Math.hypot(s.x - b.x, s.y - b.h, s.z - b.z)).toBeLessThanOrEqual(b.radius + 40)
  expect(sparksOf(b, 100 + RISE + LIFE)).toEqual([])
  expect(sparksOf(b, 99)).toEqual([])
})
