// 城市包契约（类型）。由引擎定义，城市包按它实现；引擎不 import 任何具体城市。
// 字段说明见 docs/02-architecture.md「城市包契约」，后续阶段的字段（buildingProfiles 等）到时再加。
import type { Builder } from './build/Builder.ts'
import type { Rng } from './build/random.ts'
import type { LatLon, ProjectionConfig } from './geo/projection.ts'
import type { PhotoFilter } from './photo/filters.ts'
import type { Season, WeatherKind } from './sky/weather.ts'
import type { Lot } from './world/lots.ts'
import type { WorldDataUrls } from './world/WorldData.ts'

export interface DistrictConfig {
  name: string
  /** 地图底色（占位） */
  color: string
  /** 区域任务主题 */
  theme: string
}

export interface CityConfig {
  id: string
  name: string
  nameEn: string
  projection: ProjectionConfig
  /** 三套尺度，见 docs/03-coordinates-and-data.md */
  scale: {
    mapMetersPerUnit: number
    buildingMetersPerUnit: number
    actorMetersPerUnit: number
  }
  osm: {
    bbox: [south: number, west: number, north: number, east: number]
  }
  districts: Record<string, DistrictConfig>
  /** 摄影滤镜，第一个是原片（P3） */
  photoFilters: PhotoFilter[]
}

export interface SpawnPoint extends LatLon {
  id: string
  name: string
}

/** 地块或行道树所在位置的信息，城市包据此决定盖什么、种什么 */
export interface Place extends LatLon {
  /** 所在区 id；市界外为 null */
  district: string | null
  /** 离城市原点的真实距离（km） */
  distKm: number
}

/** 在地块上盖一组建筑；坐标是游戏格，高度按建筑尺度（docs/03 第 3 节）。season 给院子里的树换季 */
export type BuildingStyle = (b: Builder, lot: Lot, rng: Rng, season: Season) => void
/** 在 (x, z) 种一棵树（人物尺度）；按季节换颜色、冬天落叶。随机数的消耗不能随季节变，换季不改布局 */
export type TreeStyle = (b: Builder, x: number, z: number, rng: Rng, season: Season) => void

/** 程序化建筑和行道树（docs/05 第 3 节） */
export interface CityBuildings {
  /** 某处地块的建筑风格权重（风格 id → 权重）；null 表示不盖（如市界外） */
  mixAt(place: Place): Record<string, number> | null
  styles: Record<string, BuildingStyle>
  /** 某处行道树的树种权重；null 表示不种 */
  treeMixAt(place: Place): Record<string, number> | null
  trees: Record<string, TreeStyle>
  /** 行道树间距（格） */
  treeSpacing: number
}

/** 景点部件的选项 */
export interface PartOptions {
  /** 景观灯：白天普通颜色，18:30–22:00 发光 */
  light?: boolean
  glass?: boolean
  windows?: number
  top?: number
  collide?: boolean | 'camera'
}

/**
 * 景点建模上下文（docs/02 第 4 节“景点定义”）。坐标是景点的局部坐标（格）：x 沿景点朝向 rot，z 是它的横向，
 * y 向上（建筑尺度）。引擎负责换算到世界坐标、合并网格、登记碰撞和交互
 */
export interface LandmarkContext {
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, o?: PartOptions): void
  /** 以 (cx, cz) 为中心、宽 w 深 d 的板块，可以额外绕中心转 twist 弧度（扭转塔身） */
  slab(cx: number, cz: number, w: number, d: number, y0: number, y1: number, color: number, twist?: number, o?: PartOptions): void
  /** 方块拼的球 */
  ball(cx: number, cy: number, cz: number, r: number, color: number, o?: PartOptions): void
  /** 八角柱（两个错开 45° 的方柱） */
  column(cx: number, cz: number, r: number, y0: number, y1: number, color: number, o?: PartOptions): void
  /** 可站立的平台（不渲染，只登记碰撞）：顶面在 y；水面上也能走 */
  platform(x0: number, z0: number, x1: number, z1: number, y: number): void
  /** 观光电梯：在 (x, z) 按 E 上到 (tx, ty, tz)，在顶上按 E 回来；deck 是观光层的名字（“263 米观光层”） */
  elevator(x: number, z: number, tx: number, ty: number, tz: number, deck: string): void
  /** 经纬度 → 本景点的局部坐标（用 OSM 坐标摆放附属建筑） */
  local(lat: number, lon: number): [number, number]
}

