// 游戏主控：渲染循环、系统调度。后续交通、NPC 等系统都挂在这里，见 docs/02-architecture.md
import * as THREE from 'three/webgpu'
import { CameraRig, type ViewMode } from './actors/CameraRig.ts'
import { Input } from './actors/Input.ts'
import { NPCManager, type Talk } from './actors/NPCManager.ts'
import { Player, type PlayerWorld } from './actors/Player.ts'
import type { CityPackage, CultureDef } from './city.ts'
import { DevCamera } from './DevCamera.ts'
import { CollisionWorld } from './geo/CollisionWorld.ts'
import { createProjection, type Projection } from './geo/projection.ts'
import { LandmarkManager, type PlacedLandmark } from './landmarks/LandmarkManager.ts'
import { buildLife, lifeFootprints } from './life/kiosks.ts'
import { foodAvailable, newLife, recordLife, type LifeEvent, type LifeGain, type LifeProgress } from './life/progress.ts'
import { Album, newPhotoId } from './photo/album.ts'
import { previewCss, type PhotoFilter } from './photo/filters.ts'
import { PhotoSystem } from './photo/PhotoSystem.ts'
import type { InteractPoint } from './world/interact.ts'
import { InteractRegistry } from './world/interact.ts'
import { MetroSystem } from './metro/MetroSystem.ts'
import { TrainRenderer } from './metro/trains.ts'
import type { Route } from './metro/network.ts'
import { Sky } from './sky/Sky.ts'
import { Precipitation } from './sky/Precipitation.ts'
import { lookOf, mixLook, SEASON_NAMES, seasonOf, WEATHER_ICONS, WEATHER_NAMES, weatherAt, type Season, type WeatherKind, type WeatherLook } from './sky/weather.ts'
import { GameClock } from './state/clock.ts'
import { BoatSystem, type Pier, type Ride } from './transport/BoatSystem.ts'
import { InteriorManager, type InteriorResult, type StationStatus } from './interior/InteriorManager.ts'
import { DAILY_REWARD, dailyTasks, newProgress, recheck, record, type DailyTask, type ExitTarget, type Gain, type MetroEvent, type MetroProgress } from './metro/collection.ts'
import type { Announcement } from './interior/trip.ts'
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

/** 现实日期 YYYY-MM-DD（每日任务按它刷新） */
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  /** 附近可交互的点（地铁口、电梯）：提示文字和按钮文字 */
  prompt: { label: string; action: string } | null
  /** 已发现的景点数 / 总数 */
  found: number
  landmarks: number
  /** 坐船中：线名、开往哪里、还有几分钟（游戏时间）、开没开 */
  ride: { name: string; to: string; minutes: number; sailing: boolean } | null
  /** 在地铁站里：位置、站台两侧、车厢里的下一站 */
  station: StationStatus | null
  /** 最新报站（id 变了界面就弹出） */
  announce: (Announcement & { id: number }) | null
  /** 天气和季节：“⛅ 多云 · 秋” */
  weather: string
  /** 附近的路人数 */
  npcs: number
}

/** 拍照的结果，给界面显示 */
export interface PhotoResult {
  id: string
  /** 拍到的景点和子景点 */
  recognized: string[]
  /** 这张照片新解锁的图鉴 */
  newly: string[]
  thumb: Blob
  /** 存进相册了没有（隐私模式等情况下 IndexedDB 不可用） */
  saved: boolean
  /** 一起合影（摆姿势）的路人数 */
  people: number
}

