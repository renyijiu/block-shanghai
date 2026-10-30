// 游戏主控（P0 骨架）：渲染循环 + 投影参数可视化预览
// 后续世界流式加载、玩家、交通等系统都挂在这里，见 docs/02-architecture.md
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createProjection } from './geo/projection.js'

export const CHUNK_SIZE = 240 // 城市分块边长（格）

export class Game {
  constructor(container, city) {
    this.container = container
    this.city = city
    this.proj = createProjection(city.projection)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x9cc4e4)
    this.scene.fog = new THREE.Fog(0x9cc4e4, 3000, 9000)

    this.camera = new THREE.PerspectiveCamera(60, 1, 1, 12000)
    this.camera.position.set(0, 1600, 2600)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05

    this.buildPreview()

    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
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
    if (this.running) return
    this.running = true
    const loop = () => {
      if (!this.running) return
      this.raf = requestAnimationFrame(loop)
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  dispose() {
    this.stop()
    this.ro.disconnect()
    this.controls.dispose()
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
