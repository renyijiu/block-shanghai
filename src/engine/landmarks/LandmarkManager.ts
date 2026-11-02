// 景点：按距离加载 / 卸载、远近两档细节、走近时“发现”；用城市包的建模函数生成网格，登记碰撞、平台、电梯交互（docs/02 第 5 节）
import * as THREE from 'three/webgpu'
import { Builder } from '../build/Builder.ts'
import { GeoBuilder, rgb, type GeometryData } from '../build/geometry.ts'
import type { LandmarkContext, LandmarkDef, Motion, PartOptions, RideDef, Vec3 } from '../city.ts'
import { orientedBox, type Box, type CollisionWorld } from '../geo/CollisionWorld.ts'
import type { Projection } from '../geo/projection.ts'
import type { InteractPoint, InteractRegistry } from '../world/interact.ts'
import type { Lot } from '../world/lots.ts'
import { tr } from '../../i18n/core.ts'
import type { WorldMaterials } from '../world/materials.ts'

/** 摆到世界里的景点 */
export interface PlacedLandmark {
  def: LandmarkDef
  x: number
  z: number
  /** 局部坐标 → 世界坐标 */
  toWorld(lx: number, lz: number): [number, number]
  /** 世界坐标 → 局部坐标 */
  toLocal(wx: number, wz: number): [number, number]
  /** 占地的世界外接矩形 */
  bounds: Lot
  /** 避让范围的世界外接矩形 */
  footprints: Lot[]
}

const DEFAULT_LOAD_R = 900
/** 超过这个距离只画远景简模 */
export const LOD_R = 450
/** 远景简模只保留最长边不小于这个尺寸的构件（格） */
const LOD_MIN = 3
/** 走到占地矩形这个距离以内算发现 */
export const DISCOVER_R = 30

/** 点到矩形的水平距离（在矩形里为 0） */
export function distToRect(x: number, z: number, r: Lot) {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1))
}

export function placeLandmark(def: LandmarkDef, proj: Projection): PlacedLandmark {
  const { x, z } = proj.project(def.lat, def.lon)
  const c = Math.cos(def.rot)
  const s = Math.sin(def.rot)
  const toWorld = (lx: number, lz: number): [number, number] => [x + lx * c - lz * s, z + lx * s + lz * c]
  const toLocal = (wx: number, wz: number): [number, number] => [(wx - x) * c + (wz - z) * s, -(wx - x) * s + (wz - z) * c]
  const aabb = ([x0, z0, x1, z1]: LandmarkDef['rect']): Lot => {
    const corners = [toWorld(x0, z0), toWorld(x1, z0), toWorld(x0, z1), toWorld(x1, z1)]
    const xs = corners.map((p) => p[0])
    const zs = corners.map((p) => p[1])
    return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }
  }
  return { def, x, z, toWorld, toLocal, bounds: aabb(def.rect), footprints: (def.footprint ?? [def.rect]).map(aabb) }
}

/** 实现 LandmarkContext：局部坐标换算成世界坐标，写进 Builder（普通 / 玻璃）和灯光网格 */
export class LandmarkBuilder implements LandmarkContext {
  readonly b = new Builder()
  readonly lights = new GeoBuilder()
  /** 远景简模：只有大构件，不登记碰撞 */
  readonly far = new Builder()
  readonly farLights = new GeoBuilder()
  readonly points: InteractPoint[] = []
  readonly decks: Box[] = []
  /** 会动的部件：每个部件单独建一份（不进碰撞、不进远景） */
  readonly movers: { motion: Motion; sub: LandmarkBuilder; ride?: RideDef }[] = []
  readonly p: PlacedLandmark
  private readonly proj: Projection
  /** 会动的部件四面八方都看得到（转起来能看见底），所有构件都画底面 */
  private readonly allSides: boolean

  constructor(p: PlacedLandmark, proj: Projection, allSides = false) {
    this.p = p
    this.proj = proj
    this.allSides = allSides
  }

