// 加载城市包的烘焙数据（world / water / parks / roads / districts），常驻内存，按分块键取用
import { WORLD_DATA_VERSION, type AreaLayer, type AreaPiece, type DistrictLayer, type RoadLayer, type RoadPiece, type WorldMeta } from './data.ts'

export interface WorldDataUrls {
  world: string
  water: string
  parks: string
  roads: string
  districts: string
}

export class WorldData {
  readonly meta: WorldMeta
  readonly water: AreaLayer
  readonly parks: AreaLayer
  readonly roads: RoadLayer
  readonly districts: DistrictLayer

  private constructor(meta: WorldMeta, water: AreaLayer, parks: AreaLayer, roads: RoadLayer, districts: DistrictLayer) {
    this.meta = meta
    this.water = water
    this.parks = parks
    this.roads = roads
    this.districts = districts
  }

  static async load(urls: WorldDataUrls, onProgress?: (done: number, total: number) => void): Promise<WorldData> {
    let done = 0
    const get = async <T extends { version: number }>(url: string): Promise<T> => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`加载地图数据失败：${res.status} ${url}`)
      const json = (await res.json()) as T
      if (json.version !== WORLD_DATA_VERSION) throw new Error(`地图数据版本 ${json.version} 与引擎 ${WORLD_DATA_VERSION} 不一致，请重新烘焙`)
      onProgress?.(++done, 5)
      return json
    }
    const [meta, water, parks, roads, districts] = await Promise.all([
      get<WorldMeta>(urls.world),
      get<AreaLayer>(urls.water),
      get<AreaLayer>(urls.parks),
      get<RoadLayer>(urls.roads),
      get<DistrictLayer>(urls.districts)
    ])
    return new WorldData(meta, water, parks, roads, districts)
  }

  /** 分块是否在世界范围内 */
  inBounds(cx: number, cz: number) {
    const c = this.meta.chunks
    return cx >= c.minX && cx <= c.maxX && cz >= c.minZ && cz <= c.maxZ
  }

  chunk(key: string): { water: AreaPiece[]; parks: AreaPiece[]; roads: RoadPiece[] } {
    return { water: this.water.chunks[key] ?? [], parks: this.parks.chunks[key] ?? [], roads: this.roads.chunks[key] ?? [] }
  }
}
