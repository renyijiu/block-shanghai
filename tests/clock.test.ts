import { expect, test } from 'vitest'
import { CLOCK_SCALE, DAY_SEC, formatClock, GameClock } from '../src/engine/state/clock.ts'

test('按倍率走时，跨天后时刻和天数都对', () => {
  const c = new GameClock(23 * 3600 + 59 * 60)
  expect(c.format()).toBe('23:59')
  c.tick(6) // 6 秒现实时间 = 120 秒游戏时间
  expect(CLOCK_SCALE).toBe(20)
  expect(c.format()).toBe('00:01')
  expect(c.day).toBe(1)
  c.addMinutes(90)
  expect(c.format()).toBe('01:31')
  expect(c.daySeconds).toBe(91 * 60)
})

test('formatClock 补零', () => {
  expect(formatClock(8.5 * 3600)).toBe('08:30')
  expect(formatClock(DAY_SEC - 1)).toBe('23:59')
})
