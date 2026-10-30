import { expect, test } from 'vitest'
import { junctionHeight, rampHeights } from '../tools/lib/heights.ts'

test('节点高度规则', () => {
  expect(junctionHeight([7, 0])).toBe(0) // 高架接地面：落地
  expect(junctionHeight([9, -3])).toBe(0) // 高架接隧道：在地面交接
  expect(junctionHeight([7, 14])).toBe(14) // 两层高架：取高的
  expect(junctionHeight([-3, -6])).toBe(-6) // 两段隧道：取深的
})

test('高架接地面路：高架一端在坡长内落地，地面路保持 0', () => {
  const [deck, ground] = rampHeights(
    [
      { pts: [[0, 0], [100, 0]], base: 9 },
      { pts: [[100, 0], [200, 0]], base: 0 }
    ],
    40
  )
  expect(deck![0]![2]).toBe(9)
  expect(deck![deck!.length - 1]![2]).toBe(0)
  // 坡道起点（离接口 40 格）处插了顶点，高度仍是 9
  expect(deck!.some((p) => p[0] === 60 && p[2] === 9)).toBe(true)
  expect(ground!.every((p) => p[2] === 0)).toBe(true)
})

test('两层高架相接：两边在接口处高度一致', () => {
  const [low, high] = rampHeights(
    [
      { pts: [[0, 0], [100, 0]], base: 7 },
      { pts: [[100, 0], [200, 0]], base: 14 }
    ],
    40
  )
  expect(low![low!.length - 1]![2]).toBe(14)
  expect(high![0]![2]).toBe(14)
})

test('隧道接高架：两边都坡到地面，形成隧道口', () => {
  const [tunnel, deck] = rampHeights(
    [
      { pts: [[0, 0], [100, 0]], base: -3 },
      { pts: [[100, 0], [200, 0]], base: 9 }
    ],
    40
  )
  expect(tunnel![0]![2]).toBe(-3)
  expect(tunnel![tunnel!.length - 1]![2]).toBe(0)
  expect(deck![0]![2]).toBe(0)
  expect(deck![deck!.length - 1]![2]).toBe(9)
})
