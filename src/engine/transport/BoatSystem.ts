// 船：码头（栈桥、趸船、站牌）、江面上按时刻表行驶的渡轮和游船、坐船（docs/02 第 5 节 Transport）。
// 码头只有几个，开局一次建好；船的位置每帧按游戏时间算
import * as THREE from 'three/webgpu'
import { Builder } from '../build/Builder.ts'
import { GeoBuilder, rgb, type GeometryData } from '../build/geometry.ts'
import type { BoatLineDef } from '../city.ts'
import { orientedBox, type Box, type CollisionWorld } from '../geo/CollisionWorld.ts'
import type { Projection } from '../geo/projection.ts'
import type { InteractPoint, InteractRegistry } from '../world/interact.ts'
import type { Lot } from '../world/lots.ts'
import type { WorldMaterials } from '../world/materials.ts'
import { isWater } from '../world/queries.ts'
import type { WorldData } from '../world/WorldData.ts'
import { arrivalOf, boatsAt, nextDeparture, Polyline, runPose, type BoatLine, type BoatPose } from './boats.ts'

/** 船型：半长、半宽（格），玩家在船上的位置（局部坐标：x 朝船头、y 甲板高度） */
const HULL = {
  ferry: { halfLen: 8, halfBeam: 3, seat: [2.5, 3.1, 1.2] as const },
  cruise: { halfLen: 11, halfBeam: 3.5, seat: [6, 5.1, 0] as const }
}
/** 栈桥（含趸船）最短长度（格） */
const MIN_JETTY = 7
/** 水面高度（和分块里水面网格一致） */
const WATER_Y = 0.03

export interface Pier {
  name: string
  /** 岸上的落脚点（下船回到这里） */
  land: [number, number]
  /** 船靠岸时船中心的位置 */
  dock: [number, number]
  /** 趸船中心（上船的交互点） */
  pontoon: [number, number]
  /** 停在这个泊位的船线和它在线上的码头序号 */
  line: BoatLine
  index: number
}

/** 正在坐的船 */
export interface Ride {
  line: BoatLine
  /** 上船的码头序号 */
  pier: number
  /** 这一班的发船、到达时刻（游戏秒） */
  dep: number
  arrive: number
  /** 下船的码头 */
  to: Pier
}

const parseClock = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h! * 3600 + m! * 60
}

/** 离 (x, z) 最近的陆地点（往岸上再走 1.5 格） */
function nearestLand(world: WorldData, x: number, z: number): [number, number] {
  for (let r = 0.5; r < 80; r += 0.5) {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2
      const px = x + Math.cos(a) * r
      const pz = z + Math.sin(a) * r
      if (!isWater(world, px, pz)) return [x + Math.cos(a) * (r + 1.5), z + Math.sin(a) * (r + 1.5)]
    }
  }
  return [x, z]
}

function toMesh(d: GeometryData | null, material: THREE.Material) {
  if (!d) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(d.position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(d.color, 3))
  g.setIndex(new THREE.BufferAttribute(d.index, 1))
  g.computeBoundingSphere()
  return new THREE.Mesh(g, material)
}

