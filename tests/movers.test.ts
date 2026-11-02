import { expect, test } from 'vitest'
import * as THREE from 'three/webgpu'
import type { LandmarkDef, Motion } from '../src/engine/city.ts'
import { makeMover, type PlacedLandmark } from '../src/engine/landmarks/LandmarkManager.ts'

// 景点放在原点、不旋转：局部坐标 = 世界坐标
const placed = {
  def: { rot: 0 } as LandmarkDef,
  x: 0,
  z: 0,
  toWorld: (x: number, z: number): [number, number] => [x, z],
  toLocal: (x: number, z: number): [number, number] => [x, z],
  bounds: { x0: 0, z0: 0, x1: 0, z1: 0 },
  footprints: []
} satisfies PlacedLandmark

/** 部件建模时在 at 处的一个点，动到 t 秒时在世界里的哪儿 */
function pointAt(motion: Motion, at: [number, number, number], t: number) {
  const content = new THREE.Group()
  const marker = new THREE.Object3D()
  marker.position.set(...at)
  content.add(marker)
  const m = makeMover(placed, motion, content)
  m.pose(t)
  m.group.updateMatrixWorld(true)
  const v = marker.getWorldPosition(new THREE.Vector3())
  return [v.x, v.y, v.z].map((n) => Math.round(n * 1000) / 1000 + 0)
}

test('spin：绕轴转，每分钟 rpm 圈', () => {
  // 每分钟 15 圈 = 4 秒一圈，1 秒转 90°；绕 y 轴转正角度，+x 转到 -z
  const spin: Motion = { kind: 'spin', at: [0, 0, 0], axis: 'y', rpm: 15 }
  expect(pointAt(spin, [10, 0, 0], 0)).toEqual([10, 0, 0])
  expect(pointAt(spin, [10, 0, 0], 1)).toEqual([0, 0, -10])
  expect(pointAt(spin, [10, 0, 0], 4)).toEqual([10, 0, 0])
})

test('orbit：沿圆周平移，部件不转（摩天轮吊舱一直朝上）', () => {
  const orbit: Motion = { kind: 'orbit', at: [0, 0, 0], axis: 'z', rpm: 15, anchor: [0, 10, 0] }
  // 吊舱的挂点从顶上转到 -x；吊舱底（挂点下面 2 格）还在挂点正下方
  expect(pointAt(orbit, [0, 10, 0], 1)).toEqual([-10, 0, 0])
  expect(pointAt(orbit, [0, 8, 0], 1)).toEqual([-10, -2, 0])
  expect(pointAt(orbit, [0, 8, 0], 2)).toEqual([0, -12, 0])
})

test('swing：来回摆，1/4 周期时摆到最大角度，半周期回到中间', () => {
  const swing: Motion = { kind: 'swing', at: [0, 10, 0], axis: 'x', amp: Math.PI / 2, period: 4 }
  expect(pointAt(swing, [0, 0, 0], 0)).toEqual([0, 0, 0])
  // 摆到 90°：挂在轴下 10 格的点转到轴的高度
  const [x, y, z] = pointAt(swing, [0, 0, 0], 1)
  expect(x).toBe(0)
  expect(y).toBe(10)
  expect(Math.abs(z)).toBe(10)
  expect(pointAt(swing, [0, 0, 0], 2)).toEqual([0, 0, 0])
})

test('path：沿闭合折线匀速跑，车头对着前进方向', () => {
  const path: Motion = { kind: 'path', points: [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]], speed: 5, anchor: [0, 0, 0] }
  expect(pointAt(path, [0, 0, 0], 1)).toEqual([5, 0, 0])
  // 第二段朝 +z 跑：车头（建模时朝 +x，在 anchor 前 1 格）转到 +z
  expect(pointAt(path, [0, 0, 0], 3)).toEqual([10, 0, 5])
  expect(pointAt(path, [1, 0, 0], 3)).toEqual([10, 0, 6])
  // 跑完一圈（40 格，8 秒）回到起点；offset 在折线上往前错开
  expect(pointAt(path, [0, 0, 0], 8)).toEqual([0, 0, 0])
  expect(pointAt({ ...path, offset: 15 }, [0, 0, 0], 0)).toEqual([10, 0, 5])
})

test('drop：慢慢升到顶，停一下，一下子落回来，底下再停一会儿', () => {
  const drop: Motion = { kind: 'drop', height: 20, period: 10 }
  expect(pointAt(drop, [0, 2, 0], 0)[1]).toBe(2)
  expect(pointAt(drop, [0, 2, 0], 3)[1]).toBeCloseTo(12)
  expect(pointAt(drop, [0, 2, 0], 6.8)[1]).toBe(22)
  expect(pointAt(drop, [0, 2, 0], 7.8)[1]).toBeLessThan(22)
  expect(pointAt(drop, [0, 2, 0], 9)[1]).toBe(2)
  expect(pointAt(drop, [0, 2, 0], 13)[1]).toBeCloseTo(12)
})
