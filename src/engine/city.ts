// 城市包契约（类型）。由引擎定义，城市包按它实现；引擎不 import 任何具体城市。
// 字段说明见 docs/02-architecture.md「城市包契约」，后续阶段的字段（buildingProfiles 等）到时再加。
import type { Builder } from './build/Builder.ts'
import type { Rng } from './build/random.ts'
import type { LatLon, ProjectionConfig } from './geo/projection.ts'
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

/** 在地块上盖一组建筑；坐标是游戏格，高度按建筑尺度（docs/03 第 3 节） */
export type BuildingStyle = (b: Builder, lot: Lot, rng: Rng) => void
/** 在 (x, z) 种一棵树（人物尺度） */
export type TreeStyle = (b: Builder, x: number, z: number, rng: Rng) => void

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

/** 城市包：配置 + 烘焙数据的地址 + 出生点 + 程序化建筑（docs/02 第 4 节） */
export interface CityPackage {
  config: CityConfig
  /** 烘焙数据的地址：地图图层 + 地铁 */
  data: WorldDataUrls & { metro: string }
  /** 第一个是默认出生点 */
  spawns: SpawnPoint[]
  buildings: CityBuildings
}
