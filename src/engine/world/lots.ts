// 地块：分块按固定间距划成地块，避开道路、水面、公园，给城市包盖房子；沿道路两侧找行道树的位置。纯函数
import type { AreaPiece, RoadInfo, RoadPiece } from './data.ts'
import { pointInFlatRing } from './districts.ts'

export interface Lot {
  /** 可用的地块范围（格），已留出退界 */
  x0: number
  z0: number
  x1: number
  z1: number
}

export interface LotInputs {
  /** 本分块及相邻分块的道路（道路贴着分块边界时也要避让） */
  roads: RoadPiece[]
  roadInfo: RoadInfo[]
  water: AreaPiece[]
  parks: AreaPiece[]
  /** 道路线段的网格索引，第一次查询时建立 */
  index?: SegmentIndex
}

/** 道路线段：端点 + 半宽 */
interface Seg {
  ax: number
  az: number
  bx: number
  bz: number
  half: number
}

const CELL = 16

/** 道路线段按网格分桶：每个地块、每棵树只和附近的线段比距离 */
class SegmentIndex {
  private readonly cells = new Map<string, Seg[]>()
  constructor(inp: LotInputs) {
    for (const [idx, pts] of inp.roads) {
      const half = inp.roadInfo[idx]!.width / 2
      for (let i = 3; i < pts.length; i += 3) {
        const s = { ax: pts[i - 3]!, az: pts[i - 2]!, bx: pts[i]!, bz: pts[i + 1]!, half }
        const pad = half + ROAD_CLEARANCE
        for (let cx = Math.floor((Math.min(s.ax, s.bx) - pad) / CELL); cx <= Math.floor((Math.max(s.ax, s.bx) + pad) / CELL); cx++)
          for (let cz = Math.floor((Math.min(s.az, s.bz) - pad) / CELL); cz <= Math.floor((Math.max(s.az, s.bz) + pad) / CELL); cz++) {
            const k = `${cx},${cz}`
            ;(this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(s)
          }
      }
    }
  }

  near(r: Lot): Set<Seg> {
    const out = new Set<Seg>()
    for (let cx = Math.floor(r.x0 / CELL); cx <= Math.floor(r.x1 / CELL); cx++)
      for (let cz = Math.floor(r.z0 / CELL); cz <= Math.floor(r.z1 / CELL); cz++) for (const s of this.cells.get(`${cx},${cz}`) ?? []) out.add(s)
    return out
  }
}

export const LOT_SIZE = 24
/** 建筑离道路边缘至少留的距离（格） */
const ROAD_CLEARANCE = 2.5
/** 地块四周退界（格），地块之间自然形成小路 */
const SETBACK = 2

// 点到线段的距离
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

// 线段到矩形的距离（相交为 0）
export function segRectDist(ax: number, az: number, bx: number, bz: number, r: Lot) {
  const inside = (x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
  if (inside(ax, az) || inside(bx, bz)) return 0
  const edges: [number, number, number, number][] = [
    [r.x0, r.z0, r.x1, r.z0],
    [r.x1, r.z0, r.x1, r.z1],
    [r.x1, r.z1, r.x0, r.z1],
    [r.x0, r.z1, r.x0, r.z0]
  ]
  let d = Infinity
  for (const [cx, cz, ex, ez] of edges) {
    if (segmentsIntersect(ax, az, bx, bz, cx, cz, ex, ez)) return 0
    d = Math.min(d, segDist(cx, cz, ax, az, bx, bz), segDist(ax, az, cx, cz, ex, ez), segDist(bx, bz, cx, cz, ex, ez))
  }
  return d
}

function segmentsIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const o = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px))
  return o(ax, az, bx, bz, cx, cz) !== o(ax, az, bx, bz, dx, dz) && o(cx, cz, dx, dz, ax, az) !== o(cx, cz, dx, dz, bx, bz)
}

function inAreas(x: number, z: number, areas: AreaPiece[]) {
  return areas.some((a) => pointInFlatRing(x, z, a.polygon[0]!) && !a.polygon.slice(1).some((h) => pointInFlatRing(x, z, h)))
}

/** 地块（或任意矩形）离道路边缘是否不足 clearance 格（clearance 不超过 ROAD_CLEARANCE） */
export function blockedByRoad(r: Lot, inp: LotInputs, clearance = ROAD_CLEARANCE) {
  inp.index ??= new SegmentIndex(inp)
  for (const s of inp.index.near(r)) {
    const reach = s.half + clearance
    // 先用包围盒粗筛
    if (Math.max(s.ax, s.bx) < r.x0 - reach || Math.min(s.ax, s.bx) > r.x1 + reach || Math.max(s.az, s.bz) < r.z0 - reach || Math.min(s.az, s.bz) > r.z1 + reach) continue
    if (segRectDist(s.ax, s.az, s.bx, s.bz, r) < reach) return true
  }
  return false
}

/** 分块 (cx, cz) 里可以盖房子的地块 */
export function findLots(cx: number, cz: number, chunkSize: number, inp: LotInputs): Lot[] {
  const lots: Lot[] = []
  const n = Math.floor(chunkSize / LOT_SIZE)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const lot = {
        x0: cx * chunkSize + i * LOT_SIZE + SETBACK,
        z0: cz * chunkSize + j * LOT_SIZE + SETBACK,
        x1: cx * chunkSize + (i + 1) * LOT_SIZE - SETBACK,
        z1: cz * chunkSize + (j + 1) * LOT_SIZE - SETBACK
      }
      const samples: [number, number][] = [
        [(lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2],
        [lot.x0, lot.z0],
        [lot.x1, lot.z0],
        [lot.x0, lot.z1],
        [lot.x1, lot.z1]
      ]
      if (samples.some(([x, z]) => inAreas(x, z, inp.water) || inAreas(x, z, inp.parks))) continue
      if (blockedByRoad(lot, inp)) continue
      lots.push(lot)
    }
  }
  return lots
}

export interface TreeSpot {
  x: number
  z: number
}

/**
 * 行道树位置：地面道路（不含快速路、匝道、桥）两侧，离路边 1.2 格，按间距排；
 * 落在水面、公园里或压到其他道路的不种。spacing 是间距（格）
 */
export function streetTreeSpots(own: RoadPiece[], inp: LotInputs, spacing: number): TreeSpot[] {
  const spots: TreeSpot[] = []
  for (const [idx, pts] of own) {
    const info = inp.roadInfo[idx]!
    if (info.level > 0 || info.bridge || info.class === 'motorway' || info.class.endsWith('_link')) continue
    const off = info.width / 2 + 1.2
    let carry = spacing / 2
    for (let i = 3; i < pts.length; i += 3) {
      const ax = pts[i - 3]!, az = pts[i - 2]!, bx = pts[i]!, bz = pts[i + 1]!
      const len = Math.hypot(bx - ax, bz - az)
      if (!len) continue
      const nx = (bz - az) / len
      const nz = -(bx - ax) / len
      for (let d = carry; d < len; d += spacing) {
        const x = ax + ((bx - ax) * d) / len
        const z = az + ((bz - az) * d) / len
        for (const s of [1, -1]) spots.push({ x: x + nx * off * s, z: z + nz * off * s })
      }
      carry = (carry - len) % spacing
      if (carry < 0) carry += spacing
    }
  }
  return spots.filter(({ x, z }) => {
    const r = { x0: x - 0.6, z0: z - 0.6, x1: x + 0.6, z1: z + 0.6 }
    // 树离任何路面至少 0.4 格
    return !inAreas(x, z, inp.water) && !inAreas(x, z, inp.parks) && !blockedByRoad(r, inp, 0.4)
  })
}
