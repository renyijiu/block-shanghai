// 地图查询：某个点是不是水面、是不是在地面道路上。玩家移动时每帧用到，只查所在分块
import { chunkKey, chunkOf } from './chunks.ts'
import { pointInFlatRing } from './districts.ts'
import type { WorldData } from './WorldData.ts'

export function isWater(data: WorldData, x: number, z: number) {
  for (const p of data.water.chunks[chunkKey(chunkOf(x), chunkOf(z))] ?? []) {
    if (pointInFlatRing(x, z, p.polygon[0]!) && !p.polygon.slice(1).some((h) => pointInFlatRing(x, z, h))) return true
  }
  return false
}

/** 是否在地面道路（含过河小桥）的路面上；高架不算 */
export function onGroundRoad(data: WorldData, x: number, z: number) {
  for (const [idx, pts] of data.roads.chunks[chunkKey(chunkOf(x), chunkOf(z))] ?? []) {
    const info = data.roads.roads[idx]!
    if (info.level > 0) continue
    const half = info.width / 2
    for (let i = 3; i < pts.length; i += 3) {
      const ax = pts[i - 3]!, az = pts[i - 2]!, bx = pts[i]!, bz = pts[i + 1]!
      const dx = bx - ax
      const dz = bz - az
      const len2 = dx * dx + dz * dz
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0
      if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) <= half) return true
    }
  }
  return false
}

/** 玩家能不能站在 (x, z)：世界范围内，不在水里（水上的地面道路、小桥、景点平台可以走）；onDeck 查景点平台 */
export function walkable(data: WorldData, x: number, z: number, onDeck: (x: number, z: number) => boolean = () => false) {
  const c = data.meta.chunks
  const s = data.meta.chunkSize
  if (x < c.minX * s || x >= (c.maxX + 1) * s || z < c.minZ * s || z >= (c.maxZ + 1) * s) return false
  return !isWater(data, x, z) || onGroundRoad(data, x, z) || onDeck(x, z)
}
