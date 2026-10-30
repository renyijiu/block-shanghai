// 分块流式加载：按焦点（相机或玩家）位置加载视距内的分块、卸载远处的分块。
// 每帧建块有时间预算（docs/02 第 5 节），卸载时按 owner 一并释放几何体；
// 以后的建筑、行道树、碰撞盒、交互点也挂在同一个分块 owner 上
import * as THREE from 'three/webgpu'
import { Builder } from '../build/Builder.ts'
import { chunkSeed, mulberry32, pick } from '../build/random.ts'
import type { CityBuildings, Place } from '../city.ts'
import type { MetroData } from '../metro/data.ts'
import { buildElevatedStation, buildEntrance, buildVent, entranceFootprint, STATION_SIZE } from '../metro/structures.ts'
import { buildMetroTracks } from '../metro/trackMesh.ts'
import type { Box, CollisionWorld } from '../geo/CollisionWorld.ts'
import type { Projection } from '../geo/projection.ts'
import { CHUNK_SIZE, chunkKey } from './chunks.ts'
import { buildAreas, buildElevated, buildGroundRoads, type GeometryData } from './chunkMesh.ts'
import type { RoadInfo, RoadPiece } from './data.ts'
import type { DistrictIndex } from './districts.ts'
import type { InteractPoint, InteractRegistry } from './interact.ts'
import { blockedByRoad, findLots, overlapsObstacle, streetTreeSpots, type Lot, type LotInputs } from './lots.ts'
import { WORLD_COLORS, type WorldMaterials } from './materials.ts'
import { isWater } from './queries.ts'
import type { WorldData } from './WorldData.ts'

/** 生成分块需要的外部依赖 */
export interface ChunkContext {
  data: WorldData
  materials: WorldMaterials
  buildings: CityBuildings
  districts: DistrictIndex
  collision: CollisionWorld
  proj: Projection
  metro: MetroData | null
  interact: InteractRegistry
  /** 景点占地：程序化建筑和行道树避开 */
  landmarks: Lot[]
}

/**
 * 车站的高架站台按位置分组，合成一座车站：共线（如 3/4 号线）的两条线分别取了上下行的停靠点，
 * 相距几十格、方向相反，其实是同一座站。45 格内、方向平行（同向或反向）的合并，位置取平均
 */
export function elevatedStations(metro: MetroData, si: number) {
  const groups: { x: number; z: number; angle: number; h: number; lines: string[]; n: number }[] = []
  for (const p of metro.stations[si]!.platforms) {
    if (p.structure !== 'viaduct') continue
    const g = groups.find((g) => Math.hypot(g.x - p.pos[0], g.z - p.pos[1]) < 45 && Math.abs(Math.sin(g.angle - p.angle)) < 0.3)
    if (g) {
      g.x = (g.x * g.n + p.pos[0]) / (g.n + 1)
      g.z = (g.z * g.n + p.pos[1]) / (g.n + 1)
      g.n++
      g.lines.push(p.line)
    } else groups.push({ x: p.pos[0], z: p.pos[1], angle: p.angle, h: p.h, lines: [p.line], n: 1 })
  }
  return groups
}

const hexColor = (c: string) => Number.parseInt(c.slice(1), 16)

