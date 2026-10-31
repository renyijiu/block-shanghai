// 观光巴士：站牌、路上按时刻表跑的双层敞篷巴士、坐车（docs/05 第 4 节）。车站只有几个，开局一次建好；车的位置每帧按游戏时间算
import * as THREE from 'three/webgpu'
import { Builder } from '../build/Builder.ts'
import { GeoBuilder, rgb } from '../build/geometry.ts'
import type { BusLineDef } from '../city.ts'
import type { Projection } from '../geo/projection.ts'
import { toMesh } from '../landmarks/LandmarkManager.ts'
import type { InteractPoint, InteractRegistry } from '../world/interact.ts'
import type { Lot } from '../world/lots.ts'
import type { WorldMaterials } from '../world/materials.ts'
import { nearestGroundRoad } from '../world/queries.ts'
import type { WorldData } from '../world/WorldData.ts'
import { Polyline } from './boats.ts'
import { busesAt, busPose, nextBus, stopOffset, tripTime, type BusLine } from './buses.ts'
import { tr } from '../../i18n/core.ts'

const parseClock = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h! * 3600 + m! * 60
}

/** 坐在二层敞篷上的位置（局部：x 朝车头、y 二层地板高度） */
const SEAT = [-1.5, 2.9, 0.5] as const

/** 正在坐的巴士 */
export interface BusRide {
  line: BusLine
  dir: 0 | 1
  /** 始发时刻、上车、下车的时刻（游戏秒） */
  dep: number
  board: number
  arrive: number
  from: number
  to: number
}

export interface BusStop {
  line: BusLine
  index: number
  name: string
  /** 站牌位置（下车站在这里） */
  x: number
  z: number
}

// 双层敞篷观光巴士：红色车身，一层一排车窗，二层露天带栏杆和座椅；车头朝 +x
function busGeometry() {
  const body = new GeoBuilder()
  const lights = new GeoBuilder()
  body.window = 0
  lights.window = 0
  const B = (g: GeoBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, top = c) => g.box(x0, y0, z0, x1, y1, z1, rgb(c), rgb(top))
  B(body, -5.5, 0.35, -1.3, 5.5, 2.6, 1.3, 0xc8282a, 0x8a8d91)
  for (const s of [-1, 1]) B(body, -5, 1.2, s > 0 ? 1.3 : -1.35, 4.5, 2.2, s > 0 ? 1.35 : -1.3, 0x26313b)
  B(body, 5.5, 0.9, -1.1, 5.55, 2.3, 1.1, 0x26313b)
  B(body, -5.5, 2.6, -1.3, 5.5, 2.75, 1.3, 0xe8e2d4)
  for (const s of [-1, 1]) B(body, -5.5, 2.75, s > 0 ? 1.2 : -1.3, 5.5, 3.5, s > 0 ? 1.3 : -1.2, 0xc8282a)
  B(body, 5.4, 2.75, -1.2, 5.5, 3.5, 1.2, 0xc8282a)
  B(body, -5.5, 2.75, -1.2, -5.4, 3.5, 1.2, 0xc8282a)
  for (let x = -4.5; x < 4.6; x += 1.5) B(body, x - 0.3, 2.75, -0.9, x + 0.3, 3.2, 0.9, 0x3a5a8a)
  for (const x of [-3.6, 3.6]) for (const s of [-1, 1]) B(body, x - 0.45, 0, s > 0 ? 1.1 : -1.35, x + 0.45, 0.8, s > 0 ? 1.35 : -1.1, 0x222222)
  for (const s of [-1, 1]) B(lights, 5.5, 0.7, s > 0 ? 0.7 : -1.0, 5.6, 1.0, s > 0 ? 1.0 : -0.7, 0xfff1c9)
  for (const s of [-1, 1]) B(lights, -5.5, 3.45, s > 0 ? 1.25 : -1.33, 5.5, 3.55, s > 0 ? 1.33 : -1.25, 0xffd27a)
  return { body: body.build(), lights: lights.build() }
}

export class BusSystem {
  readonly root = new THREE.Group()
  readonly lines: BusLine[] = []
  readonly stops: BusStop[] = []
  /** 站牌占地：程序化建筑避开 */
  readonly footprints: Lot[] = []
  private readonly pool: { group: THREE.Group; key: string | null }[] = []
  private readonly geos: THREE.BufferGeometry[] = []

