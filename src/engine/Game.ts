// 游戏主控：渲染循环、系统调度。后续交通、NPC 等系统都挂在这里，见 docs/02-architecture.md
import * as THREE from 'three/webgpu'
import { CameraRig, type ViewMode } from './actors/CameraRig.ts'
import { Input } from './actors/Input.ts'
import { Player, type PlayerWorld } from './actors/Player.ts'
import type { CityPackage } from './city.ts'
import { DevCamera } from './DevCamera.ts'
import { CollisionWorld } from './geo/CollisionWorld.ts'
import { createProjection, type Projection } from './geo/projection.ts'
import type { InteractPoint } from './world/interact.ts'
import { InteractRegistry } from './world/interact.ts'
import { MetroSystem } from './metro/MetroSystem.ts'
import type { Route } from './metro/network.ts'
import { GameClock } from './state/clock.ts'
import { ChunkManager } from './world/ChunkManager.ts'
import { CHUNK_SIZE } from './world/chunks.ts'
import { DistrictIndex } from './world/districts.ts'
import { defaultQuality, QUALITY_PRESETS, type QualityLevel } from './quality.ts'
import { loadSave, NEW_GAME, writeSave } from './state/save.ts'
import { createWorldMaterials, type WorldMaterials } from './world/materials.ts'
import { walkable } from './world/queries.ts'
import { WorldData } from './world/WorldData.ts'

export { CHUNK_SIZE }

export type RenderBackend = 'WebGPU' | 'WebGL 2'

const SKY = 0x9cc4e4
/** 自动存档间隔（毫秒） */
const AUTOSAVE_MS = 10_000

export interface GameStats {
  fps: number
  drawCalls: number
  triangles: number
  chunks: number
  pending: number
  /** 最近建块的平均 / 最大耗时（毫秒） */
  buildAvg: number
  buildMax: number
  x: number
  z: number
  /** 玩家模式还是开发相机 */
  mode: 'player' | 'dev'
  view: ViewMode
  /** 所在区 id；市界外为 null */
  district: string | null
  /** 游戏时刻“08:30” */
  time: string
  money: number
  /** 附近可交互的点（地铁口）：提示文字和按钮文字 */
  prompt: { label: string; action: string } | null
}

/** 快速到达的结果，给界面提示用 */
export interface TravelResult {
  ok: boolean
  message: string
}

