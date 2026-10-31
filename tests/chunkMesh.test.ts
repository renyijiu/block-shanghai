import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { buildAreas, buildElevated, buildGroundRoads, ROAD_STYLE, type GeometryData } from '../src/engine/world/chunkMesh.ts'
import type { AreaLayer, RoadInfo, RoadLayer } from '../src/engine/world/data.ts'

// 三角形法线的 y 分量（x 东、z 南、y 上的右手系，逆时针为正面）
function faceNormalsY(g: GeometryData) {
  const out: number[] = []
  const p = g.position
  for (let i = 0; i < g.index.length; i += 3) {
    const [a, b, c] = [g.index[i]! * 3, g.index[i + 1]! * 3, g.index[i + 2]! * 3]
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
    const ny = uz * vx - ux * vz
    out.push(ny / (Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1))
  }
  return out
}

const info = (over: Partial<RoadInfo>): RoadInfo => ({ name: '', class: 'primary', width: 12, level: 0, bridge: false, ...over })

describe('buildAreas', () => {
  test('带洞的方形三角化后朝上', () => {
    const g = buildAreas([{ kind: 'park', polygon: [[0, 0, 10, 0, 10, 10, 0, 10], [4, 4, 6, 4, 6, 6, 4, 6]] }], 0.02, { park: 0x00ff00 }, 0)!
    expect(g.index.length / 3).toBe(8)
    expect(faceNormalsY(g).every((n) => n > 0.99)).toBe(true)
  })
  test('两种环绕方向都朝上', () => {
    const g = buildAreas([{ kind: 'x', polygon: [[0, 0, 0, 10, 10, 10, 10, 0]] }], 0, {}, 0)!
    expect(faceNormalsY(g).every((n) => n > 0.99)).toBe(true)
  })
})

describe('buildGroundRoads', () => {
  test('直路是一条宽度正确、朝上的路面带', () => {
    const g = buildGroundRoads([[0, [0, 0, 0, 50, 0, 0]]], [info({ width: 12 })])!
    expect(g.index.length).toBe(6)
    const zs = [...g.position].filter((_, i) => i % 3 === 2)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(12)
    expect(faceNormalsY(g).every((n) => n > 0.99)).toBe(true)
  })
  test('高架不进地面道路网格', () => {
    expect(buildGroundRoads([[0, [0, 0, 7, 50, 0, 7]]], [info({ level: 1 })])).toBeNull()
  })
})

describe('buildElevated', () => {
  test('按间距放桥墩，桥面在给定高度', () => {
    const g = buildElevated([[0, [0, 0, 7, 30, 0, 7]]], [info({ level: 1, width: 8 })])!
    const ys = [...g.position].filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys)).toBeCloseTo(7 + ROAD_STYLE.parapetHeight)
    // 桥墩从地面立起：12、24 两处，每个 5 个面 20 个顶点、底部 2 个顶点在 y = 0 的有 4 个面
    const ground = ys.filter((y) => y === 0).length
    expect(ground).toBe(2 * 8)
  })
  test('匝道落地段不放桥墩', () => {
    const g = buildElevated([[0, [0, 0, 1, 30, 0, 1]]], [info({ level: 1, width: 8 })])!
    expect([...g.position].filter((_, i) => i % 3 === 1).some((y) => y === 0)).toBe(false)
  })
})

test('核心区真实分块的生成耗时', () => {
  const read = <T>(n: string) => JSON.parse(readFileSync(`src/cities/shanghai/data/${n}.json`, 'utf8')) as T
  const water = read<AreaLayer>('water')
  const parks = read<AreaLayer>('parks')
  const roads = read<RoadLayer>('roads')
  const times: number[] = []
  for (let cx = -3; cx <= 3; cx++)
    for (let cz = -3; cz <= 3; cz++) {
      const k = `${cx},${cz}`
      const t0 = performance.now()
      buildAreas(parks.chunks[k] ?? [], 0.02, {}, 0)
      buildAreas(water.chunks[k] ?? [], 0.03, {}, 0)
      buildGroundRoads(roads.chunks[k] ?? [], roads.roads)
      buildElevated(roads.chunks[k] ?? [], roads.roads)
      times.push(performance.now() - t0)
    }
  times.sort((a, b) => a - b)
  console.log(`核心区 49 个分块：中位 ${times[24]!.toFixed(2)} ms，最慢 ${times[48]!.toFixed(2)} ms`)
  expect(times[24]).toBeLessThan(6)
})

