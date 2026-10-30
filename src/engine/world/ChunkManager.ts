// 分块流式加载：按焦点（相机或玩家）位置加载视距内的分块、卸载远处的分块。
// 每帧建块有时间预算（docs/02 第 5 节），卸载时按 owner 一并释放几何体；
// 以后的建筑、行道树、碰撞盒、交互点也挂在同一个分块 owner 上
import * as THREE from 'three/webgpu'
import { Builder } from '../build/Builder.ts'
import { chunkSeed, mulberry32, pick } from '../build/random.ts'
import type { CityBuildings, Place } from '../city.ts'
import type { Box, CollisionWorld } from '../geo/CollisionWorld.ts'
import type { Projection } from '../geo/projection.ts'
import { CHUNK_SIZE, chunkKey } from './chunks.ts'
import { buildAreas, buildElevated, buildGroundRoads, type GeometryData } from './chunkMesh.ts'
import type { RoadPiece } from './data.ts'
import type { DistrictIndex } from './districts.ts'
import { findLots, streetTreeSpots, type LotInputs } from './lots.ts'
import { WORLD_COLORS, type WorldMaterials } from './materials.ts'
import type { WorldData } from './WorldData.ts'

/** 生成分块需要的外部依赖 */
export interface ChunkContext {
  data: WorldData
  materials: WorldMaterials
  buildings: CityBuildings
  districts: DistrictIndex
  collision: CollisionWorld
  proj: Projection
}

export interface ChunkManagerOptions {
  /** 加载半径（格），一般等于视距 */
  radius: number
  /** 每帧建块的时间预算（毫秒） */
  budgetMs: number
}

interface Chunk {
  key: string
  group: THREE.Group
}

function toGeometry(d: GeometryData) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(d.position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(d.color, 3))
  if (d.win) g.setAttribute('win', new THREE.BufferAttribute(d.win, 1))
  g.setIndex(new THREE.BufferAttribute(d.index, 1))
  g.computeBoundingSphere()
  return g
}

export class ChunkManager {
  readonly root = new THREE.Group()
  private readonly loaded = new Map<string, Chunk>()
  private readonly ctx: ChunkContext
  private readonly data: WorldData
  private readonly materials: WorldMaterials
  private opts: ChunkManagerOptions
  private queue: { cx: number; cz: number; d: number }[] = []

  constructor(ctx: ChunkContext, opts: ChunkManagerOptions) {
    this.ctx = ctx
    this.data = ctx.data
    this.materials = ctx.materials
    this.opts = opts
    this.root.name = 'chunks'
  }

  get loadedCount() {
    return this.loaded.size
  }

  get pendingCount() {
    return this.queue.length
  }

  /** 建块耗时（毫秒）：最近 60 个分块的平均值和最大值 */
  readonly buildMs: number[] = []

  setRadius(radius: number) {
    this.opts = { ...this.opts, radius }
  }

