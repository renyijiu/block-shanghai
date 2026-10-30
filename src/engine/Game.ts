// 游戏主控（P0 骨架）：渲染循环 + 投影参数可视化预览
// 后续世界流式加载、玩家、交通等系统都挂在这里，见 docs/02-architecture.md
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createProjection, type Projection } from './geo/projection.ts'
import type { CityConfig } from './city.ts'

export const CHUNK_SIZE = 240 // 城市分块边长（格）

export type RenderBackend = 'WebGPU' | 'WebGL 2'

export class Game {
  readonly container: HTMLElement
  readonly city: CityConfig
  readonly proj: Projection
  readonly renderer: THREE.WebGPURenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 1, 1, 12000)
  readonly controls: OrbitControls
  private readonly ro: ResizeObserver
  private disposed = false

  constructor(container: HTMLElement, city: CityConfig) {
    this.container = container
    this.city = city
    this.proj = createProjection(city.projection)

    // 默认走 WebGPU，不支持时自动回退 WebGL 2（docs/07-tech-selection.md 第 4 节）
    this.renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x9cc4e4)
    this.scene.fog = new THREE.Fog(0x9cc4e4, 3000, 9000)

    this.camera.position.set(0, 1600, 2600)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05

    this.buildPreview()

    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
  }

  // WebGPURenderer 的初始化是异步的：探测 WebGPU 适配器，拿不到就切到 WebGL 2 后端
  async init(): Promise<RenderBackend> {
    await this.renderer.init()
    return this.backend
  }

  get backend(): RenderBackend {
    return 'isWebGPUBackend' in this.renderer.backend ? 'WebGPU' : 'WebGL 2'
  }

  buildPreview() {
    const { coreRadiusKm, unitsPerKm } = this.proj
    const coreR = coreRadiusKm * unitsPerKm

    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x8a8478, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(800, 1500, 600)
    this.scene.add(sun)

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshLambertMaterial({ color: 0x9a968c }))
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    // 分块网格：每格一个 CHUNK
    const n = Math.ceil((coreR * 2) / CHUNK_SIZE)
    const grid = new THREE.GridHelper(n * CHUNK_SIZE, n, 0x6f6a60, 0x7f7a70)
    grid.position.y = 0.5
    this.scene.add(grid)

    // 核心区边界：圈内 1:1，圈外按 outerCompress 压缩
    const ring = new THREE.Mesh(new THREE.RingGeometry(coreR - 12, coreR + 12, 128), new THREE.MeshBasicMaterial({ color: 0xffd040, side: THREE.DoubleSide }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 1
    this.scene.add(ring)

    // 原点标记：方块柱
    const mat = new THREE.MeshLambertMaterial({ color: 0xc8282a })
    for (let i = 0; i < 6; i++) {
      const s = 60 - i * 8
      const block = new THREE.Mesh(new THREE.BoxGeometry(s, 40, s), mat)
      block.position.y = 20 + i * 40
      this.scene.add(block)
    }
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
    this.renderer.setAnimationLoop(() => {
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    })
  }

  stop() {
    this.renderer.setAnimationLoop(null)
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.ro.disconnect()
    this.controls.dispose()
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose()
        const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) m.dispose()
      }
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
