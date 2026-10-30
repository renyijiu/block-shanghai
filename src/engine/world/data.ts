// 烘焙数据格式：tools/bake-world.ts 写出、运行时读取。坐标都是游戏格（x 向东、z 向南），用扁平数组省体积。
// 说明见 docs/03-coordinates-and-data.md 第 6 节
export const WORLD_DATA_VERSION = 1

/** 扁平环 [x0, z0, x1, z1, ...]，首点不重复 */
export type FlatRing = number[]
/** 多边形：[外环, ...洞] */
export type FlatPolygon = FlatRing[]

export interface WorldMeta {
  version: number
  generatedAt: string
  /** OSM 数据时间（Geofabrik 提取包的同步时间戳） */
  osmTimestamp: string
  chunkSize: number
  /** 烘焙范围 [south, west, north, east]（WGS-84） */
  bbox: [number, number, number, number]
  /** 烘焙范围换算成游戏坐标后的轮廓（扁平环） */
  outline: FlatRing
  /** 有数据的分块序号范围（含两端） */
  chunks: { minX: number; maxX: number; minZ: number; maxZ: number }
}

/** 面状图层（水面、公园）在一个分块里的一块，已按分块边界裁好 */
export interface AreaPiece {
  kind: string
  polygon: FlatPolygon
}

export interface AreaLayer {
  version: number
  chunks: Record<string, AreaPiece[]>
}

export type RoadClass = 'motorway' | 'motorway_link' | 'trunk' | 'trunk_link' | 'primary' | 'secondary'

export interface RoadInfo {
  name: string
  class: RoadClass
  /** 路面宽度（格，人物尺度） */
  width: number
  /** 0 地面；≥1 高架层 */
  level: number
  /** 地面层的小桥（过河），渲染时加栏杆 */
  bridge: boolean
}

/** 道路在一个分块里的一段：[道路序号, [x, z, h, x, z, h, ...]]，h 是路面高度（格，含匝道坡度） */
export type RoadPiece = [number, number[]]

export interface RoadLayer {
  version: number
  roads: RoadInfo[]
  chunks: Record<string, RoadPiece[]>
}

export interface DistrictShape {
  /** 城市配置里的区 id */
  id: string
  name: string
  polygons: FlatPolygon[]
  /** [minX, minZ, maxX, maxZ] */
  bounds: [number, number, number, number]
  /** 区名标注位置：区内离边界最远、且不在海上的点 */
  label: [number, number]
}

export interface DistrictLayer {
  version: number
  districts: DistrictShape[]
}
