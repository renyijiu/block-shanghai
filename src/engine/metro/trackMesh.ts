// 地铁轨道在地面上的部分：高架（桥面、线路色带、钢轨、桥墩和盖梁）、地面段（道床、钢轨）、隧道口。
// 纯函数，烘焙数据进、顶点数组出（docs/04 第 6 节）。地下部分不画：地面平面会盖住 y < 0 的东西
import { GeoBuilder, rgb, type GeometryData, type RGB } from '../build/geometry.ts'
import type { Box } from '../geo/CollisionWorld.ts'
import { frame } from '../world/chunkMesh.ts'
import type { MetroTrack } from './data.ts'

export const TRACK_STYLE = {
  /** 桥面宽（格，双线） */
  deckWidth: 6,
  deckThickness: 1.5,
  parapet: 0.6,
  pierSpacing: 14,
  pierSize: 2,
  capWidth: 7.5,
  pierMinHeight: 2.5,
  /** 钢轨离中心线的距离（两条线各一对，这里只画两条示意） */
  railOffset: 1,
  colors: { concrete: 0xc9c5bc, deckTop: 0x8f8a82, ballast: 0x9b9589, rail: 0x55585e, portal: 0xb4afa5, opening: 0x15171a }
}

/** 地铁轨道的分块几何；桥墩碰撞盒写进 colliders */
export function buildMetroTracks(pieces: [number, number[]][], tracks: MetroTrack[], lineColor: (line: string) => number, colliders: Box[]): GeometryData | null {
  const s = TRACK_STYLE
  const g = new GeoBuilder()
  const concrete = rgb(s.colors.concrete)
  const rail = rgb(s.colors.rail)
  for (const [ti, flat] of pieces) {
    const track = tracks[ti]!
    const stripe = rgb(lineColor(track.lines[0]!))
    const stripe2 = rgb(lineColor(track.lines[1] ?? track.lines[0]!))
    // 把穿过地面的线段在 h = 0 处切开：地上的部分画出来，切点处放隧道口
    for (const part of splitAtGround(flat)) {
      if (part.portal) {
        portal(g, part.portal)
        continue
      }
      const f = frame(part.pts, s.deckWidth / 2)
      if (!f) continue
      let carried = 0
      for (let i = 1; i < f.pts.length; i++) {
        const [ax, az, ah] = f.pts[i - 1]!
        const [bx, bz, bh] = f.pts[i]!
        const [aox, aoz] = f.off[i - 1]!
        const [box, boz] = f.off[i]!
        const len = Math.hypot(bx! - ax!, bz! - az!)
        const angle = Math.atan2(bz! - az!, bx! - ax!)
        const elevated = Math.min(ah!, bh!) > 0.4
        const la = [ax! + aox!, az! + aoz!]
        const ra = [ax! - aox!, az! - aoz!]
        const lb = [bx! + box!, bz! + boz!]
        const rb = [bx! - box!, bz! - boz!]
        if (elevated) {
          const da = ah! - s.deckThickness
          const db = bh! - s.deckThickness
          g.quad([ra[0]!, ah!, ra[1]!], [rb[0]!, bh!, rb[1]!], [lb[0]!, bh!, lb[1]!], [la[0]!, ah!, la[1]!], [0, 1, 0], rgb(s.colors.deckTop))
          g.quad([la[0]!, da, la[1]!], [lb[0]!, db, lb[1]!], [rb[0]!, db, rb[1]!], [ra[0]!, da, ra[1]!], [0, -1, 0], concrete)
          // 两侧：混凝土梁 + 线路色带（共线时两条线各一侧）
          side(g, la, lb, da, db, ah! + s.parapet, bh! + s.parapet, [aox!, aoz!], 1, concrete, stripe, ah!, bh!)
          side(g, ra, rb, da, db, ah! + s.parapet, bh! + s.parapet, [aox!, aoz!], -1, concrete, stripe2, ah!, bh!)
          // 桥墩：柱子 + 横向盖梁
          let d = s.pierSpacing - carried
          while (d <= len) {
            const t = d / len
            const h = ah! + (bh! - ah!) * t - s.deckThickness
            if (h + s.deckThickness > s.pierMinHeight) {
              const px = ax! + (bx! - ax!) * t
              const pz = az! + (bz! - az!) * t
              const hs = s.pierSize / 2
              g.box(px - hs, 0, pz - hs, px + hs, h - 1, pz + hs, concrete)
              g.orientedBox(px, pz, angle, s.pierSize, s.capWidth, h - 1, h, concrete)
              colliders.push({ x0: px - hs, y0: 0, z0: pz - hs, x1: px + hs, y1: h, z1: pz + hs })
            }
            d += s.pierSpacing
          }
          carried = (carried + len) % s.pierSpacing
        } else {
          // 地面段：道床
          const y = 0.08
          g.quad([ra[0]!, y, ra[1]!], [rb[0]!, y, rb[1]!], [lb[0]!, y, lb[1]!], [la[0]!, y, la[1]!], [0, 1, 0], rgb(s.colors.ballast))
        }
        // 钢轨
        const mx = (ax! + bx!) / 2
        const mz = (az! + bz!) / 2
        const mh = Math.max(0.08, (ah! + bh!) / 2)
        const nx = Math.sin(angle)
        const nz = -Math.cos(angle)
        for (const k of [1, -1]) g.orientedBox(mx + nx * s.railOffset * k, mz + nz * s.railOffset * k, angle, len, 0.25, mh, mh + 0.22, rail)
      }
    }
  }
  return g.build()
}