  private part(cx: number, cz: number, len: number, wid: number, y0: number, y1: number, color: number, twist: number, o: PartOptions) {
    const [wx, wz] = this.p.toWorld(cx, cz)
    const angle = this.p.def.rot + twist
    const big = Math.max(len, wid, y1 - y0) >= LOD_MIN
    if (o.light) {
      for (const g of big ? [this.lights, this.farLights] : [this.lights]) {
        g.window = 0
        g.orientedBox(wx, wz, angle, len, wid, y0, y1, rgb(color), rgb(o.top ?? color))
      }
      if (o.collide ?? y0 < 1) this.b.colliders.push(orientedBox(wx, wz, angle, len, wid, y0, y1))
      return
    }
    const opts = { ...o, windows: o.windows ?? 0.6, bottom: o.bottom ?? this.allSides }
    this.b.orientedBox(wx, wz, angle, len, wid, y0, y1, color, opts)
    if (big) this.far.orientedBox(wx, wz, angle, len, wid, y0, y1, color, { ...opts, collide: false })
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, o: PartOptions = {}) {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return
    this.part((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y0, y1, color, 0, o)
  }

  slab(cx: number, cz: number, w: number, d: number, y0: number, y1: number, color: number, twist = 0, o: PartOptions = {}) {
    this.part(cx, cz, w, d, y0, y1, color, twist, o)
  }

  ball(cx: number, cy: number, cz: number, r: number, color: number, o: PartOptions = {}) {
    const n = Math.max(3, Math.round(r))
    for (let i = 0; i < n; i++) {
      const y0 = cy - r + (2 * r * i) / n
      const y1 = cy - r + (2 * r * (i + 1)) / n
      const ym = (y0 + y1) / 2 - cy
      const w = 2 * Math.sqrt(Math.max(0, r * r - ym * ym)) * 0.92
      this.part(cx, cz, w, w, y0, y1, color, 0, { collide: false, ...o })
      this.part(cx, cz, w * 0.72, w * 0.72, y0, y1, color, Math.PI / 4, { collide: false, ...o })
    }
  }

  column(cx: number, cz: number, r: number, y0: number, y1: number, color: number, o: PartOptions = {}) {
    this.part(cx, cz, r * 1.75, r * 1.75, y0, y1, color, 0, o)
    this.part(cx, cz, r * 1.75, r * 1.75, y0, y1, color, Math.PI / 4, { ...o, collide: false })
  }

  beam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, h: number, color: number, o: PartOptions = {}) {
    const [ax, az] = this.p.toWorld(x0, z0)
    const [bx, bz] = this.p.toWorld(x1, z1)
    const a = [ax, y0, az]
    const b = [bx, y1, bz]
    const big = Math.hypot(x1 - x0, y1 - y0, z1 - z0) >= LOD_MIN && Math.max(w, h) >= 0.5
    if (o.light) {
      for (const g of big ? [this.lights, this.farLights] : [this.lights]) {
        g.window = 0
        g.beam(a, b, w, h, rgb(color))
      }
      return
    }
    this.b.beam(a, b, w, h, color, o)
    if (big) this.far.beam(a, b, w, h, color, o)
  }

  platform(x0: number, z0: number, x1: number, z1: number, y: number) {
    const [wx, wz] = this.p.toWorld((x0 + x1) / 2, (z0 + z1) / 2)
    this.decks.push({ ...orientedBox(wx, wz, this.p.def.rot, x1 - x0, z1 - z0, y - 0.4, y), deck: true })
  }

  elevator(x: number, z: number, tx: number, ty: number, tz: number, deckZh: string) {
    const name = this.p.def.name
    const deck = tr(deckZh)
    const [bx, bz] = this.p.toWorld(x, z)
    const [wx, wz] = this.p.toWorld(tx, tz)
    const kind = 'elevator'
    const landmark = this.p.def.id
    this.points.push({ x: bx, z: bz, r: 5, label: tr('{name} · 电梯去{deck}', { name, deck }), action: '乘电梯', kind, landmark, target: { x: wx, y: ty, z: wz }, arrive: `${name} · ${deck}` })
    // 顶上的电梯口：回到地面
    this.points.push({ x: wx, z: wz, r: 6, y: ty, label: tr('{name} · 电梯回地面', { name }), action: '下楼', kind, landmark, target: { x: bx, y: 0, z: bz }, arrive: tr('{name} · 回到地面', { name }) })
  }

  toWorld(x: number, z: number): [number, number] {
    return this.p.toWorld(x, z)
  }

