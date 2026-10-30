import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProjection } from '../src/engine/geo/projection.js'
import shanghai from '../src/cities/shanghai/config.js'

const proj = createProjection(shanghai.projection)
const { origin, unitsPerKm, coreRadiusKm, outerCompress } = shanghai.projection

test('原点投影到 (0, 0)', () => {
  const p = proj.project(origin.lat, origin.lon)
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.z) < 1e-9)
})

test('正北为 -z，正东为 +x', () => {
  assert.ok(proj.project(origin.lat + 0.01, origin.lon).z < 0)
  assert.ok(proj.project(origin.lat, origin.lon + 0.01).x > 0)
})

test('核心区内保持 1km = unitsPerKm 格', () => {
  // 正北 5km
  const p = proj.project(origin.lat + 5 / 110.574, origin.lon)
  assert.ok(Math.abs(-p.z - 5 * unitsPerKm) < 1e-6)
})

test('核心区外按 outerCompress 压缩', () => {
  // 正北 30km → 12 + 18 * 0.35 km
  const p = proj.project(origin.lat + 30 / 110.574, origin.lon)
  const expected = (coreRadiusKm + (30 - coreRadiusKm) * outerCompress) * unitsPerKm
  assert.ok(Math.abs(-p.z - expected) < 1e-6)
})

test('project / unproject 往返误差 < 1e-9 度', () => {
  for (const [lat, lon] of [
    [31.2304, 121.4737],
    [31.24, 121.5],
    [31.14, 121.66],
    [30.9, 121.93],
    [31.6, 121.2]
  ]) {
    const p = proj.project(lat, lon)
    const q = proj.unproject(p.x, p.z)
    assert.ok(Math.abs(q.lat - lat) < 1e-9 && Math.abs(q.lon - lon) < 1e-9, `${lat},${lon}`)
  }
})