/** 统计和界面状态的初始值 */
export const emptyStats = (): GameStats => ({ fps: 0, drawCalls: 0, triangles: 0, chunks: 0, pending: 0, buildAvg: 0, buildMax: 0, x: 0, z: 0, mode: 'player', view: 'third', district: null, time: '', money: 0, prompt: null, found: 0, landmarks: 0, ride: null, station: null, announce: null, weather: '', npcs: 0 })

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
  readonly stats: GameStats = emptyStats()
  readonly clock = new GameClock()
  readonly sky: Sky
  /** 季节（按设备真实日期，?season= 可以指定）和天气（每 4 个游戏小时换，?weather= 可以指定） */
  season: Season = seasonOf(new Date())
  weather: WeatherKind = 'sunny'
  /** 当前画面上的天气参数（切换时慢慢过渡） */
  weatherLook: WeatherLook = lookOf('sunny')
  private weatherOverride: WeatherKind | null = null
  private weatherCheck = 0
  private readonly precipitation = new Precipitation()
  readonly interact = new InteractRegistry()
  metro: MetroSystem | null = null
  trains: TrainRenderer | null = null
  landmarks: LandmarkManager | null = null
  /** 图鉴：拍到过的景点 / 子景点 → 第一张照片 id（发现记录在 landmarks.found） */
  codexShot: Record<string, string> = {}
  /** 走近新景点时调用（界面弹出“发现景点”） */
  onDiscover: ((p: PlacedLandmark) => void) | null = null
  boats: BoatSystem | null = null
  npcs: NPCManager | null = null
  /** 地铁站内（站厅、站台、车厢、换乘通道），独立场景 */
  interior: InteriorManager | null = null
  /** 地铁事件（进站、出站、乘车、换乘），界面和以后的成就系统用 */
  onMetro: ((e: MetroEvent) => void) | null = null
  /** 在站里时，城市里对应的位置（这个站的出入口）：存档、小地图用 */
  private cityAnchor: { x: number; z: number } | null = null
  /** 上车时自动从第三人称换成了第一人称，下车要换回来 */
  private carView = false
  /** 正在坐的船 */
  ride: Ride | null = null
  /** 下船时调用（界面提示到达） */
  onRideEnd: ((message: string) => void) | null = null
  photo: PhotoSystem | null = null
  /** 相册（IndexedDB）；打不开时为 null，照片不能保存 */
  album: Album | null = null
  /** 拍照模式和当前滤镜 */
  photoMode = false
  photoFilter: PhotoFilter
  money = NEW_GAME.money
  /** 地铁收集进度：到访车站、坐过的区间、成就、每日任务（metro/collection.ts） */
  metroProgress: MetroProgress = newProgress()
  /** 达成成就、点亮徽章、完成每日任务时调用（界面提示） */
  onProgress: ((g: Gain) => void) | null = null
  private exitTargets: ExitTarget[] | null = null
  /** 生活进度：美食、背包、文化图鉴、咖啡地图、Citywalk、任务（life/progress.ts） */
  life: LifeProgress = newLife()
  /** 第一次吃到美食、得到纪念品、解锁文化图鉴时调用（界面提示） */
  onLife: ((g: LifeGain) => void) | null = null
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
    const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x8a8170, 1.5)
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6)
    this.scene.add(hemi, sun)
    this.sky = new Sky(this.scene, sun, hemi)
    this.scene.add(this.precipitation.root)

    this.materials = createWorldMaterials()
    // 地面：跟着焦点移动的大平面，各图层贴在它上面；按最高画质的视距准备
    const size = QUALITY_PRESETS.high.viewDistance * 2 + CHUNK_SIZE * 4
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.materials.ground)
    this.ground.rotation.x = -Math.PI / 2
    this.scene.add(this.ground)

    this.input = new Input(this.renderer.domElement)
    this.photoFilter = city.config.photoFilters[0]!

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
    this.landmarks = new LandmarkManager(this.city.landmarks, this.proj, this.materials, this.collision, this.interact, (p, lb) => buildLife(this.city.content, p, lb))
    this.scene.add(this.landmarks.root)
    this.boats = new BoatSystem(this.city.boats, this.proj, world, this.materials, this.collision, this.interact)
    this.scene.add(this.boats.root)
    this.npcs = new NPCManager(this.city.people, world, this.collision, this.proj)
    this.npcs.setHotspots(this.landmarks.placed.map((p) => [p.x, p.z]))
    this.scene.add(this.npcs.root)
    this.photo = new PhotoSystem(this.renderer, this.camera, this.collision, this.landmarks)
    Album.open()
      .then((a) => (this.disposed ? a.close() : (this.album = a)))
      .catch((e) => console.warn('相册打不开，照片不能保存', e))
    this.chunks = new ChunkManager(
      {
        data: world,
        materials: this.materials,
        buildings: this.city.buildings,
        districts: this.districts,
        collision: this.collision,
        proj: this.proj,
        metro: metro.data,
        interact: this.interact,
        landmarks: [...this.landmarks.footprints, ...this.boats.footprints, ...lifeFootprints(this.city.content, this.landmarks.placed)],
        season: () => this.season
      },
      { radius: QUALITY_PRESETS[this.quality].viewDistance, budgetMs: 6 }
    )
    this.scene.add(this.chunks.root)
    this.interior = new InteriorManager(metro, this.clock)
    this.interior.onEvent = (e) => this.onMetroEvent(e)
    this.trains = new TrainRenderer(metro, this.materials.elevated)
    this.scene.add(this.trains.root)
    this.playerWorld = {
      boxes: (x0, z0, x1, z1) => this.collision.query(x0, z0, x1, z1),
      // 九曲桥、江边平台这类架在水上的平台也能走
      walkable: (x, z) => walkable(world, x, z, (px, pz) => this.collision.query(px - 0.01, pz - 0.01, px + 0.01, pz + 0.01).some((b) => b.deck))
    }

    const params = new URLSearchParams(location.search)
    this.persist = !['cam', 'walk', 'start'].some((k) => params.has(k))
    // 测试用：?season=winter 指定季节，?weather=rain 指定天气
    const season = params.get('season')
    if (season && season in SEASON_NAMES) this.season = season as Season
    const weather = params.get('weather')
    if (weather && weather in WEATHER_NAMES) this.weatherOverride = weather as WeatherKind
    const save = this.persist ? loadSave(localStorage, this.city.config.id) : null
    // 测试用：?time=17:45 指定游戏时刻（看高峰期的列车）
    const time = params.get('time')?.split(':').map(Number)
    if (time?.length === 2) this.clock.seconds = time[0]! * 3600 + time[1]! * 60
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
        this.metroProgress = structuredClone(save.metro)
        recheck(metro.data, this.metroProgress, this.clock.seconds)
        for (const [id, t] of Object.entries(save.codex.found)) this.landmarks.found.set(id, t)
        this.codexShot = { ...save.codex.shot }
        this.life = structuredClone(save.life)
      }
      this.route = (params.get('walk') ?? '')
        .split(';')
        .filter(Boolean)
        .map((p) => p.split(',').map(Number) as [number, number])
      this.autopilot.active = this.route.length > 0
    }

    this.landmarks.update(focus.x, focus.z)
    // 开局直接是当时的天气，不从晴天过渡
    this.weather = this.weatherOverride ?? weatherAt(new Date(), this.clock.seconds)
    this.weatherLook = lookOf(this.weather)
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
    this.sky.setFogRange(p.viewDistance * 0.55, p.viewDistance)
    this.camera.far = p.viewDistance * 1.3
    this.camera.updateProjectionMatrix()
    this.chunks?.setRadius(p.viewDistance)
    if (this.npcs) this.npcs.target = p.npcs
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
    // 从站厅的线路图快速到达：先离开站内场景
    if (this.interior?.active) this.exitInterior()
    const stations = metro.data.stations
    const dest = stations[route.to]!
    // 快速到达也按地铁事件记：进站、各段乘车、换乘、出站扣费（docs/04 第 8 节）
    const t0 = this.clock.seconds
    this.onMetroEvent({ type: 'metroEnter', station: route.from })
    route.legs.forEach((l, i) => {
      if (i) this.onMetroEvent({ type: 'metroTransfer', station: l.from, from: route.legs[i - 1]!.line, to: l.line })
      this.onMetroEvent({ type: 'metroRide', line: l.line, from: l.from, to: l.to, stations: l.stations, t0 })
    })
    this.clock.addMinutes(route.minutes + 4)
    this.onMetroEvent({ type: 'metroExit', station: route.to, exit: '', fare: route.fare, trip: { entry: route.from, legs: route.legs } })
    // 出口：编号最小的那个；没有出入口数据就在车站中心
    const exitIdx = [...dest.exits].sort((a, b) => metro.data.entrances[a]!.ref.localeCompare(metro.data.entrances[b]!.ref, 'zh', { numeric: true }))[0]
    const exit = exitIdx !== undefined ? metro.data.entrances[exitIdx]! : undefined
    if (exitIdx !== undefined) this.onMetroEvent({ type: 'metroLeave', station: route.to, entrance: exitIdx })
    const [x, z] = exit ? exit.pos : dest.pos
    // 先把玩家（也就是分块加载的焦点）挪到目的地：否则渲染循环还按旧位置加载分块，和预建互相卸载、永远建不完
    this.traveling = true
    this.player.pos.set(x, 0, z)
    this.landmarks?.update(x, z)
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

  /**
   * 观光电梯：淡出期间调用，把玩家放到电梯另一头，时钟推进 1 分钟。
   * 返回给界面的提示文字
   */
  rideElevator(p: InteractPoint): string {
    const t = p.target
    if (!t) return ''
    this.player.pos.set(t.x, t.y, t.z)
    this.player.vy = 0
    this.player.model.position.copy(this.player.pos)
    this.clock.addMinutes(1)
    this.prompt = null
    // 登上观光层：送纪念品
    if (t.y > 0 && p.landmark) this.lifeEvent({ type: 'auto', key: `deck:${p.landmark}` })
    this.saveNow()
    return p.arrive ?? ''
  }

  /**
   * 坐船：在码头泊位 berth 坐下一班。下一班还要等一会儿就快进时钟（界面淡出“等船”），
   * 然后站到船的顶层甲板上，船按时刻表开；到站自动下船
   */
  boardBoat(berth: Pier): TravelResult {
    const boats = this.boats
    if (!boats || this.ride) return { ok: false, message: '现在不能上船' }
    const line = berth.line
    if (this.money < line.fare) return { ok: false, message: `余额不足：船票 ${line.fare} 元，钱包里只有 ${this.money} 元` }
    const ride = boats.board(berth, this.clock.seconds)
    // 等船：快进到开船前半分钟
    const wait = ride.dep - this.clock.seconds
    if (wait > 60) this.clock.seconds = ride.dep - 30
    this.money -= line.fare
    this.ride = ride
    this.prompt = null
    this.saveNow()
    const to = line.kind === 'ferry' ? `开往${ride.to.name}` : '黄浦江往返'
    return { ok: true, message: `${line.name} · ${to} · ${line.fare} 元${wait > 60 ? ` · 等了 ${Math.round(wait / 60)} 分钟` : ''}` }
  }

  // 天气：每秒按日期和游戏时间算一次该是什么天气；画面参数约 8 秒过渡过去
  private updateWeather(dt: number, now: number) {
    if (now - this.weatherCheck > 1000 || !this.weatherCheck) {
      this.weatherCheck = now
      this.weather = this.weatherOverride ?? weatherAt(new Date(), this.clock.seconds)
    }
    this.weatherLook = mixLook(this.weatherLook, lookOf(this.weather), Math.min(1, dt * 0.25))
  }

  /** 和路人聊天：按天气、时间、在不在外滩陆家嘴挑一句 */
  talk(id: number): Talk | null {
    const p = this.player.pos
    const near = ['bund', 'orientalpearl'].some((k) => {
      const l = this.landmarks?.byId(k)
      return !!l && Math.hypot(l.x - p.x, l.z - p.z) < 450
    })
    const t = this.npcs?.talk(id, p.x, p.z, this.weather, this.clock.daySeconds / 3600, near) ?? null
    if (t) this.lifeEvent({ type: 'talk', speech: t.speech, npc: t.type })
    return t
  }

  /** 记一个生活事件；有新收获就通知界面并存档 */
  lifeEvent(e: LifeEvent): LifeGain {
    const g = recordLife(this.city.content, this.life, e, this.clock.seconds)
    if (g.foods.length || g.items.length || g.culture.length) {
      this.onLife?.(g)
      this.saveNow()
    }
    return g
  }

  /** 在小店买东西：美食当场吃掉记进美食图鉴，纪念品放进背包 */
  buy(shopId: string, itemId: string): TravelResult {
    const c = this.city.content
    const shop = c.shops.find((s) => s.id === shopId)
    const food = c.foods.find((f) => f.id === itemId)
    const gift = c.souvenirs.find((s) => s.id === itemId)
    const price = food?.price ?? gift?.price
    if (!shop?.items.includes(itemId) || price === undefined) return { ok: false, message: '这家店不卖这个' }
    if (food && !foodAvailable(food, new Date(), this.clock.daySeconds / 3600)) return { ok: false, message: `${food.name}现在不卖` }
    if (this.money < price) return { ok: false, message: `余额不足：${price} 元，钱包里只有 ${this.money} 元` }
    this.money -= price
    if (food) this.lifeEvent({ type: 'eat', food: food.id, shop: shop.id })
    else this.lifeEvent({ type: 'buy', item: itemId })
    this.clock.addMinutes(food ? 10 : 2)
    this.saveNow()
    return { ok: true, message: food ? `吃了${food.name} · ${price} 元` : `买了${gift!.name} · ${price} 元，放进背包` }
  }

  /** 读文化牌：第一次读解锁文化图鉴 */
  readPlaque(id: string): CultureDef | null {
    const c = this.city.content.culture.find((x) => x.id === id) ?? null
    if (c) this.lifeEvent({ type: 'plaque', culture: id })
    return c
  }

  /** 天气预报式的说法：“⛅ 多云 · 秋” */
  get weatherText() {
    return `${WEATHER_ICONS[this.weather]} ${WEATHER_NAMES[this.weather]} · ${SEASON_NAMES[this.season]}`
  }

  /** 从街上的地铁口进站：切到站厅场景，站在对应出口的楼梯下 */
  enterStation(station: number, entrance: number) {
    const it = this.interior
    if (!it || this.ride) return
    const e = this.metro!.data.entrances[entrance]
    this.cityAnchor = e ? { x: e.pos[0], z: e.pos[1] } : { x: this.player.pos.x, z: this.player.pos.z }
    this.placeInside(it.enter(station, entrance))
  }

  /** 站内操作（交互点的 go）：换场景就把玩家放到新场景的出生点；出站、打开线路图交给界面 */
  interiorAction(go: string): InteriorResult {
    const it = this.interior
    if (!it?.active) return {}
    const before = it.scene
    const r = it.handle(go, this.money)
    if (r.spawn) this.placeInside(r.spawn, it.scene !== before)
    // 换了车站（坐车到了别的站）就更新城市里的落脚点
    const st = it.station
    if (st !== null) {
      const s = this.metro!.data.stations[st]!
      const e = s.exits[0] !== undefined ? this.metro!.data.entrances[s.exits[0]]! : null
      this.cityAnchor = e ? { x: e.pos[0], z: e.pos[1] } : { x: s.pos[0], z: s.pos[1] }
    }
    return r
  }

  /** 从站厅的出口回到街上（可能已经坐车到了很远的站，先预建那里的分块） */
  async leaveStation(entrance: number, onProgress?: (text: string) => void): Promise<string> {
    const metro = this.metro
    if (!metro || !this.chunks || !this.playerWorld) return ''
    const e = metro.data.entrances[entrance]!
    const st = metro.data.stations[e.station]!
    this.exitInterior()
    this.onMetroEvent({ type: 'metroLeave', station: e.station, entrance })
    const [x, z] = e.pos
    this.traveling = true
    this.player.pos.set(x, 0, z)
    try {
      await this.chunks.prebuild(x, z, (d, t) => onProgress?.(`出站 ${d}/${t}`))
      this.landmarks?.update(x, z)
      this.player.spawn(x, z, this.playerWorld)
      this.player.model.position.copy(this.player.pos)
    } finally {
      this.traveling = false
    }
    this.saveNow()
    return `${st.name}站 ${e.ref ? `${e.ref} 号口` : ''}出站`
  }

  /** 玩家在城市地图上的位置（在地铁站里时是这个站的出入口） */
  get mapPos(): { x: number; z: number } {
    return this.cityAnchor ?? this.player.pos
  }

  private exitInterior() {
    if (this.carView) {
      this.carView = false
      this.rig.mode = 'third'
      this.rig.pitch = 0.3
    }
    this.interior?.leave()
    this.scene.add(this.player.model)
    this.cityAnchor = null
    this.prompt = null
  }

  private placeInside(s: { x: number; z: number; facing: number }, turn = true) {
    const it = this.interior!
    it.scene!.scene.add(this.player.model)
    this.player.spawn(s.x, s.z, it.world)
    this.player.model.position.copy(this.player.pos)
    if (turn) {
      this.player.facing = this.player.model.rotation.y = s.facing
      this.rig.yaw = s.facing
      // 车厢很窄，第三人称的相机会贴在墙上：上车自动换第一人称，下车换回来
      const inCar = it.place?.kind === 'car'
      if (inCar && this.rig.mode === 'third') {
        this.carView = true
        this.rig.mode = 'first'
        this.rig.pitch = 0
      } else if (!inCar && this.carView) {
        this.carView = false
        this.rig.mode = 'third'
        this.rig.pitch = 0.3
      }
    }
    this.prompt = null
  }

  // 地铁事件：出站扣费，记到访车站、区间、成就、每日任务（docs/04 第 8 节）；每日任务完成给奖励
  private onMetroEvent(e: MetroEvent) {
    if (e.type === 'metroExit') this.money -= e.fare
    const gain = record(this.metro!.data, this.metroProgress, e, this.clock.seconds, today(), this.dailyTasks())
    this.money += gain.daily.length * DAILY_REWARD
    // 第一次坐地铁、坐磁浮：送纪念票卡
    if (e.type === 'metroRide') this.lifeEvent({ type: 'auto', key: e.line === 'LMG' ? 'maglev' : 'metro' })
    this.onMetro?.(e)
    if (gain.achievements.length || gain.badges.length || gain.daily.length) this.onProgress?.(gain)
    this.saveNow()
  }

  /** 今天的每日任务（“从指定出口出站去某个景点”在离景点最近的出入口里按日期挑一个） */
  dailyTasks(): DailyTask[] {
    const metro = this.metro
    if (!metro || !this.landmarks) return []
    this.exitTargets ??= this.landmarks.placed.flatMap((p) => {
      let best = -1
      let bestD = 300
      metro.data.entrances.forEach((e, i) => {
        const d = Math.hypot(e.pos[0] - p.x, e.pos[1] - p.z)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      return best < 0 ? [] : [{ landmark: p.def.name, entrance: best }]
    })
    return dailyTasks(metro.data, today(), this.exitTargets)
  }

  /** 坐船时跳过航程：时钟直接到靠岸 */
  skipRide() {
    if (this.ride) this.clock.seconds = Math.max(this.clock.seconds, this.ride.arrive)
  }

  // 坐船：玩家跟着船走，到站下船
  private updateRide(ride: Ride) {
    const t = this.clock.seconds
    if (t >= ride.arrive + 5) {
      this.ride = null
      const [x, z] = ride.to.land
      this.player.spawn(x, z, this.playerWorld!)
      this.player.model.position.copy(this.player.pos)
      if (ride.line.kind !== 'ferry') this.lifeEvent({ type: 'auto', key: 'cruise' })
      this.saveNow()
      this.onRideEnd?.(ride.line.kind === 'ferry' ? `到达 ${ride.to.name}` : `${ride.line.name}结束，回到${ride.to.name}`)
      return
    }
    const s = this.boats!.seat(ride, t)
    this.player.pos.set(s.x, s.y, s.z)
    this.player.vy = 0
    this.player.model.position.copy(this.player.pos)
    // 面朝船头；自拍时转向镜头
    this.player.facing = this.rig.selfie ? this.rig.yaw : -s.angle - Math.PI / 2
    this.player.model.rotation.y = this.player.facing
  }

  /** 景点或子景点的名字 */
  landmarkName(id: string): string {
    for (const p of this.landmarks?.placed ?? []) {
      if (p.def.id === id) return p.def.name
      const s = p.def.subs?.find((s) => s.id === id)
      if (s) return s.name
    }
    return id
  }

  /** 进出拍照模式：空格变成快门，V 键多一个自拍视角；退出时取消滤镜预览 */
  setPhotoMode(on: boolean) {
    this.photoMode = on
    this.rig.photo = on
    this.input.jumpLocked = on
    if (!on) {
      this.rig.selfie = false
      this.input.moveLocked = false
      this.setPhotoFilter(this.city.config.photoFilters[0]!)
    }
  }

  /** 换滤镜：取景画面用 CSS filter 近似；像素风降低渲染分辨率再放大 */
  setPhotoFilter(f: PhotoFilter) {
    this.photoFilter = f
    const canvas = this.renderer.domElement
    canvas.style.filter = previewCss(f.params) === 'none' ? '' : previewCss(f.params)
    const px = f.params.pixel
    canvas.style.imageRendering = px ? 'pixelated' : ''
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[this.quality].pixelRatio)
    this.renderer.setPixelRatio(px ? px / Math.max(1, this.container.clientWidth) : dpr)
    this.resize()
  }

  /** 按快门：取图、识别景点、存相册、解锁图鉴 */
  async takePhoto(): Promise<PhotoResult> {
    if (!this.photo || !this.landmarks) throw new Error('还没加载完')
    const district = this.districts?.at(this.player.pos.x, this.player.pos.z)?.id
    const place = (district && this.city.config.districts[district]?.name) ?? ''
    const time = this.clock.format()
    const inside = this.interior?.active ? this.interior.status()?.where.split(' · ')[0] : null
    const people = inside ? 0 : (this.npcs?.posingNear(this.player.pos.x, this.player.pos.z) ?? 0)
    const shot = await this.photo.shoot(
      this.photoFilter,
      (names) => [this.city.config.name, names.slice(0, 3).join('、') || inside || place, time].filter(Boolean).join(' · '),
      (id) => this.landmarkName(id),
      !inside
    )
    const id = newPhotoId()
    let saved = false
    if (this.album) {
      try {
        await this.album.add({
          id,
          city: this.city.config.id,
          takenAt: new Date().toISOString(),
          gameTime: this.clock.seconds,
          filter: this.photoFilter.id,
          landmarks: shot.recognized,
          width: shot.width,
          height: shot.height,
          thumb: shot.thumb,
          image: shot.image
        })
        saved = true
      } catch (e) {
        console.warn('照片保存失败', e)
      }
    }
    // 拍到就算发现；第一次拍到解锁图鉴
    const newly: string[] = []
    for (const lid of shot.recognized) {
      if (this.landmarks.byId(lid) && !this.landmarks.found.has(lid)) this.landmarks.found.set(lid, this.clock.seconds)
      if (!this.codexShot[lid]) {
        this.codexShot[lid] = id
        newly.push(lid)
      }
    }
    this.lifeEvent({ type: 'photo', filter: this.photoFilter.id, recognized: inside ? [] : shot.recognized, people })
    this.saveNow()
    return { id, recognized: shot.recognized, newly, thumb: shot.thumb, saved, people }
  }

  /** 立即存档（玩家模式且不是测试参数时） */
  saveNow() {
    if (!this.persist || this.devCamera || !this.world) return
    // 坐船时存下船的码头，读档不会掉进江里
    // 在地铁站里存出入口的位置
    const p = this.ride ? { x: this.ride.to.land[0], y: 0, z: this.ride.to.land[1] } : this.cityAnchor ? { ...this.cityAnchor, y: 0 } : this.player.pos
    const r = this.rig
    writeSave(localStorage, {
      city: this.city.config.id,
      player: { x: p.x, y: p.y, z: p.z, facing: this.player.facing },
      camera: { yaw: r.yaw, pitch: r.pitch, distance: r.distance, mode: r.mode },
      settings: { quality: this.quality },
      time: this.clock.seconds,
      money: this.money,
      metro: this.metroProgress,
      codex: { found: Object.fromEntries(this.landmarks?.found ?? []), shot: this.codexShot },
      life: this.life
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
    // 乘地铁时时钟由站内流程按真实运行分钟推进
    if (!this.interior?.timeControlled) this.clock.tick(dt)
    this.updateWeather(dt, now)
    this.sky.update(this.clock.daySeconds, this.weatherLook)
    const it = this.interior
    if (it?.active && !this.devCamera) {
      // 站内：城市场景暂停更新，只渲染站内场景
      this.updatePlayer(dt, now)
      it.update(dt)
      if (it.scene) this.renderer.render(it.scene.scene, this.camera)
      this.photo?.afterRender()
      this.afterRender?.()
      this.updateStats(now, this.cityAnchor ?? this.player.pos)
      if (now - this.savedAt > AUTOSAVE_MS) {
        this.savedAt = now
        this.saveNow()
      }
      return
    }
    const f = this.devCamera ? this.updateDev(dt) : this.updatePlayer(dt, now)
    this.chunks?.update(f.x, f.z)
    this.landmarks?.update(f.x, f.z, this.camera.position.x, this.camera.position.z)
    this.trains?.update(this.clock.seconds, f.x, f.z, QUALITY_PRESETS[this.quality].viewDistance)
    this.precipitation.update(dt, this.camera.position, this.weatherLook)
    if (this.npcs && !this.devCamera && !this.traveling) {
      const d = new Date()
      this.npcs.target = QUALITY_PRESETS[this.quality].npcs
      // 拍照模式：附近的人看镜头摆姿势
      this.npcs.pose(this.photoMode ? this.camera.position : null, f.x, f.z)
      this.npcs.update(dt, f.x, f.z, this.clock.daySeconds / 3600, this.weather, this.weatherLook, d.getDay() === 0 || d.getDay() === 6)
    }
    this.boats?.update(this.clock.seconds, f.x, f.z, QUALITY_PRESETS[this.quality].viewDistance)
    // 地面平面按分块对齐跟随
    this.ground.position.set(Math.round(f.x / CHUNK_SIZE) * CHUNK_SIZE, 0, Math.round(f.z / CHUNK_SIZE) * CHUNK_SIZE)
    this.renderer.render(this.scene, this.camera)
    this.photo?.afterRender()
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
    const inside = this.interior?.active ? this.interior : null
    const world = inside ? inside.world : this.playerWorld
    if (!world || this.traveling) return this.player.pos
    if (this.ride) {
      this.updateRide(this.ride)
      this.input.consumeJump()
      this.input.consumeInteract()
      this.rig.update(this.camera, this.player, this.input, world)
      return this.player.pos
    }
    const a = this.input.axes()
    const { fx, fz, rx, rz } = this.rig.basis()
    let move = { dx: fx * a.y + rx * a.x, dz: fz * a.y + rz * a.x, run: this.input.running }
    if (this.autopilot.active) move = this.steer(now)
    this.player.update(dt, { ...move, jump: this.input.consumeJump() }, world)
    this.input.moveLocked = this.rig.selfie
    this.rig.update(this.camera, this.player, this.input, world)
    const p = this.player.pos
    this.prompt = (inside ? inside.scene!.interact : this.interact).nearest(p.x, p.z, p.y)
    // 没有别的交互时，身边的路人可以聊天
    if (!this.prompt && !inside && p.y < 1) {
      const n = this.npcs?.nearest(p.x, p.z)
      if (n) this.prompt = { x: p.x, z: p.z, r: 2.4, label: n.name, action: '聊天', kind: 'npc', npc: n.id }
    }
    if (this.input.consumeInteract() && this.prompt) this.onInteract?.(this.prompt)
    if (inside) return p
    const found = this.landmarks?.discover(p.x, p.z, this.clock.seconds)
    if (found) {
      this.onDiscover?.(found)
      this.saveNow()
    }
    return p
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
      prompt: this.prompt ? { label: this.prompt.label, action: this.prompt.action } : null,
      found: this.landmarks?.found.size ?? 0,
      landmarks: this.landmarks?.placed.length ?? 0,
      station: this.interior?.status() ?? null,
      weather: this.weatherText,
      npcs: this.npcs?.count ?? 0,
      announce: this.interior?.announcement ?? null,
      ride: this.ride
        ? {
            name: this.ride.line.name,
            to: this.ride.line.kind === 'ferry' ? `开往${this.ride.to.name}` : `回到${this.ride.to.name}`,
            minutes: Math.max(0, Math.ceil((this.ride.arrive - this.clock.seconds) / 60)),
            sailing: this.clock.seconds >= this.ride.dep
          }
        : null
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
    this.trains?.dispose()
    this.landmarks?.dispose()
    this.boats?.dispose()
    this.precipitation.dispose()
    this.npcs?.dispose()
    this.interior?.dispose()
    this.album?.close()
    this.player.dispose()
    this.ground.geometry.dispose()
    this.materials.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
