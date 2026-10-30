// OSM 海岸线 → bbox 范围内的海面多边形（经纬度空间，x=经度、y=纬度）
// OSM 约定海岸线陆地在走向左侧、水在右侧。做法与矢量切片里拼海面相同：
// 把海岸线裁成进出 bbox 的若干段，反向（让水在左侧）后沿 bbox 边框逆时针连接，得到逆时针的海面环；
// bbox 内完整闭合的逆时针海岸线是岛屿，作为海面的洞。
import { bounds, clipPolyline, mergeLines, pointInRing, ringArea, samePt, type Pt, type Rect } from './geom.ts'

export interface SeaResult {
  /** 每个多边形 [外环, ...洞]，外环逆时针 */
  polygons: Pt[][][]
  warnings: string[]
}

const inside = (p: Pt, r: Rect) => p[0]! > r.minX && p[0]! < r.maxX && p[1]! > r.minY && p[1]! < r.maxY

// 边框上的点 → 从左下角起逆时针量的周长位置
function perimeterPos(p: Pt, r: Rect): number {
  const w = r.maxX - r.minX
  const h = r.maxY - r.minY
  const d = [Math.abs(p[1]! - r.minY), Math.abs(p[0]! - r.maxX), Math.abs(p[1]! - r.maxY), Math.abs(p[0]! - r.minX)]
  const edge = d.indexOf(Math.min(...d))
  if (edge === 0) return p[0]! - r.minX
  if (edge === 1) return w + (p[1]! - r.minY)
  if (edge === 2) return w + h + (r.maxX - p[0]!)
  return 2 * w + h + (r.maxY - p[1]!)
}

// 离点最近的边框上的点（数据缺口时把断头接到边框上）
function snapToEdge(p: Pt, r: Rect): Pt {
  const d = [p[1]! - r.minY, r.maxX - p[0]!, r.maxY - p[1]!, p[0]! - r.minX]
  const edge = d.indexOf(Math.min(...d))
  return [[p[0]!, r.minY], [r.maxX, p[1]!], [p[0]!, r.maxY], [r.minX, p[1]!]][edge]!
}

export function buildSea(coastlines: Pt[][], r: Rect): SeaResult {
  const warnings: string[] = []
  const chains = mergeLines(
    coastlines.map((pts) => ({ key: '', pts })),
    false
  ).map((c) => c.pts)

  const islands: Pt[][] = []
  const lagoons: Pt[][] = []
  const pieces: Pt[][] = []
  for (let pts of chains) {
    const closed = samePt(pts[0]!, pts[pts.length - 1]!)
    const b = bounds(pts)
    if (closed && b.minX > r.minX && b.maxX < r.maxX && b.minY > r.minY && b.maxY < r.maxY) {
      ;(ringArea(pts) > 0 ? islands : lagoons).push(pts)
      continue
    }
    if (closed) {
      // 跨出边框的闭合环：从框外的点起算，按普通折线裁剪
      const k = pts.findIndex((p) => !inside(p, r))
      if (k < 0) continue
      pts = [...pts.slice(k, -1), ...pts.slice(0, k + 1)]
    } else {
      if (inside(pts[0]!, r)) {
        warnings.push(`海岸线断头 (${pts[0]!.join(', ')}) 在范围内，已接到最近的边框`)
        pts = [snapToEdge(pts[0]!, r), ...pts]
      }
      if (inside(pts[pts.length - 1]!, r)) {
        warnings.push(`海岸线断头 (${pts[pts.length - 1]!.join(', ')}) 在范围内，已接到最近的边框`)
        pts = [...pts, snapToEdge(pts[pts.length - 1]!, r)]
      }
    }
    pieces.push(...clipPolyline(pts, r))
  }

  const perim = 2 * (r.maxX - r.minX + r.maxY - r.minY)
  const corners: [number, Pt][] = [
    [r.maxX - r.minX, [r.maxX, r.minY]],
    [r.maxX - r.minX + (r.maxY - r.minY), [r.maxX, r.maxY]],
    [2 * (r.maxX - r.minX) + (r.maxY - r.minY), [r.minX, r.maxY]],
    [perim, [r.minX, r.minY]]
  ]
  const ccw = (from: number, to: number) => (to - from + perim) % perim

  const outers: Pt[][] = []
  const used = new Set<number>()
  for (let first = 0; first < pieces.length; first++) {
    if (used.has(first)) continue
    const ring: Pt[] = []
    let cur = first
    for (let guard = 0; guard <= pieces.length; guard++) {
      used.add(cur)
      const rev = pieces[cur]!.slice().reverse()
      ring.push(...rev)
      // 在进入点沿边框逆时针走，找最近的离开点
      const tIn = perimeterPos(rev[rev.length - 1]!, r)
      let next = -1
      let best = Infinity
      for (let j = 0; j < pieces.length; j++) {
        if (used.has(j) && j !== first) continue
        const p = pieces[j]!
        const d = ccw(tIn, perimeterPos(p[p.length - 1]!, r))
        if (d < best) {
          best = d
          next = j
        }
      }
      // 沿途经过的角点
      for (const [t, c] of [...corners, ...corners.map(([t, c]) => [t + perim, c] as [number, Pt])]) {
        const rel = t - tIn
        if (rel > 0 && rel < best) ring.push(c)
      }
      if (next === first || next < 0) break
      cur = next
    }
    outers.push(ring)
  }

  const polygons: Pt[][][] = outers.map((o) => [o])
  for (const isl of islands) {
    const owner = polygons.find((poly) => pointInRing(isl[0]![0]!, isl[0]![1]!, poly[0]!))
    if (owner) owner.push(isl)
    else warnings.push(`岛屿 (${isl[0]!.join(', ')}) 不在任何海面内，已忽略`)
  }
  for (const l of lagoons) polygons.push([l.slice().reverse()])
  return { polygons, warnings }
}