/** 地铁高架、地面轨道在地块避让里当作一条 9 格宽的路 */
const METRO_CORRIDOR: RoadInfo = { name: '', class: 'secondary', width: 9, level: 0, bridge: false }

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
    const metro = this.ctx.metro
    const mc = metro?.chunks[key]
    if (metro && mc?.tracks.length) {
      const color = (id: string) => hexColor(metro.lines.find((l) => l.id === id)?.color ?? '#888888')
      add(buildMetroTracks(mc.tracks, metro.tracks, color, piers), this.materials.elevated, 'metro')
    }
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
    const { buildings, data, metro } = this.ctx
    const key = chunkKey(cx, cz)
    const roadsNear: RoadPiece[] = []
    const roadInfo = [...data.roads.roads, METRO_CORRIDOR]
    const obstacles: Lot[] = this.ctx.landmarks.map((l) => ({ x0: l.x0 - 2, z0: l.z0 - 2, x1: l.x1 + 2, z1: l.z1 + 2 }))
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const k = chunkKey(cx + dx, cz + dz)
        roadsNear.push(...(data.roads.chunks[k] ?? []))
        // 地上的地铁轨道（高架、地面段、坡道）也要避让
        for (const [, pts] of metro?.chunks[k]?.tracks ?? []) if (pts.some((v, i) => i % 3 === 2 && v > 0.5)) roadsNear.push([roadInfo.length - 1, pts])
        for (const e of metro?.chunks[k]?.entrances ?? []) {
          const f = entranceFootprint(metro!, e)
          obstacles.push({ x0: f.x0 - 1, z0: f.z0 - 1, x1: f.x1 + 1, z1: f.z1 + 1 })
        }
        // 高架车站的占地（取外接矩形）
        for (const si of metro?.chunks[k]?.stations ?? []) {
          for (const st of elevatedStations(metro!, si)) {
            const r = STATION_SIZE.len / 2 + 2
            obstacles.push({ x0: st.x - r, z0: st.z - r, x1: st.x + r, z1: st.z + r })
          }
        }
      }
    }
    const src = data.chunk(key)
    const inputs: LotInputs = { roads: roadsNear, roadInfo, water: src.water, parks: src.parks, obstacles }
    const b = new Builder()
    const rng = mulberry32(chunkSeed(cx, cz))
    const points: InteractPoint[] = []
    if (metro) this.buildMetroSurface(b, cx, cz, inputs, points)
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
    this.ctx.interact.add(key, points)
    return b.build()
  }

  /** 地铁口（带交互点）、地下站的风亭；风亭的位置也加进避让，后面盖房子时让开 */
  private buildMetroSurface(b: Builder, cx: number, cz: number, inputs: LotInputs, points: InteractPoint[]) {
    const metro = this.ctx.metro!
    const mc = metro.chunks[chunkKey(cx, cz)]
    if (!mc) return
    for (const e of mc.entrances) {
      const ent = metro.entrances[e]!
      const st = metro.stations[ent.station]!
      buildEntrance(b, entranceFootprint(metro, e))
      const exit = ent.ref ? `${ent.ref} 号口` : '出入口'
      points.push({ x: ent.pos[0], z: ent.pos[1], r: 5, label: `${st.name}站 · ${exit}`, action: '进站', kind: 'metro', station: ent.station, entrance: e })
    }
    const color = (id: string) => hexColor(metro.lines.find((l) => l.id === id)?.color ?? '#888888')
    for (const si of mc.stations) {
      // 高架车站：建在站台所在的分块
      for (const es of elevatedStations(metro, si)) {
        if (Math.floor(es.x / CHUNK_SIZE) !== cx || Math.floor(es.z / CHUNK_SIZE) !== cz) continue
        buildElevatedStation(b, es.x, es.z, es.angle, es.h, es.lines.map(color))
      }
    }
    for (const si of mc.stations) {
      const st = metro.stations[si]!
      // 风亭只建在站点所在的分块，且只给全地下的车站
      if (Math.floor(st.pos[0] / CHUNK_SIZE) !== cx || Math.floor(st.pos[1] / CHUNK_SIZE) !== cz) continue
      if (st.platforms.some((p) => p.structure !== 'tunnel')) continue
      const rng = mulberry32(chunkSeed(cx, cz) ^ Math.imul(si, 2654435761))
      let placed = 0
      for (let k = 0; k < 8 && placed < 2; k++) {
        const a = rng() * Math.PI * 2
        const d = 14 + rng() * 18
        const x = st.pos[0] + Math.cos(a) * d
        const z = st.pos[1] + Math.sin(a) * d
        const r = { x0: x - 1.5, z0: z - 1, x1: x + 1.5, z1: z + 1 }
        if (Math.floor(x / CHUNK_SIZE) !== cx || Math.floor(z / CHUNK_SIZE) !== cz) continue
        if (overlapsObstacle(r, inputs) || blockedByRoad(r, inputs, 1) || isWater(this.ctx.data, x, z)) continue
        buildVent(b, r)
        inputs.obstacles!.push({ x0: r.x0 - 1, z0: r.z0 - 1, x1: r.x1 + 1, z1: r.z1 + 1 })
        placed++
      }
    }
  }

  private placeAt(x: number, z: number): Place {
    const { lat, lon } = this.ctx.proj.unproject(x, z)
    const o = this.ctx.proj.origin
    const distKm = Math.hypot((lon - o.lon) * 111.32 * Math.cos((o.lat * Math.PI) / 180), (lat - o.lat) * 110.574)
    return { lat, lon, distKm, district: this.ctx.districts.at(x, z)?.id ?? null }
  }

  private unload(c: Chunk) {
    this.ctx.collision.removeOwner(c.key)
    this.ctx.interact.removeOwner(c.key)
    for (const o of c.group.children) if (o instanceof THREE.Mesh) o.geometry.dispose()
    c.group.removeFromParent()
    this.loaded.delete(c.key)
  }

  dispose() {
    for (const c of [...this.loaded.values()]) this.unload(c)
    this.queue = []
  }
}
