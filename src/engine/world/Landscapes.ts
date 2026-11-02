// 成片的园林（城市包的 landscapes，比如度假区）：整片铺草坪，在不挨着马路、水面和景点的地方成片种树。
// 范围不大，开局建一次（不按分块），草坪比地面高一点、比公园和水面低，树干登记碰撞、树冠只挡相机
import * as THREE from 'three/webgpu'
import { Builder } from '../build/Builder.ts'
import { mulberry32 } from '../build/random.ts'
import type { LandscapeDef } from '../city.ts'
import type { CollisionWorld } from '../geo/CollisionWorld.ts'
import type { Projection } from '../geo/projection.ts'
import { toMesh } from '../landmarks/LandmarkManager.ts'
import { buildAreas } from './chunkMesh.ts'
import type { Lot } from './lots.ts'
import type { WorldMaterials } from './materials.ts'
import { isWater, nearestGroundRoad } from './queries.ts'
import type { WorldData } from './WorldData.ts'

/** 树离马路至少多远（格）：马路边的地块归程序化建筑，树种在里面 */
const ROAD_GAP = 26
const CROWNS = [0x3f7d3a, 0x4f8f3a, 0x5b9a46, 0x467f3c]

/** 点在多边形（扁平 [x, z, ...]）里 */
function inside(x: number, z: number, ring: number[]) {
  let hit = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

export function buildLandscapes(defs: LandscapeDef[], proj: Projection, world: WorldData, avoid: Lot[], materials: WorldMaterials, collision: CollisionWorld): THREE.Group {
  const root = new THREE.Group()
  root.name = 'landscapes'
  for (const def of defs) {
    const ring = def.polygon.flatMap(([lat, lon]) => {
      const p = proj.project(lat, lon)
      return [p.x, p.z]
    })
    const lawn = buildAreas([{ kind: 'lawn', polygon: [ring] }], 0.012, {}, def.lawn)
    const lawnMesh = toMesh(lawn, materials.parks, `${def.name} lawn`)
    if (lawnMesh) root.add(lawnMesh)
    // 树：按网格撒点、随机挪一点，跳过水面、马路边、景点和码头
    const xs = ring.filter((_, i) => i % 2 === 0)
    const zs = ring.filter((_, i) => i % 2 === 1)
    const rng = mulberry32(Math.round(xs[0]! * 31 + zs[0]! * 17))
    const b = new Builder()
    const step = def.treeSpacing
    for (let x = Math.min(...xs); x < Math.max(...xs); x += step)
      for (let z = Math.min(...zs); z < Math.max(...zs); z += step) {
        const tx = x + (rng() - 0.5) * step * 0.8
        const tz = z + (rng() - 0.5) * step * 0.8
        if (rng() > def.treeDensity || !inside(tx, tz, ring) || isWater(world, tx, tz)) continue
        if (avoid.some((l) => tx > l.x0 - 3 && tx < l.x1 + 3 && tz > l.z0 - 3 && tz < l.z1 + 3)) continue
        const road = nearestGroundRoad(world, tx, tz, ROAD_GAP + 8)
        if (road && road.edge < ROAD_GAP) continue
        // 一丛两三棵
        const n = 1 + Math.floor(rng() * 3)
        for (let k = 0; k < n; k++) {
          const px = tx + (rng() - 0.5) * 5
          const pz = tz + (rng() - 0.5) * 5
          if (isWater(world, px, pz)) continue
          const h = 3.5 + rng() * 3
          const w = 2.2 + rng() * 1.4
          b.box(px - 0.2, 0, pz - 0.2, px + 0.2, h * 0.5, pz + 0.2, 0x6b4a32, { windows: 0, collide: true })
          b.box(px - w / 2, h * 0.45, pz - w / 2, px + w / 2, h, pz + w / 2, CROWNS[Math.floor(rng() * CROWNS.length)]!, { windows: 0, collide: 'camera' })
        }
      }
    const trees = b.build()
    const treeMesh = toMesh(trees.solid, materials.buildings, `${def.name} trees`)
    if (treeMesh) root.add(treeMesh)
    collision.add(`landscape:${def.name}`, trees.colliders)
  }
  return root
}
