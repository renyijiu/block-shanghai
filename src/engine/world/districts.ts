// 区划查询：某个游戏坐标属于哪个区。用于建筑风格、行道树、区名提示、小地图
import type { DistrictLayer, DistrictShape, FlatRing } from './data.ts'

export function pointInFlatRing(x: number, z: number, r: FlatRing) {
  let inside = false
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i]!, zi = r[i + 1]!, xj = r[j]!, zj = r[j + 1]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export class DistrictIndex {
  private readonly list: DistrictShape[]
  private last: DistrictShape | null = null

  constructor(layer: DistrictLayer) {
    this.list = layer.districts
  }

  get all() {
    return this.list
  }

  /** 所在的区；市界外返回 null */
  at(x: number, z: number): DistrictShape | null {
    // 连续查询多半落在同一个区，先查上一次的
    if (this.last && this.contains(this.last, x, z)) return this.last
    for (const d of this.list) {
      if (d !== this.last && this.contains(d, x, z)) return (this.last = d)
    }
    return null
  }

  private contains(d: DistrictShape, x: number, z: number) {
    const [x0, z0, x1, z1] = d.bounds
    if (x < x0 || x > x1 || z < z0 || z > z1) return false
    return d.polygons.some((p) => pointInFlatRing(x, z, p[0]!) && !p.slice(1).some((h) => pointInFlatRing(x, z, h)))
  }
}
