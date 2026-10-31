import { expect, test } from 'vitest'
import { isPlumSeason, lookOf, mixLook, seasonOf, WEATHER_PERIOD, weatherAt, weatherTable } from '../src/engine/sky/weather.ts'

const day = (m: number, d: number) => new Date(2026, m - 1, d, 12)

test('季节按真实月份，梅雨季 6/15–7/10', () => {
  expect(seasonOf(day(3, 1))).toBe('spring')
  expect(seasonOf(day(8, 31))).toBe('summer')
  expect(seasonOf(day(11, 1))).toBe('autumn')
  expect(seasonOf(day(1, 15))).toBe('winter')
  expect(isPlumSeason(day(6, 20))).toBe(true)
  expect(isPlumSeason(day(7, 11))).toBe(false)
})

test('概率表：只有冬天下雪，台风只在 7–9 月，各表加起来是 1', () => {
  for (let m = 1; m <= 12; m++) {
    const t = weatherTable(day(m, 20))
    expect(t.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1)
    expect(t.some(([k]) => k === 'snow')).toBe(m === 12 || m <= 2)
    expect(t.some(([k]) => k === 'typhoon')).toBe(m >= 7 && m <= 9)
  }
  expect(weatherTable(day(6, 20))[0]![0]).toBe('plum')
})

test('同一时段天气不变，按时段换；长期频率接近概率表', () => {
  const d = day(10, 31)
  const t0 = 3 * WEATHER_PERIOD + 10
  expect(weatherAt(d, t0)).toBe(weatherAt(d, t0 + WEATHER_PERIOD - 20))
  const count: Record<string, number> = {}
  for (let k = 0; k < 4000; k++) {
    const w = weatherAt(day(10, 1 + (k % 28)), k * WEATHER_PERIOD)
    count[w] = (count[w] ?? 0) + 1
  }
  expect(count.sunny! / 4000).toBeGreaterThan(0.4)
  expect(count.sunny! / 4000).toBeLessThan(0.6)
  expect(count.snow).toBeUndefined()
})

test('画面参数：台风最暗最大雨，插值在两者之间', () => {
  expect(lookOf('typhoon').rain).toBe(1)
  expect(lookOf('sunny').cloud).toBe(0)
  const m = mixLook(lookOf('sunny'), lookOf('rain'), 0.5)
  expect(m.rain).toBeCloseTo(0.3)
})
