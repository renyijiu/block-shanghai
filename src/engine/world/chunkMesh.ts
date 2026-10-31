// 分块几何生成：烘焙数据 → 顶点数组。纯函数（数据进、TypedArray 出），以后可以整体挪进 Web Worker。
// 坐标是游戏格；道路宽度、高架尺寸按人物尺度（docs/03 第 3 节）
import { ShapeUtils, Vector2 } from 'three/webgpu'
import { GeoBuilder, rgb as hex, type GeometryData, type RGB } from '../build/geometry.ts'
import type { Box } from '../geo/CollisionWorld.ts'
import type { AreaPiece, RoadInfo, RoadPiece } from './data.ts'

export type { GeometryData }

// ---------------------------------------------------------------- 面状图层

const toVec = (ring: number[]) => {
  const out: Vector2[] = []
  for (let i = 0; i < ring.length; i += 2) out.push(new Vector2(ring[i], ring[i + 1]))
  return out
}

function flatArea(r: number[]) {
  let a = 0
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += (r[j]! - r[i]!) * (r[j + 1]! + r[i + 1]!)
  return a / 2
}

/** 公园、水面等贴地多边形：三角化后放在高度 y，按 kind 上色 */
export function buildAreas(pieces: AreaPiece[], y: number, colors: Record<string, number>, fallback: number): GeometryData | null {
  const g = new GeoBuilder()
  // 大的先画、小的后画：公园里套绿地这类重叠的面，后画的小块在深度相同时盖住大块
  const sorted = pieces.map((p) => ({ p, a: Math.abs(flatArea(p.polygon[0] ?? [])) })).sort((x, y) => y.a - x.a)
  for (const { p } of sorted) {
    const [outer, ...holes] = p.polygon
    if (!outer || outer.length < 6) continue
    const contour = toVec(outer)
    const holeVecs = holes.filter((h) => h.length >= 6).map(toVec)
    const tris = ShapeUtils.triangulateShape(contour, holeVecs)
    const pts = [...contour, ...holeVecs.flat()]
    const c = hex(colors[p.kind] ?? fallback)
    const base = g.pos.length / 3
    for (const v of pts) g.vertex(v.x, y, v.y, 0, 1, 0, c)
    // x 向东、z 向南、y 向上：从上往下看，三角形要按顺时针（x-z 平面）才朝上
    for (const t of tris) {
      const [a, b, cc] = t as [number, number, number]
      const ax = pts[a]!, bx = pts[b]!, cx = pts[cc]!
      const cross = (bx.x - ax.x) * (cx.y - ax.y) - (bx.y - ax.y) * (cx.x - ax.x)
      if (cross > 0) g.idx.push(base + a, base + cc, base + b)
      else g.idx.push(base + a, base + b, base + cc)
    }
  }
  return g.build()
}

// ---------------------------------------------------------------- 道路

export const ROAD_STYLE = {
  /** 地面道路比地面高一点（配合材质的深度偏移防闪烁） */
  lift: 0.06,
  deckThickness: 1.2,
  parapetHeight: 0.7,
  parapetWidth: 0.35,
  pierSpacing: 12,
  pierSize: 1.8,
  /** 低于这个高度不放桥墩（匝道落地段） */
  pierMinHeight: 2.5,
  colors: {
    motorway: 0x55585e,
    trunk: 0x55585e,
    primary: 0x5d6066,
    secondary: 0x676a6f,
    link: 0x5a5d62,
    bridge: 0x8f8b84,
    concrete: 0xb9b5ab,
    parapet: 0xd4d0c6
  }
}

export interface Frame {
  /** 中心线顶点 [x, z, h] */
  pts: number[][]
  /** 每个顶点的左右偏移向量（已乘半宽和斜接系数） */
  off: number[][]
}