// 船的模型（局部坐标：x 朝船头，z 横向，y 向上，水线在 y = 0）
function boatGeometry(kind: 'ferry' | 'cruise') {
  const body = new GeoBuilder()
  const lights = new GeoBuilder()
  body.window = 0
  lights.window = 0
  const B = (g: GeoBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, top = c) => g.box(x0, y0, z0, x1, y1, z1, rgb(c), rgb(top))
  if (kind === 'ferry') {
    // 黄浦江渡轮：两头一样（不用掉头），蓝色船身、白色船舱、顶层露天甲板
    B(body, -8, -0.8, -3, 8, 1, 3, 0x2f5f9e, 0x8a8d91)
    for (const s of [-1, 1]) B(body, s > 0 ? 8 : -9.2, -0.3, -2.2, s > 0 ? 9.2 : -8, 1, 2.2, 0x2f5f9e, 0x8a8d91)
    B(body, -8, 0.7, -3.05, 8, 0.95, 3.05, 0xf2f2ee)
    B(body, -5.5, 1, -2.6, 5.5, 3, 2.6, 0xf2f2ee)
    for (const s of [-1, 1]) B(body, -5, 1.6, s > 0 ? 2.6 : -2.65, 5, 2.5, s > 0 ? 2.65 : -2.6, 0x26313b)
    B(body, -5.5, 3, -2.6, 5.5, 3.1, 2.6, 0xd9d9d4)
    B(body, -1, 3.1, -1, 1, 4.3, 1, 0xf2f2ee, 0xc0392b)
    for (const s of [-1, 1]) B(lights, -5.5, 3.1, s > 0 ? 2.5 : -2.6, 5.5, 3.9, s > 0 ? 2.6 : -2.5, 0xbfe3ff)
    return { body: body.build(), lights: lights.build() }
  }
  // 浦江游船：白色船身红色腰线、两层玻璃船舱、顶层露天甲板，夜里船舷灯带亮
  B(body, -11, -1, -3.5, 11, 1.2, 3.5, 0xf4f4f0, 0x9a9da2)
  B(body, 11, -0.6, -2.6, 13, 1.2, 2.6, 0xf4f4f0, 0x9a9da2)
  B(body, 13, 0, -1.4, 14, 1.2, 1.4, 0xf4f4f0)
  B(body, -11, 0.4, -3.55, 13, 0.7, 3.55, 0xb22a2a)
  B(body, -9, 1.2, -3.1, 9, 3.1, 3.1, 0xe8e8e2)
  for (const s of [-1, 1]) B(body, -8.5, 1.6, s > 0 ? 3.1 : -3.15, 8.5, 2.8, s > 0 ? 3.15 : -3.1, 0x1d3550)
  B(body, -7, 3.1, -2.8, 7, 5, 2.8, 0xe8e8e2)
  for (const s of [-1, 1]) B(body, -6.5, 3.4, s > 0 ? 2.8 : -2.85, 6.5, 4.7, s > 0 ? 2.85 : -2.8, 0x1d3550)
  B(body, -9, 5, -3.1, 9, 5.1, 3.1, 0xc9c5bc)
  B(body, -2, 5.1, -1.2, 0, 6.6, 1.2, 0xe8e8e2, 0xb22a2a)
  // 顶层甲板的细栏杆
  for (const s of [-1, 1]) B(body, -9, 5.1, s > 0 ? 3 : -3.1, 9, 6, s > 0 ? 3.1 : -3, 0x9aa3ad)
  B(body, 8.9, 5.1, -3, 9, 6, 3, 0x9aa3ad)
  B(body, -9, 5.1, -3, -8.9, 6, 3, 0x9aa3ad)
  // 船舷灯带：腰线暖黄、二层檐口粉、栏杆扶手冷白
  for (const s of [-1, 1]) {
    B(lights, -11, 1.15, s > 0 ? 3.5 : -3.6, 13, 1.3, s > 0 ? 3.6 : -3.5, 0xffd27a)
    B(lights, -9, 3.0, s > 0 ? 3.1 : -3.2, 9, 3.15, s > 0 ? 3.2 : -3.1, 0xff7ab6)
    B(lights, -9, 6, s > 0 ? 3 : -3.1, 9, 6.08, s > 0 ? 3.1 : -3, 0xcfe8ff)
  }
  return { body: body.build(), lights: lights.build() }
}

export class BoatSystem {
  readonly root = new THREE.Group()
  readonly lines: BoatLine[] = []
  readonly piers: Pier[] = []
  /** 码头占地：程序化建筑避开 */
  readonly footprints: Lot[] = []
  private readonly kinds = new Map<string, 'ferry' | 'cruise'>()
  private readonly pool: { kind: 'ferry' | 'cruise'; group: THREE.Group; key: string | null }[] = []
  private readonly geos: THREE.BufferGeometry[] = []

