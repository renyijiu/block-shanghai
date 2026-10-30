import { expect, test } from 'vitest'
import { buildSea } from '../tools/lib/coastline.ts'
import { ringArea, type Pt } from '../tools/lib/geom.ts'

const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 }

test('自南向北的海岸线：陆地在西、海在东', () => {
  const { polygons, warnings } = buildSea([[[5, -1], [5, 11]]], rect)
  expect(warnings).toEqual([])
  expect(polygons).toHaveLength(1)
  expect(ringArea(polygons[0]![0]!)).toBeCloseTo(50)
  expect(polygons[0]![0]!.every((p) => p[0]! >= 5)).toBe(true)
})

test('分成两段的海岸线先拼接，再拼海面；海中的岛屿成为洞', () => {
  const island: Pt[] = [[7, 4], [8, 4], [8, 5], [7, 5], [7, 4]]
  const { polygons } = buildSea([[[5, 5], [5, 11]], [[5, -1], [5, 5]], island], rect)
  expect(polygons).toHaveLength(1)
  expect(polygons[0]).toHaveLength(2)
  expect(ringArea(polygons[0]![0]!)).toBeCloseTo(50)
})

test('海湾：海岸线从东边进、东边出，海面绕过东北角', () => {
  // 从东边界进入、向西再折回北边出去，海在走向右侧（东北角那一块）
  const { polygons } = buildSea([[[11, 4], [6, 4], [6, 11]]], rect)
  expect(polygons).toHaveLength(1)
  expect(ringArea(polygons[0]![0]!)).toBeCloseTo(4 * 6)
})

test('数据缺口：断头接到最近的边框并给出警告', () => {
  const { polygons, warnings } = buildSea([[[5, 0.5], [5, 11]]], rect)
  expect(warnings).toHaveLength(1)
  expect(ringArea(polygons[0]![0]!)).toBeCloseTo(50)
})
