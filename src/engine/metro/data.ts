// 地铁烘焙数据格式：tools/bake-metro.ts 写出、运行时读取（docs/04 第 4 节）。
// 坐标是游戏格；里程是真实公里（投影前按经纬度算），票价和运行时间都按真实里程
export const METRO_DATA_VERSION = 1

export type LineKind = 'subway' | 'apm' | 'maglev'
export type Structure = 'tunnel' | 'viaduct' | 'ground'

/** 运营交路：一个方向、一条支线或一种大站车 */
export interface MetroService {
  id: string
  /** OSM 线路名，如“2号线：浦东1号2号航站楼 → 蟠祥路” */
  name: string
  /** 停靠站（站点序号），按行车顺序；环线首尾是同一站 */
  stops: number[]
  /** 各停靠站在本交路上的真实里程（km），与 stops 一一对应 */
  chainage: number[]
  /** 大站车 / 直达车 */
  express: boolean
  /** 行车轨迹，扁平数组 [x, z, h, km, ...]：游戏坐标、轨面高度（格）、真实里程 */
  path: number[]
}

export interface MetroLine {
  id: string
  ref: string
  name: string
  nameEn: string
  color: string
  kind: LineKind
  loop: boolean
  services: MetroService[]
}

export interface MetroPlatform {
  line: string
  structure: Structure
  /** 站台处轨道的方向（弧度，atan2(dz, dx)） */
  angle: number
  pos: [number, number]
  /** 轨面高度（格） */
  h: number
}

export interface MetroStation {
  id: string
  name: string
  nameEn: string
  pos: [number, number]
  lines: string[]
  platforms: MetroPlatform[]
  /** 出入口序号 */
  exits: number[]
  /** 换乘步行时间（真实分钟） */
  transferMin: number
}

export interface MetroEntrance {
  station: number
  /** 出口编号，如“2”“3A”；OSM 没有时为空 */
  ref: string
  pos: [number, number]
}

export interface MetroTrack {
  /** 共用这段轨道的线路 */
  lines: string[]
  structure: Structure
}

export interface MetroRules {
  /** 里程计价：baseKm 内 baseYuan 元，之后每 stepKm 加 stepYuan 元 */
  fare: { baseKm: number; baseYuan: number; stepKm: number; stepYuan: number }
  /** 磁浮单程票价（元），单独计价 */
  maglevFare: number
  avgSpeedKmh: Record<LineKind, number>
  dwellSec: number
  /** 发车间隔（分钟） */
  headwayMin: { peak: number; offpeak: number; express: number }
  /** 高峰时段（小时，含起不含止） */
  peakHours: [number, number][]
  /** 运营时间（小时）：[首班, 末班] */
  serviceHours: [number, number]
}

export interface MetroChunk {
  /** 轨道在本分块里的一段：[轨道序号, [x, z, h, ...]] */
  tracks: [number, number[]][]
  entrances: number[]
  stations: number[]
}

export interface MetroData {
  version: number
  generatedAt: string
  osmTimestamp: string
  rules: MetroRules
  lines: MetroLine[]
  stations: MetroStation[]
  entrances: MetroEntrance[]
  tracks: MetroTrack[]
  chunks: Record<string, MetroChunk>
}