  constructor(defs: BoatLineDef[], proj: Projection, world: WorldData, materials: WorldMaterials, collision: CollisionWorld, interact: InteractRegistry) {
    this.root.name = 'boats'
    const b = new Builder()
    const lights = new GeoBuilder()
    const decks: Box[] = []
    for (const d of defs) {
      const pts = d.path.map(([lat, lon]) => {
        const p = proj.project(lat, lon)
        return [p.x, p.z] as [number, number]
      })
      const hull = HULL[d.kind]
      // 两头（游船只有出发这头）：找最近的岸，船中心停在栈桥外
      const ends = d.kind === 'ferry' ? [0, 1] : [0]
      const berths: Omit<Pier, 'line'>[] = []
      for (const k of ends) {
        const name = d.piers[k]!
        let [px, pz] = k === 0 ? pts[0]! : pts[pts.length - 1]!
        let land = nearestLand(world, px, pz)
        let ux = px - land[0]
        let uz = pz - land[1]
        let dist = Math.hypot(ux, uz) || 1
        ux /= dist
        uz /= dist
        // 同一个码头的另一条线已经占了这里：沿岸挪开 24 格，两条船同时靠岸也不会叠在一起
        const other = this.piers.find((p) => Math.hypot(p.land[0] - land[0], p.land[1] - land[1]) < 12)
        if (other) {
          const side = Math.sign((land[0] - other.land[0]) * -uz + (land[1] - other.land[1]) * ux) || 1
          px += -uz * side * 24
          pz += ux * side * 24
          land = nearestLand(world, px, pz)
          ux = px - land[0]
          uz = pz - land[1]
          dist = Math.hypot(ux, uz) || 1
          ux /= dist
          uz /= dist
        }
        const reach = Math.max(dist, MIN_JETTY + hull.halfLen)
        const dock: [number, number] = [land[0] + ux * reach, land[1] + uz * reach]
        // 换掉航线端点；离岸比靠岸点还近的航线点去掉，免得船先往岸边拐一下
        const near = (p: [number, number]) => Math.hypot(p[0] - land[0], p[1] - land[1]) < reach + 3
        if (k === 0) {
          pts[0] = dock
          while (pts.length > 2 && near(pts[1]!)) pts.splice(1, 1)
        } else {
          pts[pts.length - 1] = dock
          while (pts.length > 2 && near(pts[pts.length - 2]!)) pts.splice(pts.length - 2, 1)
        }
        const len = reach - hull.halfLen - 0.3
        this.buildPier(b, lights, decks, land, [ux, uz], len)
        berths.push({ name, land, dock, pontoon: [land[0] + ux * (len - 2.5), land[1] + uz * (len - 2.5)], index: k })
      }
      const line: BoatLine = {
        id: d.id,
        name: d.name,
        kind: d.kind,
        fare: d.fare,
        path: new Polyline(pts),
        piers: d.piers,
        speed: d.speed,
        first: parseClock(d.first),
        last: parseClock(d.last),
        dwell: d.dwellMin * 60,
        headway: (d.headwayMin ?? 30) * 60
      }
      for (const p of berths) this.piers.push({ ...p, line })
      this.lines.push(line)
      this.kinds.set(line.id, d.kind)
    }
    // 码头的交互点：在趸船上按 E 打开船票面板（同名码头的几条线都能坐）
    const points: InteractPoint[] = this.piers.map((p) => ({
      x: p.pontoon[0],
      z: p.pontoon[1],
      r: 6,
      label: `${p.name} · ${this.linesAt(p.name).map((b) => b.line.name).join(' / ')}`,
      action: '坐船',
      kind: 'boat',
      pier: p.name
    }))
    interact.add('boats', points)
    const built = b.build()
    collision.add('boats', [...built.colliders, ...decks])
    for (const m of [toMesh(built.solid, materials.elevated), toMesh(lights.build(), materials.lights)]) if (m) this.root.add(m)
    // 船：每条渡轮一条，游船最多同时 3 条
    const models = { ferry: boatGeometry('ferry'), cruise: boatGeometry('cruise') }
    const count = { ferry: this.lines.filter((l) => l.kind === 'ferry').length, cruise: 3 }
    for (const kind of ['ferry', 'cruise'] as const) {
      const body = toMesh(models[kind].body, materials.elevated)!
      const glow = toMesh(models[kind].lights, materials.lights)!
      this.geos.push(body.geometry, glow.geometry)
      for (let i = 0; i < count[kind]; i++) {
        const group = new THREE.Group()
        group.add(new THREE.Mesh(body.geometry, body.material), new THREE.Mesh(glow.geometry, glow.material))
        group.visible = false
        this.root.add(group)
        this.pool.push({ kind, group, key: null })
      }
    }
  }

