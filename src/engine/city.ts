// 城市包契约（类型）。由引擎定义，城市包按它实现；引擎不 import 任何具体城市。
// 字段说明见 docs/02-architecture.md「城市包契约」，后续阶段的字段（buildingProfiles 等）到时再加。
import type { LatLon, ProjectionConfig } from './geo/projection.ts'
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

/** 城市包：配置 + 烘焙数据的地址 + 出生点（docs/02 第 4 节） */
export interface CityPackage {
  config: CityConfig
  data: WorldDataUrls
  /** 第一个是默认出生点 */
  spawns: SpawnPoint[]
}