  moving(motion: Motion, build: (c: LandmarkContext) => void, ride?: RideDef) {
    const sub = new LandmarkBuilder(this.p, this.proj, true)
    build(sub)
    this.movers.push({ motion, sub, ride })
    // 能坐的设施：入口的交互点（同一个设施挂在几个部件上时只登记一次）
    if (ride && !this.points.some((q) => q.ride === ride.id)) {
      const [x, z] = this.p.toWorld(ride.gate[0], ride.gate[1])
      const name = tr(ride.name)
      this.points.push({ x, z, r: 3, label: tr('{name} · {fare} 元', { name, fare: ride.fare }), action: '乘坐', kind: 'ride', landmark: this.p.def.id, ride: ride.id })
    }
  }

  local(lat: number, lon: number): [number, number] {
    const { x, z } = this.proj.project(lat, lon)
    const dx = x - this.p.x
    const dz = z - this.p.z
    const c = Math.cos(this.p.def.rot)
    const s = Math.sin(this.p.def.rot)
    return [dx * c + dz * s, -dx * s + dz * c]
  }
}

/** 一个会动的部件在场景里的样子：外层 group 摆位置和朝向，里面的网格挪到以参考点为原点 */
export interface Mover {
  group: THREE.Group
  pose(t: number): void
  /** 能坐的设施：设施定义和座位（建模时的世界坐标，跟着部件动） */
  ride?: RideDef
  seat?: THREE.Vector3
  content?: THREE.Group
}

/** 坐在设施上：每帧问座位在哪（世界坐标）、人朝哪 */
export interface Seat {
  ride: RideDef
  /** 入口（世界坐标），坐完回到这里 */
  gate: [number, number]
  /** 座位现在的世界坐标 */
  where(out: THREE.Vector3): THREE.Vector3
  /** 设定了朝向时人朝哪（玩家的 facing），没设定返回 null（朝运动方向） */
  facing: number | null
}

const smooth = (x: number) => x * x * (3 - 2 * x)

/** 按 motion 把部件摆到 t 秒（现实时间）时的位置 */
export function makeMover(p: PlacedLandmark, motion: Motion, content: THREE.Group): Mover {
  const w = ([x, y, z]: Vec3) => {
    const [wx, wz] = p.toWorld(x, z)
    return new THREE.Vector3(wx, y, wz)
  }
  const c = Math.cos(p.def.rot)
  const s = Math.sin(p.def.rot)
  const axisOf = (a: 'x' | 'y' | 'z') => (a === 'y' ? new THREE.Vector3(0, 1, 0) : a === 'x' ? new THREE.Vector3(c, 0, s) : new THREE.Vector3(-s, 0, c))
  const group = new THREE.Group()
  group.add(content)
  const q = new THREE.Quaternion()
  switch (motion.kind) {
    case 'spin':
    case 'swing': {
      const at = w(motion.at)
      const axis = axisOf(motion.axis)
      content.position.copy(at).negate()
      group.position.copy(at)
      return {
        group,
        pose: (t) => {
          const angle = motion.kind === 'spin' ? (t * motion.rpm * Math.PI) / 30 : motion.amp * Math.sin((2 * Math.PI * t) / motion.period)
          group.quaternion.setFromAxisAngle(axis, angle)
        }
      }
    }
    case 'orbit': {
      const at = w(motion.at)
      const anchor = w(motion.anchor)
      const axis = axisOf(motion.axis)
      const arm = anchor.clone().sub(at)
      content.position.copy(anchor).negate()
      const v = new THREE.Vector3()
      return {
        group,
        pose: (t) => {
          v.copy(arm).applyQuaternion(q.setFromAxisAngle(axis, (t * motion.rpm * Math.PI) / 30))
          group.position.copy(at).add(v)
        }
      }
    }
    case 'path': {
      const pts = motion.points.map(w)
      const cum = [0]
      for (let i = 1; i <= pts.length; i++) cum.push(cum[i - 1]! + pts[i % pts.length]!.distanceTo(pts[i - 1]!))
      const total = cum[pts.length]!
      const anchor = w(motion.anchor)
      const forward = axisOf('x')
      content.position.copy(anchor).negate()
      const dir = new THREE.Vector3()
      return {
        group,
        pose: (t) => {
          const d = (((t * motion.speed + (motion.offset ?? 0)) % total) + total) % total
          let i = 0
          while (cum[i + 1]! < d) i++
          const a = pts[i]!
          const b = pts[(i + 1) % pts.length]!
          const f = (d - cum[i]!) / Math.max(1e-6, cum[i + 1]! - cum[i]!)
          group.position.copy(a).lerp(b, f)
          dir.copy(b).sub(a).normalize()
          group.quaternion.setFromUnitVectors(forward, dir)
        }
      }
    }
    case 'drop': {
      return {
        group,
        pose: (t) => {
          // 前 60% 慢慢升，顶上停一会儿，一下子落下，底下再停一会儿
          const ph = (t % motion.period) / motion.period
          const k = ph < 0.6 ? smooth(ph / 0.6) : ph < 0.75 ? 1 : ph < 0.82 ? 1 - ((ph - 0.75) / 0.07) ** 2 : 0
          group.position.y = motion.height * k
        }
      }
    }
  }
}

