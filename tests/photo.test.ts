import * as THREE from 'three'
import { expect, test } from 'vitest'
import { applyFilter, previewCss } from '../src/engine/photo/filters.ts'
import { recognize, toNdc, type PhotoTarget, type ShotCamera } from '../src/engine/photo/recognize.ts'

const px = (...rgb: number[]) => new Uint8ClampedArray(rgb.flatMap((v, i) => (i % 3 === 2 ? [v, 255] : [v])))

test('黑白滤镜把彩色变成灰度，原片参数不改像素', () => {
  const d = px(200, 40, 40, 30, 160, 220)
  applyFilter(d, 2, 1, { grayscale: 1 })
  expect(d[0]).toBe(d[1])
  expect(d[1]).toBe(d[2])
  expect(d[4]).toBe(d[6])
  const o = px(200, 40, 40)
  applyFilter(o, 1, 1, {})
  expect([...o]).toEqual([200, 40, 40, 255])
})

test('偏暖让红多蓝少，分色阶后只剩有限几档', () => {
  const d = px(128, 128, 128)
  applyFilter(d, 1, 1, { warmth: 1 })
  expect(d[0]!).toBeGreaterThan(128)
  expect(d[2]!).toBeLessThan(128)
  const p = px(10, 100, 250, 37, 140, 201)
  applyFilter(p, 2, 1, { posterize: 3 })
  for (const v of [p[0], p[1], p[2], p[4], p[5], p[6]]) expect([0, 128, 255]).toContain(v)
})

test('颗粒按种子可重复', () => {
  const a = px(100, 100, 100, 100, 100, 100)
  const b = px(100, 100, 100, 100, 100, 100)
  applyFilter(a, 2, 1, { grain: 1 }, 42)
  applyFilter(b, 2, 1, { grain: 1 }, 42)
  expect([...a]).toEqual([...b])
})

test('取景预览的 CSS filter', () => {
  expect(previewCss({})).toBe('none')
  expect(previewCss({ grayscale: 1, contrast: 1.25 })).toBe('grayscale(1) contrast(1.25)')
})

// 相机在原点，朝 -z（北）看，60° 视角、4:3
function camera(): ShotCamera {
  const c = new THREE.PerspectiveCamera(60, 4 / 3, 0.3, 1500)
  c.position.set(0, 2, 0)
  c.lookAt(0, 2, -100)
  c.updateMatrixWorld()
  return { x: 0, y: 2, z: 0, viewProj: c.projectionMatrix.clone().multiply(c.matrixWorldInverse).elements }
}

const T = (id: string, x: number, y: number, z: number, maxDist = 500, parent?: string): PhotoTarget => ({ id, x, y, z, maxDist, parent })

test('投影：正前方在画面中心，背后返回 null', () => {
  const ndc = toNdc(camera(), 0, 2, -50)!
  expect(Math.abs(ndc[0])).toBeLessThan(1e-6)
  expect(Math.abs(ndc[1])).toBeLessThan(1e-6)
  expect(toNdc(camera(), 0, 2, 50)).toBeNull()
})

test('识别：画面里、够近、没被挡住才算；拍到子景点也算拍到景点', () => {
  const targets = [T('tower', 10, 40, -200), T('behind', 0, 10, 100), T('far', 0, 10, -800), T('edge', 300, 2, -100), T('hidden', -20, 5, -80), T('bund', 999, 0, 999), T('customs', -5, 10, -60, 500, 'bund')]
  const got = recognize(targets, camera(), (t) => t.id !== 'hidden')
  expect(got).toEqual(['tower', 'bund', 'customs'])
})