  /** 每帧调用：更新需要的分块集合，在预算内建块 */
  update(x: number, z: number, budgetMs = this.opts.budgetMs) {
    this.plan(x, z)
    const t0 = performance.now()
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const { cx, cz } = this.queue.shift()!
      this.build(cx, cz)
    }
  }

  /** 出生、传送时：把焦点周围的分块一次建完（分批让出主线程，报告进度） */
  async prebuild(x: number, z: number, onProgress?: (done: number, total: number) => void) {
    this.plan(x, z)
    const total = this.queue.length
    while (this.queue.length) {
      this.update(x, z, 30)
      onProgress?.(total - this.queue.length, total)
      await new Promise((r) => setTimeout(r, 0))
    }
    // 耗时统计只看之后移动中的流式建块（预建时还有 JIT 预热）
    this.buildMs.length = 0
  }

  private plan(x: number, z: number) {
    const r = this.opts.radius
    const keep = r + CHUNK_SIZE // 卸载留一圈余量，来回走动时不反复建拆
    const fx = x / CHUNK_SIZE - 0.5
    const fz = z / CHUNK_SIZE - 0.5
    // 卸载
    for (const [key, c] of this.loaded) {
      const [cx, cz] = key.split(',').map(Number) as [number, number]
      if (Math.hypot(cx - fx, cz - fz) * CHUNK_SIZE > keep) this.unload(c)
    }
    // 需要建的分块，近的先建
    const n = Math.ceil(r / CHUNK_SIZE) + 1
    const ccx = Math.floor(x / CHUNK_SIZE)
    const ccz = Math.floor(z / CHUNK_SIZE)
    const queue: typeof this.queue = []
    for (let cx = ccx - n; cx <= ccx + n; cx++) {
      for (let cz = ccz - n; cz <= ccz + n; cz++) {
        const d = Math.hypot(cx - fx, cz - fz) * CHUNK_SIZE
        if (d > r || this.loaded.has(chunkKey(cx, cz)) || !this.data.inBounds(cx, cz)) continue
        queue.push({ cx, cz, d })
      }
    }
    queue.sort((a, b) => a.d - b.d)
    this.queue = queue
  }

  private build(cx: number, cz: number) {
    const key = chunkKey(cx, cz)
    if (this.loaded.has(key)) return
    const t0 = performance.now()
    const src = this.data.chunk(key)
    const roads = this.data.roads.roads
    const group = new THREE.Group()
    group.name = `chunk ${key}`
    const add = (d: GeometryData | null, material: THREE.Material, name: string) => {
      if (!d) return
      const mesh = new THREE.Mesh(toGeometry(d), material)
      mesh.name = name
      mesh.matrixAutoUpdate = false
      group.add(mesh)
    }
    add(buildAreas(src.parks, 0.02, WORLD_COLORS.parks, WORLD_COLORS.park), this.materials.parks, 'parks')
    add(buildAreas(src.water, 0.03, {}, 0xffffff), this.materials.water, 'water')
    add(buildGroundRoads(src.roads, roads), this.materials.roads, 'roads')
    const piers: Box[] = []
    add(buildElevated(src.roads, roads, piers), this.materials.elevated, 'elevated')
    const built = this.buildCity(cx, cz, src.roads)
    add(built.solid, this.materials.buildings, 'buildings')
    add(built.glass, this.materials.glass, 'glass')
    this.ctx.collision.add(key, [...built.colliders, ...piers])
    this.root.add(group)
    this.loaded.set(key, { key, group })
    this.buildMs.push(performance.now() - t0)
    if (this.buildMs.length > 60) this.buildMs.shift()
  }

  /** 地块上盖房子、路边种树（城市包决定风格和树种） */
  private buildCity(cx: number, cz: number, own: RoadPiece[]) {
    const { buildings, data } = this.ctx
    const roadsNear: RoadPiece[] = []
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) roadsNear.push(...(data.roads.chunks[chunkKey(cx + dx, cz + dz)] ?? []))
    const src = data.chunk(chunkKey(cx, cz))
    const inputs: LotInputs = { roads: roadsNear, roadInfo: data.roads.roads, water: src.water, parks: src.parks }
    const b = new Builder()
    const rng = mulberry32(chunkSeed(cx, cz))
    // 位置信息（所在区、经纬度）按 24 格网格缓存：同一格里的地块和树共用，省掉大量点在多边形内的判断
    const places = new Map<string, Place>()
    const placeAt = (x: number, z: number) => {
      const k = `${Math.floor(x / 24)},${Math.floor(z / 24)}`
      return places.get(k) ?? places.set(k, this.placeAt(x, z)).get(k)!
    }
    for (const lot of findLots(cx, cz, CHUNK_SIZE, inputs)) {
      const mix = buildings.mixAt(placeAt((lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2))
      const style = mix && pick(mix, rng)
      if (style) buildings.styles[style]?.(b, lot, rng)
    }
    for (const t of streetTreeSpots(own, inputs, buildings.treeSpacing)) {
      const mix = buildings.treeMixAt(placeAt(t.x, t.z))
      const species = mix && pick(mix, rng)
      if (species) buildings.trees[species]?.(b, t.x, t.z, rng)
    }
    return b.build()
  }

  private placeAt(x: number, z: number): Place {
    const { lat, lon } = this.ctx.proj.unproject(x, z)
    const o = this.ctx.proj.origin
    const distKm = Math.hypot((lon - o.lon) * 111.32 * Math.cos((o.lat * Math.PI) / 180), (lat - o.lat) * 110.574)
    return { lat, lon, distKm, district: this.ctx.districts.at(x, z)?.id ?? null }
  }

  private unload(c: Chunk) {
    this.ctx.collision.removeOwner(c.key)
    for (const o of c.group.children) if (o instanceof THREE.Mesh) o.geometry.dispose()
    c.group.removeFromParent()
    this.loaded.delete(c.key)
  }

  dispose() {
    for (const c of [...this.loaded.values()]) this.unload(c)
    this.queue = []
  }
}
