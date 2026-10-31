// Citywalk（docs/05 第 11 节）：沿街铺一条步道、打卡点立路牌，沿途的小店按经纬度摆；
// 路线不长，开局一次建好。下一站头顶有一个转动的绿色标记
import * as THREE from 'three/webgpu'
import { Builder } from '../build/Builder.ts'
import { GeoBuilder, rgb } from '../build/geometry.ts'
import type { CitywalkDef, LifeContent, PartOptions } from '../city.ts'
import type { CollisionWorld } from '../geo/CollisionWorld.ts'
import type { Projection } from '../geo/projection.ts'
import { toMesh } from '../landmarks/LandmarkManager.ts'
import type { InteractPoint, InteractRegistry } from '../world/interact.ts'
import type { Lot } from '../world/lots.ts'
import type { WorldMaterials } from '../world/materials.ts'
import { isGeo, kiosk, type KioskHost } from './kiosks.ts'

const OWNER = 'walks'
const PATH_W = 2.4
/** 走到打卡点这个距离以内算到了 */
export const STOP_R = 4

export interface WalkRoute {
  def: CitywalkDef
  path: [number, number][]
  stops: { name: string; text: string; x: number; z: number }[]
}

export class WalkSystem {
  readonly root = new THREE.Group()
  readonly routes: WalkRoute[]
  /** 步道和小店的占地：分块盖房子时让开 */
  readonly footprints: Lot[] = []
  private readonly beacon: THREE.Mesh
  private readonly beaconMat = new THREE.MeshBasicMaterial({ color: 0x4fd18b })

  constructor(content: LifeContent, proj: Projection, materials: WorldMaterials, collision: CollisionWorld, interact: InteractRegistry) {
    this.root.name = 'walks'
    const xy = (lat: number, lon: number): [number, number] => {
      const p = proj.project(lat, lon)
      return [p.x, p.z]
    }
    this.routes = content.walks.map((def) => ({
      def,
      path: def.path.map(([lat, lon]) => xy(lat, lon)),
      stops: def.stops.map((s) => {
        const [x, z] = xy(s.lat, s.lon)
        return { name: s.name, text: s.text, x, z }
      })
    }))
    const b = new Builder()
    const lights = new GeoBuilder()
    const points: InteractPoint[] = []
    for (const r of this.routes) {
      this.buildPath(b, r.path)
      r.stops.forEach((_, i) => this.buildStop(b, lights, r, i))
    }
    // Citywalk 沿途的小店（按经纬度摆）
    for (const shop of content.shops) {
      if (!isGeo(shop.at)) continue
      const [ox, oz] = xy(shop.at.lat, shop.at.lon)
      const host: KioskHost = {
        points,
        toWorld: (x, z) => [ox + x, oz + z],
        slab: (cx, cz, w, d, y0, y1, color, twist = 0, o: PartOptions = {}) => {
          if (o.light) {
            lights.window = 0
            lights.orientedBox(ox + cx, oz + cz, twist, w, d, y0, y1, rgb(color))
          } else b.orientedBox(ox + cx, oz + cz, twist, w, d, y0, y1, color, o)
        }
      }
      kiosk(host, shop, { x: 0, z: 0, face: shop.at.face ?? 0, y: 0 })
      this.footprints.push({ x0: ox - 2.8, z0: oz - 2.8, x1: ox + 2.8, z1: oz + 2.8 })
    }
    const built = b.build()
    for (const m of [toMesh(built.solid, materials.buildings, 'walks'), toMesh(lights.build(), materials.lights, 'walk lights')]) if (m) this.root.add(m)
    collision.add(OWNER, built.colliders)
    interact.add(OWNER, points)

    this.beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), this.beaconMat)
    this.beacon.scale.set(1, 1.5, 1)
    this.beacon.visible = false
    this.root.add(this.beacon)
  }

  // 步道：每段一块贴地的浅色石板，占地沿线每 3 格一个小方块
  private buildPath(b: Builder, path: [number, number][]) {
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1]!
      const [bx, bz] = path[i]!
      const len = Math.hypot(bx - ax, bz - az)
      b.orientedBox((ax + bx) / 2, (az + bz) / 2, Math.atan2(bz - az, bx - ax), len + PATH_W * 0.6, PATH_W, 0, 0.035, 0xd8cfb8, { windows: 0, collide: false })
      for (let d = 0; d <= len; d += 3) {
        const x = ax + ((bx - ax) * d) / len
        const z = az + ((bz - az) * d) / len
        this.footprints.push({ x0: x - 2.2, z0: z - 2.2, x1: x + 2.2, z1: z + 2.2 })
      }
    }
  }

  // 打卡点：地上一块圆形铺地，路边一块绿色路牌（顶上夜里亮）
  private buildStop(b: Builder, lights: GeoBuilder, r: WalkRoute, i: number) {
    const s = r.stops[i]!
    const near = r.path.reduce((best, p) => (Math.hypot(p[0] - s.x, p[1] - s.z) < Math.hypot(best[0] - s.x, best[1] - s.z) ? p : best))
    // 路的走向：取离打卡点最近的那段
    const k = r.path.indexOf(near)
    const a = r.path[Math.max(0, k - 1)]!
    const c = r.path[Math.min(r.path.length - 1, k + 1)]!
    const ang = Math.atan2(c[1] - a[1], c[0] - a[0])
    b.orientedBox(s.x, s.z, ang, 3, 3, 0, 0.045, 0xe9d9a6, { windows: 0, collide: false })
    b.orientedBox(s.x, s.z, ang + Math.PI / 4, 2.2, 2.2, 0, 0.05, 0xc9a24a, { windows: 0, collide: false })
    // 路牌立在路边
    const px = s.x - Math.sin(ang) * 2.4
    const pz = s.z + Math.cos(ang) * 2.4
    b.orientedBox(px, pz, ang, 0.15, 0.15, 0, 2.7, 0x4a4d52, { windows: 0 })
    b.orientedBox(px, pz, ang, 1.4, 0.12, 1.8, 2.6, 0x2f6b55, { windows: 0, collide: false })
    lights.window = 0
    lights.orientedBox(px, pz, ang, 1.4, 0.16, 2.6, 2.72, rgb(0xfff1c9))
    this.footprints.push({ x0: px - 1.2, z0: pz - 1.2, x1: px + 1.2, z1: pz + 1.2 })
  }

  /** 玩家 (x, z) 在哪些打卡点上：[路线序号, 打卡点序号] */
  at(x: number, z: number): [number, number][] {
    const out: [number, number][] = []
    this.routes.forEach((r, ri) =>
      r.stops.forEach((s, si) => {
        if (Math.hypot(s.x - x, s.z - z) <= STOP_R) out.push([ri, si])
      })
    )
    return out
  }

  /** 下一站的标记：next 为 null、或者人已经走到跟前（px, pz 在 10 格内，免得挡住镜头）时藏起来 */
  update(t: number, next: { x: number; z: number } | null, px: number, pz: number) {
    this.beacon.visible = !!next && Math.hypot(next.x - px, next.z - pz) > 10
    if (!next) return
    this.beacon.position.set(next.x, 4.2 + Math.sin(t * 2) * 0.3, next.z)
    this.beacon.rotation.y = t * 1.5
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    this.beaconMat.dispose()
    this.root.removeFromParent()
  }
}
