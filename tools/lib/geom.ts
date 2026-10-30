// 烘焙用的平面几何算法。坐标是 [x, y] 二元组；既用于经纬度（x=经度、y=纬度），也用于游戏坐标（x、z）。
// 带附加分量的点（如道路高度 [x, z, h]）在裁剪时按线性插值处理附加分量。

export type Pt = number[]
export interface Rect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** 有向面积：x 向右、y 向上时逆时针为正（经纬度）；游戏坐标 z 向南，符号相反 */
export function ringArea(ring: Pt[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!)
  return a / 2
}

export function pointInRing(x: number, y: number, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number]
    const [xj, yj] = ring[j] as [number, number]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function bounds(pts: Pt[]): Rect {
  const r = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const p of pts) {
    if (p[0]! < r.minX) r.minX = p[0]!
    if (p[0]! > r.maxX) r.maxX = p[0]!
    if (p[1]! < r.minY) r.minY = p[1]!
    if (p[1]! > r.maxY) r.maxY = p[1]!
  }
  return r
}

export function pathLength(pts: Pt[]): number {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!)
  return d
}

// 点到线段的距离
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0]! - a[0]!
  const dy = b[1]! - a[1]!
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0]! - (a[0]! + t * dx), p[1]! - (a[1]! + t * dy))
}

/** Douglas–Peucker 抽稀，保留首尾点；用栈代替递归，长海岸线不会爆栈 */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts.slice()
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    let maxD = -1
    let idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i]!, pts[s]!, pts[e]!)
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (idx > 0 && maxD > tol) {
      keep[idx] = 1
      stack.push([s, idx], [idx, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** 闭合环抽稀：首尾相同的环先在最远点处拆成两段，避免首点附近被抽掉后形状塌陷 */
export function simplifyRing(ring: Pt[], tol: number): Pt[] {
  const open = samePt(ring[0]!, ring[ring.length - 1]!) ? ring.slice(0, -1) : ring.slice()
  if (open.length < 4) return open
  let far = 0
  let farD = -1
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i]![0]! - open[0]![0]!, open[i]![1]! - open[0]![1]!)
    if (d > farD) {
      farD = d
      far = i
    }
  }
  const a = simplify(open.slice(0, far + 1), tol)
  const b = simplify([...open.slice(far), open[0]!], tol)
  return [...a, ...b.slice(1, -1)]
}

export const samePt = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1]

// 线性插值所有分量
const lerp = (a: Pt, b: Pt, t: number): Pt => a.map((v, i) => v + (b[i]! - v) * t)

/** 折线按矩形裁剪（Liang–Barsky），返回落在矩形内的若干段 */
export function clipPolyline(pts: Pt[], r: Rect): Pt[][] {
  const out: Pt[][] = []
  let cur: Pt[] | null = null
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const seg = clipSegment(a, b, r)
    if (!seg) {
      cur = null
      continue
    }
    const [p, q, t0, t1] = seg
    if (!cur || t0 > 0) {
      cur = [p]
      out.push(cur)
    }
    cur.push(q)
    if (t1 < 1) cur = null
  }
  return out.filter((l) => l.length >= 2)
}

function clipSegment(a: Pt, b: Pt, r: Rect): [Pt, Pt, number, number] | null {
  const dx = b[0]! - a[0]!
  const dy = b[1]! - a[1]!
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [
    [-dx, a[0]! - r.minX],
    [dx, r.maxX - a[0]!],
    [-dy, a[1]! - r.minY],
    [dy, r.maxY - a[1]!]
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null
    } else {
      const t = q / p
      if (p < 0) {
        if (t > t1) return null
        if (t > t0) t0 = t
      } else {
        if (t < t0) return null
        if (t < t1) t1 = t
      }
    }
  }
  return [t0 > 0 ? lerp(a, b, t0) : a, t1 < 1 ? lerp(a, b, t1) : b, t0, t1]
}

/**
 * 环按矩形裁剪（Sutherland–Hodgman）。凹多边形穿出再穿入时会沿边界留下零宽的连接边，
 * 三角化后面积为零，不影响渲染（矢量切片的通行做法）
 */
export function clipRing(ring: Pt[], r: Rect): Pt[] {
  let pts = ring
  const planes: [number, number, 1 | -1][] = [
    [0, r.minX, 1],
    [0, r.maxX, -1],
    [1, r.minY, 1],
    [1, r.maxY, -1]
  ]
  for (const [axis, v, sign] of planes) {
    if (!pts.length) break
    const inside = (p: Pt) => (p[axis]! - v) * sign >= 0
    const next: Pt[] = []
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i]!
      const prev = pts[(i + pts.length - 1) % pts.length]!
      const ci = inside(cur)
      const pi = inside(prev)
      if (ci !== pi) next.push(lerp(prev, cur, (v - prev[axis]!) / (cur[axis]! - prev[axis]!)))
      if (ci) next.push(cur)
    }
    pts = next
  }
  return pts.length >= 3 ? pts : []
}

