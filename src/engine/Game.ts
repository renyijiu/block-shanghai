// 游戏主控：渲染循环、系统调度。后续玩家、交通等系统都挂在这里，见 docs/02-architecture.md
import * as THREE from 'three/webgpu'
import type { CityPackage } from './city.ts'
import { DevCamera } from './DevCamera.ts'
import { createProjection, type Projection } from './geo/projection.ts'
import { ChunkManager } from './world/ChunkManager.ts'
import { CHUNK_SIZE } from './world/chunks.ts'
import { createWorldMaterials, type WorldMaterials } from './world/materials.ts'
import { WorldData } from './world/WorldData.ts'

export { CHUNK_SIZE }

export type RenderBackend = 'WebGPU' | 'WebGL 2'

const SKY = 0x9cc4e4

/** 画质相关参数（阶段 6 做成低 / 中 / 高三档） */
export const QUALITY = {
  viewDistance: 1050,
  reflection: false
}

export interface GameStats {
  fps: number
  drawCalls: number
  triangles: number
  chunks: number
  pending: number
  x: number
  z: number
}

export class Game {
  readonly container: HTMLElement
  readonly city: CityPackage
  readonly proj: Projection
  readonly renderer: THREE.WebGPURenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.5, QUALITY.viewDistance * 1.3)
  readonly devCamera: DevCamera
  readonly stats: GameStats = { fps: 0, drawCalls: 0, triangles: 0, chunks: 0, pending: 0, x: 0, z: 0 }
  private readonly ro: ResizeObserver
  private readonly materials: WorldMaterials
  private readonly ground: THREE.Mesh
  world: WorldData | null = null
  private chunks: ChunkManager | null = null
  private disposed = false
  private last = 0
  private frames = 0
  private statsAt = 0

  constructor(container: HTMLElement, city: CityPackage) {
    this.container = container
    this.city = city
    this.proj = createProjection(city.config.projection)

    // 默认走 WebGPU，不支持时自动回退 WebGL 2（docs/07-tech-selection.md 第 4 节）
    this.renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    // Neutral 色调映射基本保持原色，方块风格的配色不会被压灰
    this.renderer.toneMapping = THREE.NeutralToneMapping
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(SKY)
    this.scene.fog = new THREE.Fog(SKY, QUALITY.viewDistance * 0.55, QUALITY.viewDistance)
    this.scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x8a8170, 1.5))
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6)
    sun.position.set(-400, 900, 500)
    this.scene.add(sun)

    this.materials = createWorldMaterials()
    // 地面：跟着焦点移动的大平面，各图层贴在它上面
    const size = QUALITY.viewDistance * 2 + CHUNK_SIZE * 4
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.materials.ground)
    this.ground.rotation.x = -Math.PI / 2
    this.scene.add(this.ground)

    this.devCamera = new DevCamera(this.camera, this.renderer.domElement)

    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
  }

  /**
   * 初始化：渲染器（探测 WebGPU，拿不到就切到 WebGL 2）→ 加载地图数据 → 预建出生点周围的分块。
   * onProgress 用于加载界面
   */
  async init(onProgress?: (text: string) => void): Promise<RenderBackend> {
    await this.renderer.init()
    onProgress?.('加载地图数据…')
    const world = await WorldData.load(this.city.data, (d, t) => onProgress?.(`加载地图数据 ${d}/${t}`))
    if (this.disposed) return this.backend
    this.world = world
    this.chunks = new ChunkManager(world, this.materials, { radius: QUALITY.viewDistance, budgetMs: 6 })
    this.scene.add(this.chunks.root)

    // 机位：地址参数 ?cam=x,y,z&at=x,y,z（截图检查用），否则在出生点上空斜看
    const spawn = this.city.spawns[0]!
    const { x, z } = this.proj.project(spawn.lat, spawn.lon)
    const params = new URLSearchParams(location.search)
    if (QUALITY.reflection || params.get('reflect') === '1') this.materials.setReflection(true, this.scene)
    const vec = (s: string | null) => (s ? (s.split(',').map(Number) as [number, number, number]) : null)
    const cam = vec(params.get('cam'))
    const at = vec(params.get('at'))
    this.devCamera.set(cam ? { x: cam[0], y: cam[1], z: cam[2] } : { x: x - 120, y: 160, z: z + 260 }, at ? { x: at[0], y: at[1], z: at[2] } : { x, y: 0, z })

    const f = this.devCamera.focus
    await this.chunks.prebuild(f.x, f.z, (d, t) => onProgress?.(`生成城市 ${d}/${t}`))
    return this.backend
  }

  get backend(): RenderBackend {
    return 'isWebGPUBackend' in this.renderer.backend ? 'WebGPU' : 'WebGL 2'
  }

  resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  start() {
    // init() 期间组件可能已经卸载
    if (this.disposed) return
    this.last = performance.now()
    this.renderer.setAnimationLoop((now) => this.frame(now))
  }

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.devCamera.update(dt)
    const f = this.devCamera.focus
    this.chunks?.update(f.x, f.z)
    // 地面平面按分块对齐跟随，避免移动时贴图（以后有）抖动
    this.ground.position.set(Math.round(f.x / CHUNK_SIZE) * CHUNK_SIZE, 0, Math.round(f.z / CHUNK_SIZE) * CHUNK_SIZE)
    this.renderer.render(this.scene, this.camera)
    this.updateStats(now, f)
  }

  private updateStats(now: number, f: THREE.Vector3) {
    this.frames++
    if (now - this.statsAt < 500) return
    const info = this.renderer.info.render
    Object.assign(this.stats, {
      fps: Math.round((this.frames * 1000) / (now - this.statsAt)),
      drawCalls: info.drawCalls,
      triangles: info.triangles,
      chunks: this.chunks?.loadedCount ?? 0,
      pending: this.chunks?.pendingCount ?? 0,
      x: Math.round(f.x),
      z: Math.round(f.z)
    })
    this.frames = 0
    this.statsAt = now
  }

  stop() {
    this.renderer.setAnimationLoop(null)
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.ro.disconnect()
    this.devCamera.dispose()
    this.chunks?.dispose()
    this.ground.geometry.dispose()
    this.materials.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
