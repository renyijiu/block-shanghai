// 行车轨迹：真实里程 ↔ 游戏坐标。列车按里程定位车头，车厢按游戏里的弧长往后排
import type { MetroService } from './data.ts'

export interface PathPoint {
  x: number
  z: number
  h: number
  /** 前进方向（弧度，atan2(dz, dx)） */
  angle: number
}

export class ServicePath {
  private readonly x: Float64Array
  private readonly z: Float64Array
  private readonly h: Float64Array
  private readonly km: Float64Array
  /** 游戏坐标下的累计弧长（格） */
  private readonly arc: Float64Array
  readonly length: number

  constructor(s: MetroService) {
    const n = s.path.length / 4
    this.x = new Float64Array(n)
    this.z = new Float64Array(n)
    this.h = new Float64Array(n)
    this.km = new Float64Array(n)
    this.arc = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      this.x[i] = s.path[i * 4]!
      this.z[i] = s.path[i * 4 + 1]!
      this.h[i] = s.path[i * 4 + 2]!
      this.km[i] = s.path[i * 4 + 3]!
      if (i) this.arc[i] = this.arc[i - 1]! + Math.hypot(this.x[i]! - this.x[i - 1]!, this.z[i]! - this.z[i - 1]!)
    }
    this.length = this.arc[n - 1] ?? 0
  }

  /** 真实里程 → 游戏弧长 */
  kmToArc(km: number) {
    return this.lerp(this.km, this.arc, km)
  }

  /** 游戏弧长处的位置、高度、方向 */
  at(arc: number): PathPoint {
    const n = this.arc.length
    const a = Math.max(0, Math.min(this.length, arc))
    let i = search(this.arc, a)
    if (i >= n - 1) i = n - 2
    const span = this.arc[i + 1]! - this.arc[i]!
    const f = span > 0 ? (a - this.arc[i]!) / span : 0
    const dx = this.x[i + 1]! - this.x[i]!
    const dz = this.z[i + 1]! - this.z[i]!
    return { x: this.x[i]! + dx * f, z: this.z[i]! + dz * f, h: this.h[i]! + (this.h[i + 1]! - this.h[i]!) * f, angle: Math.atan2(dz, dx) }
  }

  // 在单调数组 from 里找 v，按同样比例插值 to
  private lerp(from: Float64Array, to: Float64Array, v: number) {
    const n = from.length
    if (v <= from[0]!) return to[0]!
    if (v >= from[n - 1]!) return to[n - 1]!
    const i = search(from, v)
    const span = from[i + 1]! - from[i]!
    return to[i]! + (span > 0 ? (v - from[i]!) / span : 0) * (to[i + 1]! - to[i]!)
  }
}

// 最后一个 <= v 的下标
function search(a: Float64Array, v: number) {
  let lo = 0
  let hi = a.length - 1
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (a[m]! <= v) lo = m
    else hi = m - 1
  }
  return lo
}
