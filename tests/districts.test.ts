import { expect, test } from 'vitest'
import { DistrictIndex, pointInFlatRing } from '../src/engine/world/districts.ts'

const square = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1]

test('扁平环的点在多边形内判断', () => {
  expect(pointInFlatRing(5, 5, square(0, 0, 10, 10))).toBe(true)
  expect(pointInFlatRing(15, 5, square(0, 0, 10, 10))).toBe(false)
})

test('按坐标查所在区，洞里和市界外返回 null', () => {
  const idx = new DistrictIndex({
    version: 1,
    districts: [
      { id: 'a', name: 'A 区', polygons: [[square(0, 0, 10, 10), square(4, 4, 6, 6)]], bounds: [0, 0, 10, 10], label: [2, 2] },
      { id: 'b', name: 'B 区', polygons: [[square(10, 0, 20, 10)]], bounds: [10, 0, 20, 10], label: [15, 5] }
    ]
  })
  expect(idx.at(2, 2)?.id).toBe('a')
  expect(idx.at(15, 5)?.id).toBe('b')
  // 连续查询会先查上一次命中的区，换区后也要正确
  expect(idx.at(2, 8)?.id).toBe('a')
  expect(idx.at(5, 5)).toBeNull()
  expect(idx.at(30, 5)).toBeNull()
})