test('任意朝向的方块：侧面法线朝外，顶面朝上', async () => {
  const { GeoBuilder } = await import('../src/engine/build/geometry.ts')
  for (const angle of [0, 0.7, 2.5, -1.2]) {
    const g = new GeoBuilder()
    g.orientedBox(10, 20, angle, 8, 3, 0, 2, [1, 1, 1])
    const d = g.build()!
    expect(faceNormalsY(d).filter((n) => n > 0.99)).toHaveLength(2) // 顶面两个三角形
    // 每个面的几何法线都和写入的顶点法线同向
    for (let i = 0; i < d.index.length; i += 3) {
      const [a, b, c] = [d.index[i]! * 3, d.index[i + 1]! * 3, d.index[i + 2]! * 3]
      const p = d.position
      const u = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!]
      const v = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!]
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
      const dot = n[0]! * d.normal[a]! + n[1]! * d.normal[a + 1]! + n[2]! * d.normal[a + 2]!
      expect(dot).toBeGreaterThan(0)
    }
  }
})

test('轨道在 h = 0 处切开：地上部分保留，切点放隧道口', async () => {
  const { splitAtGround } = await import('../src/engine/metro/trackMesh.ts')
  const parts = splitAtGround([0, 0, 9, 50, 0, 9, 100, 0, -3])
  expect(parts[0]!.pts).toEqual([0, 0, 9, 50, 0, 9, 87.5, 0, 0])
  expect(parts[1]!.portal!.x).toBeCloseTo(87.5)
  expect(parts[1]!.portal!.angle).toBeCloseTo(0) // 往东钻进地下
  // 反方向（从地下钻出来）：隧道仍在东边，隧道口方向同样是从地上指向地下，朝东
  const rev = splitAtGround([100, 0, -3, 50, 0, 9])
  expect(rev[0]!.portal!.angle).toBeCloseTo(0)
  expect(rev[1]!.pts.slice(0, 3)).toEqual([87.5, 0, 0]) // 从 -3 升到 9，四分之一处越过地面
  // 全在地下：什么都不画
  expect(splitAtGround([0, 0, -3, 10, 0, -3])).toEqual([])
})

test('景点撑着桥面的范围里不立桥墩', () => {
  const g = buildElevated([[0, [0, 0, 7, 30, 0, 7]]], [info({ level: 1, width: 8 })], undefined, (x) => x > 20)!
  // 只剩 x = 12 的一个桥墩
  expect([...g.position].filter((_, i) => i % 3 === 1 && g.position[i]! === 0).length).toBe(8)
})

test('3D 方梁和斜放方块的底面：每个面的绕向和法线一致', async () => {
  const { GeoBuilder } = await import('../src/engine/build/geometry.ts')
  const segments = [
    [[0, 0, 0], [10, 5, 3]],
    [[2, 0, 1], [2, 30, 1]],
    [[0, 3, 0], [-4, 1, -6]]
  ]
  for (const [a, b] of segments) {
    const g = new GeoBuilder()
    g.beam(a!, b!, 1, 0.5, [1, 1, 1])
    g.orientedBottom(5, 5, 0.9, 4, 2, 3, [1, 1, 1])
    const d = g.build()!
    expect(d.index.length).toBe(7 * 6)
    for (let i = 0; i < d.index.length; i += 3) {
      const [p0, p1, p2] = [d.index[i]! * 3, d.index[i + 1]! * 3, d.index[i + 2]! * 3]
      const p = d.position
      const u = [p[p1]! - p[p0]!, p[p1 + 1]! - p[p0 + 1]!, p[p1 + 2]! - p[p0 + 2]!]
      const v = [p[p2]! - p[p0]!, p[p2 + 1]! - p[p0 + 1]!, p[p2 + 2]! - p[p0 + 2]!]
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
      expect(n[0]! * d.normal[p0]! + n[1]! * d.normal[p0 + 1]! + n[2]! * d.normal[p0 + 2]!).toBeGreaterThan(0)
    }
  }
})