export class Game {
  readonly container: HTMLElement
  readonly city: CityPackage
  readonly proj: Projection
  readonly renderer: THREE.WebGPURenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1500)
  readonly collision = new CollisionWorld()
  readonly input: Input
  readonly player = new Player()
  readonly rig = new CameraRig()
  quality: QualityLevel = defaultQuality()
  /** 每帧渲染之后调用（调试面板的帧率统计用） */
  afterRender: (() => void) | null = null
  devCamera: DevCamera | null = null
  districts: DistrictIndex | null = null
  world: WorldData | null = null
  readonly stats: GameStats = { fps: 0, drawCalls: 0, triangles: 0, chunks: 0, pending: 0, buildAvg: 0, buildMax: 0, x: 0, z: 0, mode: 'player', view: 'third', district: null, time: '', money: 0, prompt: null }
  readonly clock = new GameClock()
  readonly interact = new InteractRegistry()
  metro: MetroSystem | null = null
  money = NEW_GAME.money
  readonly metroStats = { rides: 0, visited: new Set<string>() }
  /** 附近的交互点 */
  prompt: InteractPoint | null = null
  /** 按 E / 点按钮触发交互时调用（界面打开地铁面板） */
  onInteract: ((p: InteractPoint) => void) | null = null
  /** 乘车中：加载焦点已经移到目的地，暂停玩家的物理和交互 */
  private traveling = false
  private readonly ro: ResizeObserver
  private readonly materials: WorldMaterials
  private readonly ground: THREE.Mesh
  private chunks: ChunkManager | null = null
  private playerWorld: PlayerWorld | null = null
  private disposed = false
  private last = 0
  private frames = 0
  private statsAt = 0
  /** 测试用：开发相机自动平移速度（格/秒），?fly=vx,vz */
  private fly: [number, number] | null = null
  /** 测试用：玩家按路点自动跑，?walk=x,z;x,z */
  private route: [number, number][] = []
  /** 自动跑的进度，供截图脚本读取 */
  readonly autopilot = { active: false, done: false, stuck: false, waypoint: 0 }
  private stuckCheck = { t: 0, x: 0, z: 0 }
  /** 是否读写存档：测试参数（cam / walk / start）下不读不写，保证结果可复现 */
  private persist = false
  private savedAt = 0
  private readonly onHide = () => {
    if (document.visibilityState === 'hidden') this.saveNow()
  }
  private readonly onPageHide = () => this.saveNow()
  private detour = { until: 0, side: 1, t: 0, x: 0, z: 0 }

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
    this.scene.fog = new THREE.Fog(SKY, 500, 1000)
    this.scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x8a8170, 1.5))
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6)
    sun.position.set(-400, 900, 500)
    this.scene.add(sun)

    this.materials = createWorldMaterials()
    // 地面：跟着焦点移动的大平面，各图层贴在它上面；按最高画质的视距准备
    const size = QUALITY_PRESETS.high.viewDistance * 2 + CHUNK_SIZE * 4
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.materials.ground)
    this.ground.rotation.x = -Math.PI / 2
    this.scene.add(this.ground)

    this.input = new Input(this.renderer.domElement)

    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
  }

  /**
   * 初始化：渲染器（探测 WebGPU，拿不到就切到 WebGL 2）→ 加载地图数据 → 预建周围的分块 → 放置玩家。
   * onProgress 用于加载界面
   */
  async init(onProgress?: (text: string) => void): Promise<RenderBackend> {
    await this.renderer.init()
    onProgress?.('加载地图数据…')
    const [world, metro] = await Promise.all([WorldData.load(this.city.data, (d, t) => onProgress?.(`加载地图数据 ${d}/${t}`)), MetroSystem.load(this.city.data.metro)])
    if (this.disposed) return this.backend
    this.world = world
    this.metro = metro
    this.districts = new DistrictIndex(world.districts)
    this.chunks = new ChunkManager(
      { data: world, materials: this.materials, buildings: this.city.buildings, districts: this.districts, collision: this.collision, proj: this.proj, metro: metro.data, interact: this.interact },
      { radius: QUALITY_PRESETS[this.quality].viewDistance, budgetMs: 6 }
    )
    this.scene.add(this.chunks.root)
    this.playerWorld = {
      boxes: (x0, z0, x1, z1) => this.collision.query(x0, z0, x1, z1),
      walkable: (x, z) => walkable(world, x, z)
    }

    const params = new URLSearchParams(location.search)
    this.persist = !['cam', 'walk', 'start'].some((k) => params.has(k))
    const save = this.persist ? loadSave(localStorage, this.city.config.id) : null
    const q = params.get('quality')
    this.setQuality(q === 'low' || q === 'mid' || q === 'high' ? q : (save?.settings.quality ?? this.quality))
    if (params.get('reflect') === '1') this.materials.setReflection(true, this.scene)
    const spawn = this.city.spawns[0]!
    const { x, z } = this.proj.project(spawn.lat, spawn.lon)
    const nums = (s: string | null) => s?.split(',').map(Number) ?? null
    const cam = nums(params.get('cam'))
    let focus: { x: number; z: number }

    if (cam?.length === 3) {
      // 开发相机（截图检查用）：?cam=x,y,z&at=x,y,z
      this.stats.mode = 'dev'
      this.devCamera = new DevCamera(this.camera, this.renderer.domElement)
      const at = nums(params.get('at')) ?? [x, 0, z]
      this.devCamera.set({ x: cam[0]!, y: cam[1]!, z: cam[2]! }, { x: at[0]!, y: at[1]!, z: at[2]! })
      const fly = nums(params.get('fly'))
      if (fly?.length === 2) this.fly = [fly[0]!, fly[1]!]
      focus = this.devCamera.focus
    } else {
      // 玩家模式：有存档从存档位置继续；?start=x,z 指定出生位置（测试用）
      const start = nums(params.get('start'))
      focus = start?.length === 2 ? { x: start[0]!, z: start[1]! } : save ? { x: save.player.x, z: save.player.z } : { x, z }
      this.scene.add(this.player.model)
      this.rig.yaw = -Math.PI / 2 // 面朝东（外滩方向）
      if (save) {
        Object.assign(this.rig, save.camera)
        this.clock.seconds = save.time
        this.money = save.money
        this.metroStats.rides = save.metro.rides
        this.metroStats.visited = new Set(save.metro.visited)
      }
      this.route = (params.get('walk') ?? '')
        .split(';')
        .filter(Boolean)
        .map((p) => p.split(',').map(Number) as [number, number])
      this.autopilot.active = this.route.length > 0
    }

    await this.chunks.prebuild(focus.x, focus.z, (d, t) => onProgress?.(`生成城市 ${d}/${t}`))
    // 碰撞盒随分块建好以后再放人，被占着就找最近的空位
    if (!this.devCamera) {
      this.player.spawn(focus.x, focus.z, this.playerWorld)
      // 人和相机朝同一方向
      this.player.facing = this.player.model.rotation.y = this.rig.yaw
      if (this.persist) {
        addEventListener('visibilitychange', this.onHide)
        addEventListener('pagehide', this.onPageHide)
      }
    }
    if (params.get('debug') === '1') void import('./debug.ts').then((m) => m.attachDebug(this))
    return this.backend
  }

  /** 切换画质：视距（分块半径、雾、远裁剪面）、渲染分辨率、水面倒影 */
  setQuality(level: QualityLevel) {
    const p = QUALITY_PRESETS[level]
    this.quality = level
    const fog = this.scene.fog as THREE.Fog
    fog.near = p.viewDistance * 0.55
    fog.far = p.viewDistance
    this.camera.far = p.viewDistance * 1.3
    this.camera.updateProjectionMatrix()
    this.chunks?.setRadius(p.viewDistance)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio))
    this.materials.setReflection(p.reflection, this.scene)
    this.resize()
  }

  /**
   * 快速到达（地铁第 1 层，docs/04 第 5 节）：扣票价，按路线的真实运行分钟推进时钟（另加进出站各 2 分钟），
   * 记到访车站，然后在目的站的一个出口出站。onProgress 用于加载界面
   */
  async fastTravel(route: Route, onProgress?: (text: string) => void): Promise<TravelResult> {
    const metro = this.metro
    if (!metro || !this.playerWorld || !this.chunks) return { ok: false, message: '地铁还没准备好' }
    if (this.money < route.fare) return { ok: false, message: `余额不足：票价 ${route.fare} 元，钱包里只有 ${this.money} 元` }
    const stations = metro.data.stations
    const dest = stations[route.to]!
    this.money -= route.fare
    this.clock.addMinutes(route.minutes + 4)
    this.metroStats.rides++
    // 进站、出站、换乘的车站都算到访（docs/04 第 8 节）
    for (const l of route.legs) {
      this.metroStats.visited.add(stations[l.from]!.id)
      this.metroStats.visited.add(stations[l.to]!.id)
    }
    // 出口：编号最小的那个；没有出入口数据就在车站中心
    const exits = dest.exits.map((i) => metro.data.entrances[i]!).sort((a, b) => a.ref.localeCompare(b.ref, 'zh', { numeric: true }))
    const exit = exits[0]
    const [x, z] = exit ? exit.pos : dest.pos
    // 先把玩家（也就是分块加载的焦点）挪到目的地：否则渲染循环还按旧位置加载分块，和预建互相卸载、永远建不完
    this.traveling = true
    this.player.pos.set(x, 0, z)
    try {
      await this.chunks.prebuild(x, z, (d, t) => onProgress?.(`前往 ${dest.name}站 ${d}/${t}`))
      this.player.spawn(x, z, this.playerWorld)
      this.player.model.position.copy(this.player.pos)
    } finally {
      this.traveling = false
    }
    this.saveNow()
    const exitName = exit?.ref ? ` ${exit.ref} 号口` : ''
    return { ok: true, message: `到达 ${dest.name}站${exitName} · 用时 ${Math.round(route.minutes)} 分钟 · ${route.fare} 元` }
  }

  /** 立即存档（玩家模式且不是测试参数时） */
  saveNow() {
    if (!this.persist || this.devCamera || !this.world) return
    const p = this.player.pos
    const r = this.rig
    writeSave(localStorage, {
      city: this.city.config.id,
      player: { x: p.x, y: p.y, z: p.z, facing: this.player.facing },
      camera: { yaw: r.yaw, pitch: r.pitch, distance: r.distance, mode: r.mode },
      settings: { quality: this.quality },
      time: this.clock.seconds,
      money: this.money,
      metro: { rides: this.metroStats.rides, visited: [...this.metroStats.visited] }
    })
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
    this.clock.tick(dt)
    const f = this.devCamera ? this.updateDev(dt) : this.updatePlayer(dt, now)
    this.chunks?.update(f.x, f.z)
    // 地面平面按分块对齐跟随
    this.ground.position.set(Math.round(f.x / CHUNK_SIZE) * CHUNK_SIZE, 0, Math.round(f.z / CHUNK_SIZE) * CHUNK_SIZE)
    this.renderer.render(this.scene, this.camera)
    this.afterRender?.()
    this.updateStats(now, f)
    if (now - this.savedAt > AUTOSAVE_MS) {
      this.savedAt = now
      this.saveNow()
    }
  }

  private updateDev(dt: number) {
    const dev = this.devCamera!
    if (this.fly) {
      const [vx, vz] = this.fly
      this.camera.position.x += vx * dt
      this.camera.position.z += vz * dt
      dev.focus.x += vx * dt
      dev.focus.z += vz * dt
    }
    dev.update(dt)
    return dev.focus
  }

  private updatePlayer(dt: number, now: number) {
    const world = this.playerWorld
    if (!world || this.traveling) return this.player.pos
    const a = this.input.axes()
    const { fx, fz, rx, rz } = this.rig.basis()
    let move = { dx: fx * a.y + rx * a.x, dz: fz * a.y + rz * a.x, run: this.input.running }
    if (this.autopilot.active) move = this.steer(now)
    this.player.update(dt, { ...move, jump: this.input.consumeJump() }, world)
    this.rig.update(this.camera, this.player, this.input, world)
    this.prompt = this.interact.nearest(this.player.pos.x, this.player.pos.z)
    if (this.input.consumeInteract() && this.prompt) this.onInteract?.(this.prompt)
    return this.player.pos
  }

  // 自动跑：朝当前路点直线前进，被树干、桥墩挡住时横移绕开；到了换下一个；3 秒没挪动算卡住
  private steer(now: number) {
    const ap = this.autopilot
    const p = this.player.pos
    const target = this.route[ap.waypoint]
    if (!target) {
      ap.active = false
      ap.done = true
      return { dx: 0, dz: 0, run: false }
    }
    const tx = target[0] - p.x
    const tz = target[1] - p.z
    const d = Math.hypot(tx, tz)
    if (d < 2) ap.waypoint++
    if (now - this.stuckCheck.t > 3000) {
      if (this.stuckCheck.t && Math.hypot(p.x - this.stuckCheck.x, p.z - this.stuckCheck.z) < 0.5) {
        ap.stuck = true
        ap.active = false
      }
      this.stuckCheck = { t: now, x: p.x, z: p.z }
    }
    this.rig.yaw = Math.atan2(-tx, -tz)
    let dx = tx / (d || 1)
    let dz = tz / (d || 1)
    const dt = this.detour
    if (now - dt.t > 400) {
      // 0.4 秒内几乎没前进：开始横移，左右交替
      if (Math.hypot(p.x - dt.x, p.z - dt.z) < 0.6 && now > dt.until) {
        dt.side = -dt.side
        dt.until = now + 700
      }
      dt.t = now
      dt.x = p.x
      dt.z = p.z
    }
    if (now < dt.until) [dx, dz] = [-dz * dt.side, dx * dt.side]
    return { dx, dz, run: true }
  }

  private updateStats(now: number, f: { x: number; z: number }) {
    this.frames++
    if (now - this.statsAt < 500) return
    const info = this.renderer.info.render
    const ms = this.chunks?.buildMs ?? []
    Object.assign(this.stats, {
      buildAvg: ms.length ? +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1) : 0,
      buildMax: ms.length ? +Math.max(...ms).toFixed(1) : 0,
      fps: Math.round((this.frames * 1000) / (now - this.statsAt)),
      drawCalls: info.drawCalls,
      triangles: info.triangles,
      chunks: this.chunks?.loadedCount ?? 0,
      pending: this.chunks?.pendingCount ?? 0,
      x: Math.round(f.x),
      z: Math.round(f.z),
      view: this.rig.mode,
      district: this.districts?.at(f.x, f.z)?.id ?? null,
      time: this.clock.format(),
      money: this.money,
      prompt: this.prompt ? { label: this.prompt.label, action: this.prompt.action } : null
    })
    this.frames = 0
    this.statsAt = now
  }

  stop() {
    this.renderer.setAnimationLoop(null)
  }

  dispose() {
    this.saveNow()
    this.disposed = true
    removeEventListener('visibilitychange', this.onHide)
    removeEventListener('pagehide', this.onPageHide)
    this.stop()
    this.ro.disconnect()
    this.input.dispose()
    this.devCamera?.dispose()
    this.chunks?.dispose()
    this.player.dispose()
    this.ground.geometry.dispose()
    this.materials.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
