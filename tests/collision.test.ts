import { expect, test } from 'vitest'
import { CollisionWorld, orientedBox, rectHitsObb } from '../src/engine/geo/CollisionWorld.ts'

test('轴对齐的方块不带 obb，外接矩形就是本身', () => {
  const b = orientedBox(10, 20, 0, 8, 2, 0, 3)
  expect(b.obb).toBeUndefined()
  expect([b.x0, b.z0, b.x1, b.z1]).toEqual([6, 19, 14, 21])
  // 转 90° 也是轴对齐
  expect(orientedBox(0, 0, Math.PI / 2, 8, 2, 0, 3).obb).toBeUndefined()
})

test('斜放 45° 的长条：外接矩形的空角不算碰到，条身上算', () => {
  const b = orientedBox(0, 0, Math.PI / 4, 20, 2, 0, 3)
  expect(b.obb).toBeDefined()
  // 外接矩形的角上（离长条很远）
  expect(rectHitsObb(5.5, -6.5, 6.5, -5.5, b.obb!)).toBe(false)
  // 长条中线上的点
  expect(rectHitsObb(4.5, 4.5, 5.5, 5.5, b.obb!)).toBe(true)
  // 刚好擦到条边：中线外 1.2 格、矩形半宽 0.35 → 投影到宽度方向 0.35·√2 ≈ 0.49，1.2 < 1 + 0.49
  const d = 1.2 / Math.SQRT2
  expect(rectHitsObb(3 + d - 0.35, 3 - d - 0.35, 3 + d + 0.35, 3 - d + 0.35, b.obb!)).toBe(true)
  expect(rectHitsObb(3 + 2 * d - 0.35, 3 - 2 * d - 0.35, 3 + 2 * d + 0.35, 3 - 2 * d + 0.35, b.obb!)).toBe(false)
})

test('碰撞世界的查询对斜放方块按实际朝向判断', () => {
  const w = new CollisionWorld()
  w.add('bridge', [{ ...orientedBox(0, 0, Math.PI / 4, 20, 2, 0, 0.3), deck: true }])
  expect(w.query(-0.1, -0.1, 0.1, 0.1)).toHaveLength(1)
  expect(w.query(5.9, -6.1, 6.1, -5.9)).toHaveLength(0)
  w.removeOwner('bridge')
  expect(w.query(-0.1, -0.1, 0.1, 0.1)).toHaveLength(0)
})
