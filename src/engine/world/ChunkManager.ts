// 分块流式加载：按焦点（相机或玩家）位置加载视距内的分块、卸载远处的分块。
// 每帧建块有时间预算（docs/02 第 5 节），卸载时按 owner 一并释放几何体；
// 以后的建筑、行道树、碰撞盒、交互点也挂在同一个分块 owner 上
import * as THREE from 'three/webgpu'
import { CHUNK_SIZE, chunkKey } from './chunks.ts'
import { buildAreas, buildElevated, buildGroundRoads, type GeometryData } from './chunkMesh.ts'
import { WORLD_COLORS, type WorldMaterials } from './materials.ts'
import type { WorldData } from './WorldData.ts'

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
  g.setIndex(new THREE.BufferAttribute(d.index, 1))
  g.computeBoundingSphere()
  return g
}

export class ChunkManager {
  readonly root = new THREE.Group()
  private readonly loaded = new Map<string, Chunk>()
  private readonly data: WorldData
  private readonly materials: WorldMaterials
  private opts: ChunkManagerOptions
  private queue: { cx: number; cz: number; d: number }[] = []

  constructor(data: WorldData, materials: WorldMaterials, opts: ChunkManagerOptions) {
    this.data = data
    this.materials = materials
    this.opts = opts
    this.root.name = 'chunks'
  }

  get loadedCount() {
    return this.loaded.size
  }

  get pendingCount() {
    return this.queue.length
  }

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
    add(buildElevated(src.roads, roads), this.materials.elevated, 'elevated')
    this.root.add(group)
    this.loaded.set(key, { key, group })
  }

  private unload(c: Chunk) {
    for (const o of c.group.children) if (o instanceof THREE.Mesh) o.geometry.dispose()
    c.group.removeFromParent()
    this.loaded.delete(c.key)
  }

  dispose() {
    for (const c of [...this.loaded.values()]) this.unload(c)
    this.queue = []
  }
}