export interface LandmarkSub {
  id: string
  name: string
  /** 拍照识别的瞄准点（局部坐标） */
  x: number
  y: number
  z: number
}

export interface LandmarkDef {
  id: string
  name: string
  district: string
  /** S 高度还原 / A 主要建筑 / B 区域氛围 */
  grade: 'S' | 'A' | 'B'
  /** WGS-84，来自 OSM */
  lat: number
  lon: number
  /** 朝向：局部 x 轴的方向（弧度，atan2(dz, dx)） */
  rot: number
  /** 占地范围（局部坐标）：发现检测、远近细节按它算 */
  rect: [x0: number, z0: number, x1: number, z1: number]
  /**
   * 程序化建筑和行道树要避让的范围（局部坐标，可以多块），默认就是 rect。
   * 斜着摆的长条景点（外滩、南京路）分成几段，免得外接矩形占掉旁边一大片
   */
  footprint?: [x0: number, z0: number, x1: number, z1: number][]
  /** 拍照识别：瞄准高度、最远距离（格） */
  focusY: number
  photoR: number
  /** 加载半径（格），默认 900；超高层要远处也能看到 */
  loadR?: number
  /** 可以单独识别的子景点（如外滩的海关大楼、和平饭店） */
  subs?: LandmarkSub[]
  build(ctx: LandmarkContext): void
  desc: string
  tip?: string
}

/** 城市包：配置 + 烘焙数据的地址 + 出生点 + 程序化建筑（docs/02 第 4 节） */
export interface CityPackage {
  config: CityConfig
  /** 烘焙数据的地址：地图图层 + 地铁 */
  data: WorldDataUrls & { metro: string }
  /** 第一个是默认出生点 */
  spawns: SpawnPoint[]
  buildings: CityBuildings
  landmarks: LandmarkDef[]
  /** 渡轮和游船（P3） */
  boats: BoatLineDef[]
  /** 路人：类型、穿着、对白（P5） */
  people: NpcContent
}

/** 一句对白；方言句子带普通话意思 */
export interface NpcLine {
  text: string
  gloss?: string
}

export interface NpcType {
  id: string
  name: string
  /** 说上海话、普通话还是英文 */
  speech: 'wu' | 'mandarin' | 'english'
  shirts: number[]
  pants: number[]
  hair: number[]
  /** 老年人：走得慢 */
  old?: boolean
  /** 行为：走路（默认）、骑电动车、遛狗、跳广场舞、站着（相亲角） */
  kind?: 'walk' | 'ride' | 'dog' | 'dance' | 'stand'
  lines: NpcLine[]
}

export interface NpcContent {
  types: NpcType[]
  /** 下雨、梅雨、台风、下雪时本地人会说的 */
  weatherLines: Partial<Record<WeatherKind, NpcLine[]>>
  /** 晚上在外滩、陆家嘴附近会说的 */
  nightLines: NpcLine[]
  /** 相亲角的位置（周末出现） */
  matchmaking: LatLon
}

/** 一条船线：渡轮在两个码头之间来回，游船从码头出发开到折返点再开回来 */
export interface BoatLineDef {
  id: string
  name: string
  kind: 'ferry' | 'cruise'
  /** 票价（元） */
  fare: number
  /** 航线（WGS-84 [lat, lon]）：渡轮从码头 0 到码头 1，首尾是码头外的江面；游船从出发码头到折返点 */
  path: [lat: number, lon: number][]
  /** 码头名：渡轮两个，游船一个 */
  piers: string[]
  /** 航速（格 / 游戏秒） */
  speed: number
  /** 首班、末班（游戏时刻“06:00”） */
  first: string
  last: string
  /** 渡轮两头靠岸停留、游船发船前上客的时间（游戏分钟） */
  dwellMin: number
  /** 游船发船间隔（游戏分钟） */
  headwayMin?: number
}
