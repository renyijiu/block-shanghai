import { expect, test } from 'vitest'
import { skyAt } from '../src/engine/sky/Sky.ts'

test('白天亮、夜里暗，窗户夜里亮灯', () => {
  expect(skyAt(12).sun).toBeCloseTo(1.6)
  expect(skyAt(12).night).toBe(0)
  expect(skyAt(2).sun).toBeLessThan(0.2)
  expect(skyAt(2).night).toBe(1)
  expect(skyAt(23.9).night).toBe(1)
})

test('景观灯 18:30 到 22:00 亮', () => {
  expect(skyAt(18).lights).toBe(0)
  expect(skyAt(19).lights).toBe(1)
  expect(skyAt(21.9).lights).toBe(1)
  expect(skyAt(22.5).lights).toBe(0)
})