export function toMesh(d: GeometryData | null, material: THREE.Material, name: string) {
  if (!d) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(d.position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(d.color, 3))
  if (d.win) g.setAttribute('win', new THREE.BufferAttribute(d.win, 1))
  g.setIndex(new THREE.BufferAttribute(d.index, 1))
  g.computeBoundingSphere()
  const m = new THREE.Mesh(g, material)
  m.name = name
  m.matrixAutoUpdate = false
  return m
}

export class LandmarkManager {
  readonly root = new THREE.Group()
  readonly placed: PlacedLandmark[]
  private readonly loaded = new Map<string, { near: THREE.Group; far: THREE.Group; group: THREE.Group; movers: Mover[] }>()
  /** 已发现的景点 → 发现时的游戏时间（秒） */
  readonly found = new Map<string, number>()
  private readonly proj: Projection
  private readonly materials: WorldMaterials
  private readonly collision: CollisionWorld
  private readonly interact: InteractRegistry
  /** 景点建好后再往上加东西（街边小店、文化牌） */
  private readonly extras: ((p: PlacedLandmark, lb: LandmarkBuilder) => void) | null

  constructor(defs: LandmarkDef[], proj: Projection, materials: WorldMaterials, collision: CollisionWorld, interact: InteractRegistry, extras: ((p: PlacedLandmark, lb: LandmarkBuilder) => void) | null = null) {
    this.placed = defs.map((d) => placeLandmark(d, proj))
    this.proj = proj
    this.materials = materials
    this.collision = collision
    this.interact = interact
    this.extras = extras
    this.root.name = 'landmarks'
  }

  /** 所有景点的占地（分块生成时避让） */
  get footprints(): Lot[] {
    return this.placed.flatMap((p) => p.footprints)
  }

  /** 焦点 (x, z) 决定加载哪些景点；相机位置 (cx, cz) 决定远近细节 */
  update(x: number, z: number, cx = x, cz = z) {
    for (const p of this.placed) {
      const d = Math.hypot(p.x - x, p.z - z)
      const r = p.def.loadR ?? DEFAULT_LOAD_R
      if (d < r && !this.loaded.has(p.def.id)) this.load(p)
      else if (d > r + 200 && this.loaded.has(p.def.id)) this.unload(p.def.id)
      const l = this.loaded.get(p.def.id)
      if (!l) continue
      const near = distToRect(cx, cz, p.bounds) < LOD_R
      l.near.visible = near
      l.far.visible = !near
    }
  }

  /** 发现检测：走近一个还没发现的景点时记下来并返回它（一次最多一个） */
  discover(x: number, z: number, time: number): PlacedLandmark | null {
    for (const p of this.placed) {
      if (this.found.has(p.def.id) || distToRect(x, z, p.bounds) > DISCOVER_R) continue
      this.found.set(p.def.id, time)
      return p
    }
    return null
  }

  /** (x, z) 在某个景点的 pierFree 范围里：高架道路在这里不立桥墩 */
  pierFree(x: number, z: number) {
    for (const p of this.placed) {
      if (!p.def.pierFree) continue
      const [lx, lz] = p.toLocal(x, z)
      if (p.def.pierFree.some(([x0, z0, x1, z1]) => lx >= x0 && lx <= x1 && lz >= z0 && lz <= z1)) return true
    }
    return false
  }

  isLoaded(id: string) {
    return this.loaded.has(id)
  }

  byId(id: string) {
    return this.placed.find((p) => p.def.id === id) ?? null
  }