  constructor(defs: BusLineDef[], proj: Projection, world: WorldData, materials: WorldMaterials, interact: InteractRegistry) {
    this.root.name = 'buses'
    const b = new Builder()
    const lights = new GeoBuilder()
    const points: InteractPoint[] = []
    const xy = (lat: number, lon: number): [number, number] => {
      const p = proj.project(lat, lon)
      return [p.x, p.z]
    }
    for (const d of defs) {
      const path = new Polyline(d.path.map(([lat, lon]) => xy(lat, lon)))
      // 站在路线上的弧长：离站最近的那一点
      const stops = d.stops.map((st) => {
        const [x, z] = xy(st.at[0], st.at[1])
        let best = 0
        let bestD = Infinity
        for (let s = 0; s <= path.length; s += 0.5) {
          const [px, pz] = path.at(s)
          const dd = Math.hypot(px - x, pz - z)
          if (dd < bestD) {
            bestD = dd
            best = s
          }
        }
        return { name: st.name, s: best }
      })
      const line: BusLine = { id: d.id, name: d.name, fare: d.fare, path, stops, speed: d.speed, first: parseClock(d.first), last: parseClock(d.last), headway: d.headwayMin * 60, dwell: d.dwellSec }
      this.lines.push(line)
      // 站牌：在顺行方向的右边（车靠右停在这一侧），立在路缘外的人行道上
      stops.forEach((st, i) => {
        const [x, z] = path.at(st.s)
        const h = path.heading(st.s, 6)
        const off = stopOffset(nearestGroundRoad(world, x, z, 20), x, z, h)
        const sx = x - Math.sin(h) * off
        const sz = z + Math.cos(h) * off
        b.orientedBox(sx, sz, h, 0.2, 0.2, 0, 3, 0x4a4d52, { windows: 0 })
        lights.window = 0
        lights.orientedBox(sx, sz, h, 1.4, 0.24, 2, 3, rgb(0xc8282a), rgb(0xc8282a))
        // 候车亭
        b.orientedBox(sx - Math.sin(h) * 0.8, sz + Math.cos(h) * 0.8, h, 3.6, 0.15, 0, 2.6, 0x9fc3d6, { glass: true, collide: false })
        b.orientedBox(sx - Math.sin(h) * 0.3, sz + Math.cos(h) * 0.3, h, 3.8, 1.4, 2.6, 2.75, 0xe8e2d4, { windows: 0, collide: false })
        this.stops.push({ line, index: i, name: st.name, x: sx, z: sz })
        points.push({ x: sx, z: sz, r: 4, label: tr('{line} · {stop}站', { line: d.name, stop: st.name }), action: '坐车', kind: 'bus', bus: d.id, stop: i })
        this.footprints.push({ x0: sx - 3, z0: sz - 3, x1: sx + 3, z1: sz + 3 })
      })
    }
    interact.add('buses', points)
    const built = b.build()
    for (const m of [toMesh(built.solid, materials.buildings, 'bus stops'), toMesh(built.glass, materials.glass, 'bus stops glass'), toMesh(lights.build(), materials.lights, 'bus stop lights')]) if (m) this.root.add(m)
    // 车：每条线同时最多 2 × 单程时间 / 发车间隔 + 1 辆
    const model = busGeometry()
    const body = toMesh(model.body, materials.elevated, 'bus')!
    const glow = toMesh(model.lights, materials.lights, 'bus lights')!
    this.geos.push(body.geometry, glow.geometry)
    const count = this.lines.reduce((n, l) => n + 2 * Math.ceil(tripTime(l) / l.headway) + 1, 0)
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group()
      const a = new THREE.Mesh(body.geometry, body.material)
      const c = new THREE.Mesh(glow.geometry, glow.material)
      a.matrixAutoUpdate = c.matrixAutoUpdate = true
      group.add(a, c)
      group.visible = false
      this.root.add(group)
      this.pool.push({ group, key: null })
    }
  }

  /** 每帧：按游戏时间摆好路上的车（视距内） */
  update(t: number, fx: number, fz: number, radius: number) {
    const want: { key: string; x: number; z: number; angle: number }[] = []
    for (const l of this.lines)
      for (const r of busesAt(l, t)) if (Math.hypot(r.pose.x - fx, r.pose.z - fz) < radius) want.push({ key: `${l.id}/${r.dir}@${r.dep}`, ...r.pose })
    const keys = new Set(want.map((w) => w.key))
    for (const s of this.pool)
      if (s.key && !keys.has(s.key)) {
        s.key = null
        s.group.visible = false
      }
    for (const w of want) {
      const slot = this.pool.find((s) => s.key === w.key) ?? this.pool.find((s) => !s.key)
      if (!slot) continue
      slot.key = w.key
      slot.group.visible = true
      slot.group.position.set(w.x, 0, w.z)
      slot.group.rotation.y = -w.angle
    }
  }

  line(id: string) {
    return this.lines.find((l) => l.id === id) ?? null
  }

  stop(line: BusLine, index: number) {
    return this.stops.find((s) => s.line === line && s.index === index)!
  }

  /** 上车：在站 from 等下一班去 to 的车 */
  board(line: BusLine, from: number, to: number, t: number): BusRide {
    const n = nextBus(line, from, to, t)
    return { line, dir: n.dir, dep: n.dep, board: n.board, arrive: n.arrive, from, to }
  }

  /** 坐车时玩家的位置和车头朝向（站在二层敞篷上） */
  seat(ride: BusRide, t: number): { x: number; y: number; z: number; angle: number } | null {
    const pose = busPose(ride.line, ride.dir, ride.dep, Math.min(t, ride.arrive))
    if (!pose) return null
    const [lx, ly, lz] = SEAT
    const c = Math.cos(pose.angle)
    const s = Math.sin(pose.angle)
    return { x: pose.x + lx * c - lz * s, y: ly, z: pose.z + lx * s + lz * c, angle: pose.angle }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && !this.geos.includes(o.geometry)) o.geometry.dispose()
    })
    for (const g of this.geos) g.dispose()
    this.root.removeFromParent()
  }
}