// 折线 → 每个顶点的左侧偏移（斜接，系数上限 2.5，急弯处不会刺得太长）。地铁轨道也用
export function frame(flat: number[], halfWidth: number): Frame | null {
  const pts: number[][] = []
  for (let i = 0; i < flat.length; i += 3) {
    const p = [flat[i]!, flat[i + 1]!, flat[i + 2]!]
    const last = pts[pts.length - 1]
    if (last && Math.hypot(p[0]! - last[0]!, p[1]! - last[1]!) < 1e-3) continue
    pts.push(p)
  }
  if (pts.length < 2) return null
  const segN: number[][] = []
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]![0]! - pts[i - 1]![0]!
    const dz = pts[i]![1]! - pts[i - 1]![1]!
    const len = Math.hypot(dx, dz)
    // 左侧法线（面向前进方向，x 东 z 南）
    segN.push([dz / len, -dx / len])
  }
  const off = pts.map((_, i) => {
    const a = segN[Math.max(0, i - 1)]!
    const b = segN[Math.min(segN.length - 1, i)]!
    let nx = a[0]! + b[0]!
    let nz = a[1]! + b[1]!
    const len = Math.hypot(nx, nz) || 1
    nx /= len
    nz /= len
    const k = Math.min(2.5, 1 / Math.max(0.4, nx * b[0]! + nz * b[1]!))
    return [nx * halfWidth * k, nz * halfWidth * k]
  })
  return { pts, off }
}

function roadColor(info: RoadInfo): RGB {
  const c = ROAD_STYLE.colors
  if (info.bridge) return hex(c.bridge)
  if (info.class.endsWith('_link')) return hex(c.link)
  return hex(c[info.class as 'motorway'] ?? c.secondary)
}

/** 地面道路（含过河小桥）：贴地的路面带 */
export function buildGroundRoads(pieces: RoadPiece[], roads: RoadInfo[]): GeometryData | null {
  const g = new GeoBuilder()
  for (const [idx, flat] of pieces) {
    const info = roads[idx]!
    if (info.level > 0) continue
    const f = frame(flat, info.width / 2)
    if (!f) continue
    const col = roadColor(info)
    const y = ROAD_STYLE.lift + (info.bridge ? 0.04 : 0)
    for (let i = 1; i < f.pts.length; i++) {
      const [ax, az] = f.pts[i - 1]!
      const [bx, bz] = f.pts[i]!
      const [aox, aoz] = f.off[i - 1]!
      const [box, boz] = f.off[i]!
      g.quad([ax! - aox!, y, az! - aoz!], [bx! - box!, y, bz! - boz!], [bx! + box!, y, bz! + boz!], [ax! + aox!, y, az! + aoz!], [0, 1, 0], col)
    }
    if (info.bridge) addParapets(g, f, 0, y)
  }
  return g.build()
}

// 护栏：沿两侧边缘的矮墙（外侧面、内侧面、顶面）
function addParapets(g: GeoBuilder, f: Frame, bottomDrop: number, deckY: number | null) {
  const s = ROAD_STYLE
  const col = hex(s.colors.parapet)
  for (const side of [1, -1]) {
    for (let i = 1; i < f.pts.length; i++) {
      const p0 = f.pts[i - 1]!
      const p1 = f.pts[i]!
      const y0 = deckY ?? p0[2]!
      const y1 = deckY ?? p1[2]!
      const o0 = f.off[i - 1]!.map((v) => v * side)
      const o1 = f.off[i]!.map((v) => v * side)
      const len0 = Math.hypot(o0[0]!, o0[1]!) || 1
      const len1 = Math.hypot(o1[0]!, o1[1]!) || 1
      // 外缘、内缘（向路中心缩进护栏宽度）
      const out0 = [p0[0]! + o0[0]!, p0[1]! + o0[1]!]
      const out1 = [p1[0]! + o1[0]!, p1[1]! + o1[1]!]
      const in0 = [out0[0]! - (o0[0]! / len0) * s.parapetWidth, out0[1]! - (o0[1]! / len0) * s.parapetWidth]
      const in1 = [out1[0]! - (o1[0]! / len1) * s.parapetWidth, out1[1]! - (o1[1]! / len1) * s.parapetWidth]
      const n = [(o0[0]! / len0) * 1, 0, (o0[1]! / len0) * 1]
      const top0 = y0 + s.parapetHeight
      const top1 = y1 + s.parapetHeight
      const quadSide = (a: number[], b: number[], ya0: number, ya1: number, yb0: number, yb1: number, normal: number[]) => {
        // side=1 时左侧，法线朝外；按朝向调整顶点顺序
        if (side === 1) g.quad([a[0]!, ya0, a[1]!], [a[0]!, yb0, a[1]!], [b[0]!, yb1, b[1]!], [b[0]!, ya1, b[1]!], normal, col)
        else g.quad([b[0]!, ya1, b[1]!], [b[0]!, yb1, b[1]!], [a[0]!, yb0, a[1]!], [a[0]!, ya0, a[1]!], normal, col)
      }
      quadSide(out0, out1, y0 - bottomDrop, y1 - bottomDrop, top0, top1, n)
      quadSide(in0, in1, top0, top1, y0, y1, [-n[0]!, 0, -n[2]!])
      // 顶面
      if (side === 1) g.quad([out0[0]!, top0, out0[1]!], [in0[0]!, top0, in0[1]!], [in1[0]!, top1, in1[1]!], [out1[0]!, top1, out1[1]!], [0, 1, 0], col)
      else g.quad([out1[0]!, top1, out1[1]!], [in1[0]!, top1, in1[1]!], [in0[0]!, top0, in0[1]!], [out0[0]!, top0, out0[1]!], [0, 1, 0], col)
    }
  }
}

