// 景点：按距离加载 / 卸载、远近两档细节、走近时“发现”；用城市包的建模函数生成网格，登记碰撞、平台、电梯交互（docs/02 第 5 节）
import * as THREE from 'three/webgpu'
import { Builder } from '../build/Builder.ts'
import { GeoBuilder, rgb, type GeometryData } from '../build/geometry.ts'
import type { LandmarkContext, LandmarkDef, PartOptions } from '../city.ts'
import { orientedBox, type Box, type CollisionWorld } from '../geo/CollisionWorld.ts'
import type { Projection } from '../geo/projection.ts'
import type { InteractPoint, InteractRegistry } from '../world/interact.ts'
import type { Lot } from '../world/lots.ts'
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
  readonly p: PlacedLandmark
  private readonly proj: Projection

  constructor(p: PlacedLandmark, proj: Projection) {
    this.p = p
    this.proj = proj
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
    const opts = { ...o, windows: o.windows ?? 0.6 }
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

  elevator(x: number, z: number, tx: number, ty: number, tz: number, deck: string) {
    const name = this.p.def.name
    const [bx, bz] = this.p.toWorld(x, z)
    const [wx, wz] = this.p.toWorld(tx, tz)
    const kind = 'elevator'
    const landmark = this.p.def.id
    this.points.push({ x: bx, z: bz, r: 5, label: `${name} · 电梯去${deck}`, action: '乘电梯', kind, landmark, target: { x: wx, y: ty, z: wz }, arrive: `${name} · ${deck}` })
    // 顶上的电梯口：回到地面
    this.points.push({ x: wx, z: wz, r: 6, y: ty, label: `${name} · 电梯回地面`, action: '下楼', kind, landmark, target: { x: bx, y: 0, z: bz }, arrive: `${name} · 回到地面` })
  }

  toWorld(x: number, z: number): [number, number] {
    return this.p.toWorld(x, z)
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
  private readonly loaded = new Map<string, { near: THREE.Group; far: THREE.Group; group: THREE.Group }>()
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
    this.root.add(group)
    this.loaded.set(p.def.id, { near, far: farGroup, group })
    const owner = `landmark:${p.def.id}`
    this.collision.add(owner, [...built.colliders, ...lb.decks])
    this.interact.add(owner, lb.points)
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
