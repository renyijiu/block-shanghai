import { expect, test } from 'vitest'
import { createProjection } from '../src/engine/geo/projection.ts'
import shanghai from '../src/cities/shanghai/config.ts'

const proj = createProjection(shanghai.projection)
const { origin, unitsPerKm, coreRadiusKm, outerCompress } = shanghai.projection

test('原点投影到 (0, 0)', () => {
  const p = proj.project(origin.lat, origin.lon)
  expect(Math.abs(p.x)).toBeLessThan(1e-9)
  expect(Math.abs(p.z)).toBeLessThan(1e-9)
})

test('正北为 -z，正东为 +x', () => {
  expect(proj.project(origin.lat + 0.01, origin.lon).z).toBeLessThan(0)
  expect(proj.project(origin.lat, origin.lon + 0.01).x).toBeGreaterThan(0)
})

test('核心区内保持 1km = unitsPerKm 格', () => {
  // 正北 5km
  const p = proj.project(origin.lat + 5 / 110.574, origin.lon)
  expect(Math.abs(-p.z - 5 * unitsPerKm)).toBeLessThan(1e-6)
})

test('核心区外按 outerCompress 压缩', () => {
  // 正北 30km → 12 + 18 * 0.35 km
  const p = proj.project(origin.lat + 30 / 110.574, origin.lon)
  const expected = (coreRadiusKm + (30 - coreRadiusKm) * outerCompress) * unitsPerKm
  expect(Math.abs(-p.z - expected)).toBeLessThan(1e-6)
})

test.each([
  [31.2304, 121.4737],
  [31.24, 121.5],
  [31.14, 121.66],
  [30.9, 121.93],
  [31.6, 121.2]
])('project / unproject 往返误差 < 1e-9 度：%f, %f', (lat, lon) => {
  const p = proj.project(lat, lon)
  const q = proj.unproject(p.x, p.z)
  expect(Math.abs(q.lat - lat)).toBeLessThan(1e-9)
  expect(Math.abs(q.lon - lon)).toBeLessThan(1e-9)
})