/**
 * 首尾相接的折线拼成长折线。key 相同的才拼；allowReverse 时可以反向拼接（道路渲染不关心方向），
 * 海岸线有方向（陆地在左侧），不能反向
 */
export function mergeLines<T extends { key: string; pts: Pt[] }>(lines: T[], allowReverse: boolean): T[] {
  const k = (p: Pt) => `${p[0]},${p[1]}`
  const byStart = new Map<string, T[]>()
  const byEnd = new Map<string, T[]>()
  const add = (m: Map<string, T[]>, key: string, l: T) => (m.get(key) ?? m.set(key, []).get(key)!).push(l)
  const del = (m: Map<string, T[]>, key: string, l: T) => {
    const arr = m.get(key)
    if (arr) arr.splice(arr.indexOf(l), 1)
  }
  const live = new Set<T>()
  for (const l of lines) {
    const c = { ...l, pts: l.pts.slice() }
    live.add(c)
    add(byStart, l.key + '|' + k(c.pts[0]!), c)
    add(byEnd, l.key + '|' + k(c.pts[c.pts.length - 1]!), c)
  }
  const index = (l: T) => {
    add(byStart, l.key + '|' + k(l.pts[0]!), l)
    add(byEnd, l.key + '|' + k(l.pts[l.pts.length - 1]!), l)
  }
  const unindex = (l: T) => {
    del(byStart, l.key + '|' + k(l.pts[0]!), l)
    del(byEnd, l.key + '|' + k(l.pts[l.pts.length - 1]!), l)
  }
  for (const l of [...live]) {
    if (!live.has(l)) continue
    let grown = true
    while (grown) {
      grown = false
      if (samePt(l.pts[0]!, l.pts[l.pts.length - 1]!)) break
      const endKey = l.key + '|' + k(l.pts[l.pts.length - 1]!)
      // 向后接：别人的起点 = 我的终点
      let next = byStart.get(endKey)?.find((o) => o !== l)
      let reverse = false
      if (!next && allowReverse) {
        next = byEnd.get(endKey)?.find((o) => o !== l)
        reverse = true
      }
      if (next) {
        unindex(l)
        unindex(next)
        live.delete(next)
        const add = reverse ? next.pts.slice().reverse() : next.pts
        l.pts.push(...add.slice(1))
        index(l)
        grown = true
        continue
      }
      // 向前接：别人的终点 = 我的起点
      const startKey = l.key + '|' + k(l.pts[0]!)
      let prev = byEnd.get(startKey)?.find((o) => o !== l)
      reverse = false
      if (!prev && allowReverse) {
        prev = byStart.get(startKey)?.find((o) => o !== l)
        reverse = true
      }
      if (prev) {
        unindex(l)
        unindex(prev)
        live.delete(prev)
        const add = reverse ? prev.pts.slice().reverse() : prev.pts
        l.pts = [...add.slice(0, -1), ...l.pts]
        index(l)
        grown = true
      }
    }
  }
  return [...live]
}

/** 在长边上插点，保证换算坐标（非线性的径向压缩）后边界仍贴合原形状 */
export function densify(pts: Pt[], maxSeg: number): Pt[] {
  const out: Pt[] = [pts[0]!]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const n = Math.ceil(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) / maxSeg)
    for (let j = 1; j < n; j++) out.push(lerp(a, b, j / n))
    out.push(b)
  }
  return out
}

/**
 * 标注点：在多边形（[外环, ...洞]）内网格采样，取离边界最远、且不被 exclude 排除的点。
 * 用于区名位置；浦东、崇明的区界延伸到海上，要排除海面，并把海岸线也算作边界
 */
export function labelPoint(polygons: Pt[][][], exclude: (x: number, y: number) => boolean, extraEdges: Pt[][] = [], samples = 60): Pt | null {
  const all = polygons.flatMap((p) => p[0]!)
  const b = bounds(all)
  const step = Math.max(b.maxX - b.minX, b.maxY - b.minY) / samples
  let best: Pt | null = null
  let bestD = -1
  for (let x = b.minX + step / 2; x < b.maxX; x += step) {
    for (let y = b.minY + step / 2; y < b.maxY; y += step) {
      const poly = polygons.find((p) => pointInRing(x, y, p[0]!) && !p.slice(1).some((h) => pointInRing(x, y, h)))
      if (!poly || exclude(x, y)) continue
      let d = Infinity
      // 距离同时算到 extraEdges（海岸线），否则区界包着江面时会选到江中小岛
      for (const ring of [...poly, ...extraEdges]) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) d = Math.min(d, segDist([x, y], ring[j]!, ring[i]!))
      if (d > bestD) {
        bestD = d
        best = [x, y]
      }
    }
  }
  return best
}