  /** 离 (x, z) 最近、在 range 格内的景点 */
  nearest(x: number, z: number, range: number): PlacedLandmark | null {
    let best: PlacedLandmark | null = null
    let bestD = range
    for (const p of this.placed) {
      const d = Math.hypot(p.x - x, p.z - z)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }

  /** 一个景点的碰撞盒（不建网格；还没加载的也能取）：摆巴士站牌这类东西时避开景点的房子 */
  colliders(p: PlacedLandmark): Box[] {
    const lb = new LandmarkBuilder(p, this.proj)
    p.def.build(lb)
    this.extras?.(p, lb)
    return lb.b.colliders
  }

  private load(p: PlacedLandmark) {
    const lb = new LandmarkBuilder(p, this.proj)
    p.def.build(lb)
    this.extras?.(p, lb)
    const built = lb.b.build()
    const far = lb.far.build()
    const group = new THREE.Group()
    group.name = `landmark ${p.def.id}`
    const lod = (name: string, solid: GeometryData | null, glass: GeometryData | null, lights: GeometryData | null) => {
      const g = new THREE.Group()
      g.name = name
      for (const m of [toMesh(solid, this.materials.buildings, 'solid'), toMesh(glass, this.materials.glass, 'glass'), toMesh(lights, this.materials.lights, 'lights')]) if (m) g.add(m)
      group.add(g)
      return g
    }
    const near = lod('near', built.solid, built.glass, lb.lights.build())
    const farGroup = lod('far', far.solid, far.glass, lb.farLights.build())
    farGroup.visible = false
    // 会动的部件挂在近景下面，跟近景一起显示 / 隐藏
    const movers = lb.movers.map(({ motion, sub, ride }) => {
      const part = sub.b.build()
      const content = new THREE.Group()
      for (const m of [toMesh(part.solid, this.materials.buildings, 'solid'), toMesh(part.glass, this.materials.glass, 'glass'), toMesh(sub.lights.build(), this.materials.lights, 'lights')]) if (m) content.add(m)
      const mover: Mover = makeMover(p, motion, content)
      if (ride) {
        const [sx, sz] = p.toWorld(ride.seat[0], ride.seat[2])
        Object.assign(mover, { ride, seat: new THREE.Vector3(sx, ride.seat[1], sz), content })
      }
      mover.pose(0)
      near.add(mover.group)
      return mover
    })
    this.root.add(group)
    this.loaded.set(p.def.id, { near, far: farGroup, group, movers })
    const owner = `landmark:${p.def.id}`
    this.collision.add(owner, [...built.colliders, ...lb.decks])
    this.interact.add(owner, lb.points)
  }

  /** 每帧：近景里的游乐设施按现实时间 t（秒）动；running 为假时停在初始姿态 */
  animate(t: number, running: boolean) {
    for (const l of this.loaded.values()) {
      if (!l.movers.length || !l.near.visible) continue
      for (const m of l.movers) m.pose(running ? t : 0)
    }
  }

  /** 坐上景点里的设施：同一个设施有几个座位（摩天轮的吊舱）时挑现在最低的那个；景点没加载返回 null */
  seat(landmark: string, rideId: string): Seat | null {
    const l = this.loaded.get(landmark)
    const p = this.byId(landmark)
    if (!l || !p) return null
    const v = new THREE.Vector3()
    const at = (m: Mover, out: THREE.Vector3) => {
      m.group.updateMatrixWorld(true)
      return m.content!.localToWorld(out.copy(m.seat!))
    }
    const candidates = l.movers.filter((m) => m.ride?.id === rideId)
    if (!candidates.length) return null
    const m = candidates.reduce((a, b) => (at(a, v).y <= at(b, new THREE.Vector3()).y ? a : b))
    const ride = m.ride!
    let facing: number | null = null
    if (ride.face) {
      const [ax, az] = p.toWorld(0, 0)
      const [bx, bz] = p.toWorld(ride.face[0], ride.face[1])
      facing = Math.atan2(-(bx - ax), -(bz - az))
    }
    return { ride, gate: p.toWorld(ride.gate[0], ride.gate[1]), where: (out) => at(m, out), facing }
  }

  private unload(id: string) {
    const g = this.loaded.get(id)!.group
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    g.removeFromParent()
    this.loaded.delete(id)
    this.collision.removeOwner(`landmark:${id}`)
    this.interact.removeOwner(`landmark:${id}`)
  }

  dispose() {
    for (const id of [...this.loaded.keys()]) this.unload(id)
  }
}