/** 高架：桥面（含厚度、底面）、护栏、桥墩，合并成一个网格；桥墩的碰撞盒写进 colliders */
export function buildElevated(pieces: RoadPiece[], roads: RoadInfo[], colliders?: Box[], skipPier?: (x: number, z: number) => boolean): GeometryData | null {
  const s = ROAD_STYLE
  const g = new GeoBuilder()
  const concrete = hex(s.colors.concrete)
  for (const [idx, flat] of pieces) {
    const info = roads[idx]!
    if (info.level === 0) continue
    const f = frame(flat, info.width / 2)
    if (!f) continue
    const top = roadColor(info)
    let carried = 0
    for (let i = 1; i < f.pts.length; i++) {
      const [ax, az, ah] = f.pts[i - 1]!
      const [bx, bz, bh] = f.pts[i]!
      const [aox, aoz] = f.off[i - 1]!
      const [box, boz] = f.off[i]!
      const la = [ax! + aox!, az! + aoz!]
      const ra = [ax! - aox!, az! - aoz!]
      const lb = [bx! + box!, bz! + boz!]
      const rb = [bx! - box!, bz! - boz!]
      // 路面
      g.quad([ra[0]!, ah!, ra[1]!], [rb[0]!, bh!, rb[1]!], [lb[0]!, bh!, lb[1]!], [la[0]!, ah!, la[1]!], [0, 1, 0], top)
      // 底面
      const da = ah! - s.deckThickness
      const db = bh! - s.deckThickness
      g.quad([la[0]!, da, la[1]!], [lb[0]!, db, lb[1]!], [rb[0]!, db, rb[1]!], [ra[0]!, da, ra[1]!], [0, -1, 0], concrete)
      // 桥墩：沿中心线每隔 pierSpacing 一个
      const segLen = Math.hypot(bx! - ax!, bz! - az!)
      let d = s.pierSpacing - carried
      while (d <= segLen) {
        const t = d / segLen
        const h = ah! + (bh! - ah!) * t - s.deckThickness
        const px = ax! + (bx! - ax!) * t
        const pz = az! + (bz! - az!) * t
        if (h + s.deckThickness > s.pierMinHeight && !skipPier?.(px, pz)) {
          const hs = s.pierSize / 2
          g.box(px - hs, 0, pz - hs, px + hs, h, pz + hs, concrete)
          colliders?.push({ x0: px - hs, y0: 0, z0: pz - hs, x1: px + hs, y1: h, z1: pz + hs })
        }
        d += s.pierSpacing
      }
      carried = (carried + segLen) % s.pierSpacing
    }
    addParapets(g, f, s.deckThickness, null)
  }
  return g.build()
}