// 桥面一侧：外立面（混凝土 + 色带）、护栏内侧
function side(g: GeoBuilder, a: number[], b: number[], ya0: number, yb0: number, ya1: number, yb1: number, off: number[], dir: 1 | -1, concrete: RGB, stripe: RGB, ha: number, hb: number) {
  const len = Math.hypot(off[0]!, off[1]!) || 1
  const n = [(off[0]! / len) * dir, 0, (off[1]! / len) * dir]
  const q = (p0: number[], p1: number[], y0a: number, y0b: number, y1a: number, y1b: number, col: RGB, nn: number[], flip: boolean) => {
    const A = [p0[0]!, y0a, p0[1]!]
    const B = [p0[0]!, y1a, p0[1]!]
    const C = [p1[0]!, y1b, p1[1]!]
    const D = [p1[0]!, y0b, p1[1]!]
    if (flip) g.quad(D, C, B, A, nn, col)
    else g.quad(A, B, C, D, nn, col)
  }
  // 外立面：下段混凝土、中段色带、上段混凝土（护栏）
  const flip = dir === -1
  q(a, b, ya0, yb0, ha - 1.1, hb - 1.1, concrete, n, flip)
  // 色带稍微外凸一点，避免和混凝土面重合
  const e = 0.03
  const ae = [a[0]! + n[0]! * e, a[1]! + n[2]! * e]
  const be = [b[0]! + n[0]! * e, b[1]! + n[2]! * e]
  q(ae, be, ha - 1.1, hb - 1.1, ha - 0.4, hb - 0.4, stripe, n, flip)
  q(a, b, ha - 0.4, hb - 0.4, ya1, yb1, concrete, n, flip)
  // 护栏顶面和内侧
  const w = 0.3
  const ai = [a[0]! - n[0]! * w, a[1]! - n[2]! * w]
  const bi = [b[0]! - n[0]! * w, b[1]! - n[2]! * w]
  q(ai, bi, ha, hb, ya1, yb1, concrete, [-n[0]!, 0, -n[2]!], !flip)
  if (dir === 1) g.quad([a[0]!, ya1, a[1]!], [ai[0]!, ya1, ai[1]!], [bi[0]!, yb1, bi[1]!], [b[0]!, yb1, b[1]!], [0, 1, 0], concrete)
  else g.quad([b[0]!, yb1, b[1]!], [bi[0]!, yb1, bi[1]!], [ai[0]!, ya1, ai[1]!], [a[0]!, ya1, a[1]!], [0, 1, 0], concrete)
}

interface Part {
  pts: number[]
  portal?: { x: number; z: number; angle: number }
}

/** 按高度把折线切成地上的几段；从地上进入地下的地方记一个隧道口（朝向地上那一侧） */
export function splitAtGround(flat: number[]): Part[] {
  const out: Part[] = []
  let cur: number[] = []
  for (let i = 0; i < flat.length; i += 3) {
    const x = flat[i]!
    const z = flat[i + 1]!
    const h = flat[i + 2]!
    if (i > 0) {
      const px = flat[i - 3]!
      const pz = flat[i - 2]!
      const ph = flat[i - 1]!
      if (ph >= 0 !== h >= 0) {
        const t = ph / (ph - h)
        const cx = px + (x - px) * t
        const cz = pz + (z - pz) * t
        // 隧道口朝向地上那一侧：从地上往地下的方向
        const angle = ph >= 0 ? Math.atan2(z - pz, x - px) : Math.atan2(pz - z, px - x)
        if (ph >= 0) {
          cur.push(cx, cz, 0)
          if (cur.length >= 6) out.push({ pts: cur })
          cur = []
        } else cur = [cx, cz, 0]
        out.push({ pts: [], portal: { x: cx, z: cz, angle } })
      }
    }
    if (h >= 0) cur.push(x, z, h)
  }
  if (cur.length >= 6) out.push({ pts: cur })
  return out
}

// 隧道口：门框 + 黑色洞口，两侧挡土墙
function portal(g: GeoBuilder, p: { x: number; z: number; angle: number }) {
  const s = TRACK_STYLE
  const c = rgb(s.colors.portal)
  const ux = Math.cos(p.angle)
  const uz = Math.sin(p.angle)
  const vx = uz
  const vz = -ux
  const w = s.deckWidth + 2
  // 门框：两侧墙垛 + 顶梁，略往地下方向偏一点
  const bx = p.x + ux * 1.5
  const bz = p.z + uz * 1.5
  for (const k of [1, -1]) g.orientedBox(bx + vx * (w / 2) * k, bz + vz * (w / 2) * k, p.angle, 3, 1.4, 0, 5.2, c)
  g.orientedBox(bx, bz, p.angle, 3, w + 1.4, 4.2, 5.6, c)
  // 洞口：门框后面一块黑色的面
  g.orientedBox(bx + ux * 1.6, bz + uz * 1.6, p.angle, 0.4, w - 1.4, 0, 4.2, rgb(s.colors.opening))
  // 挡土墙：往地上方向延伸 30 格的两道矮墙
  for (const k of [1, -1]) g.orientedBox(p.x - ux * 15 + vx * (w / 2) * k, p.z - uz * 15 + vz * (w / 2) * k, p.angle, 30, 0.6, 0, 1.4, c)
}