  // 码头：岸边的站牌，伸到江里的栈桥，尽头一块宽一点的趸船平台带雨棚
  private buildPier(b: Builder, lights: GeoBuilder, decks: Box[], land: [number, number], u: [number, number], len: number) {
    const [ux, uz] = u
    const angle = Math.atan2(uz, ux)
    const start = -2
    const mid = (start + len) / 2
    const cx = land[0] + ux * mid
    const cz = land[1] + uz * mid
    const L = len - start
    b.orientedBox(cx, cz, angle, L, 3.6, 0, 0.45, 0x8c8a86, { windows: 0, collide: false })
    decks.push({ ...orientedBox(cx, cz, angle, L, 3.6, 0, 0.45), deck: true })
    // 趸船
    const px = land[0] + ux * (len - 2.5)
    const pz = land[1] + uz * (len - 2.5)
    b.orientedBox(px, pz, angle, 5, 8, -0.4, 0.45, 0x5b6470, { windows: 0, collide: false, top: 0x8c8a86 })
    decks.push({ ...orientedBox(px, pz, angle, 5, 8, 0, 0.45), deck: true })
    // 雨棚和栏杆
    const vx = -uz
    const vz = ux
    for (const s of [-1, 1])
      for (const t of [-1.8, 1.8]) b.orientedBox(px + ux * t + vx * s * 3.6, pz + uz * t + vz * s * 3.6, angle, 0.3, 0.3, 0.45, 3.2, 0xdedcd6, { windows: 0, collide: false })
    b.orientedBox(px, pz, angle, 5.2, 8.4, 3.2, 3.5, 0x2a6fb5, { windows: 0, collide: false })
    for (const s of [-1, 1]) b.orientedBox(cx + vx * s * 1.75, cz + vz * s * 1.75, angle, L, 0.12, 0.45, 1.4, 0xb9bec4, { windows: 0, collide: false })
    // 岸上的站牌（夜里亮）
    const sx = land[0] - ux * 1.5 + vx * 2.6
    const sz = land[1] - uz * 1.5 + vz * 2.6
    b.orientedBox(sx, sz, angle, 0.25, 0.25, 0, 3, 0x4a4d52, { windows: 0 })
    lights.window = 0
    lights.orientedBox(sx, sz, angle, 0.3, 2, 2.2, 3.2, rgb(0x2a6fb5), rgb(0x2a6fb5))
    this.footprints.push({ x0: Math.min(land[0], px) - 6, z0: Math.min(land[1], pz) - 6, x1: Math.max(land[0], px) + 6, z1: Math.max(land[1], pz) + 6 })
  }

  /** 某个码头（按名字）停靠的所有船线泊位 */
  linesAt(name: string): Pier[] {
    return this.piers.filter((p) => p.name === name)
  }

  /** 每帧：按游戏时间摆好江面上的船（视距内） */
  update(t: number, fx: number, fz: number, radius: number) {
    const want: { kind: 'ferry' | 'cruise'; key: string; pose: BoatPose }[] = []
    for (const l of this.lines)
      for (const pose of boatsAt(l, t)) if (Math.hypot(pose.x - fx, pose.z - fz) < radius + 50) want.push({ kind: l.kind, key: `${l.id}@${pose.run}`, pose })
    const keys = new Set(want.map((w) => w.key))
    for (const s of this.pool) {
      if (s.key && !keys.has(s.key)) {
        s.key = null
        s.group.visible = false
      }
    }
    for (const w of want) {
      const slot = this.pool.find((s) => s.key === w.key) ?? this.pool.find((s) => !s.key && s.kind === w.kind)
      if (!slot) continue
      slot.key = w.key
      slot.group.visible = true
      slot.group.position.set(w.pose.x, WATER_Y, w.pose.z)
      slot.group.rotation.y = -w.pose.angle
    }
  }

  /** 上船：在泊位 berth 坐下一班 */
  board(berth: Pier, t: number): Ride {
    const { line, index } = berth
    const dep = nextDeparture(line, index, t)
    const to = line.kind === 'ferry' ? this.piers.find((p) => p.line === line && p.index === 1 - index)! : berth
    return { line, pier: index, dep, arrive: arrivalOf(line, dep), to }
  }

  /** 坐船时玩家的位置和朝向（站在船的顶层甲板上） */
  seat(ride: Ride, t: number): { x: number; y: number; z: number; angle: number } {
    const pose = runPose(ride.line, ride.pier, ride.dep, t)
    const [lx, ly, lz] = HULL[ride.line.kind].seat
    const c = Math.cos(pose.angle)
    const s = Math.sin(pose.angle)
    return { x: pose.x + lx * c - lz * s, y: WATER_Y + ly, z: pose.z + lx * s + lz * c, angle: pose.angle }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && !this.geos.includes(o.geometry)) o.geometry.dispose()
    })
    for (const g of this.geos) g.dispose()
    this.root.removeFromParent()
  }
}
