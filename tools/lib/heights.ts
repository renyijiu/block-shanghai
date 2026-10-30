// 折线网络的顶点高度：每条线有基准高度（地面 0、高架为正、隧道为负），不同高度的线首尾相接处
// 在 rampLen 内平滑过渡（docs/03“道路高度”、docs/04 第 6 节）。道路匝道和地铁坡道 / 隧道口共用
import { pathLength, type Pt } from './geom.ts'

/**
 * 节点高度：相接的线里有地面线，或者一高一低（高架接隧道），就落到地面 0；
 * 都在地上取最高，都在地下取最低
 */
export function junctionHeight(hs: number[]) {
  const hi = Math.max(...hs)
  const lo = Math.min(...hs)
  if (hs.includes(0) || (lo < 0 && hi > 0)) return 0
  return hi > 0 ? hi : lo
}

export function cumulative(pts: Pt[]) {
  const d = [0]
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1]! + Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!))
  return d
}

/** 在折线上距起点 at 处插一个顶点（附加分量线性插值） */
export function insertAt(pts: Pt[], at: number): Pt[] {
  const d = cumulative(pts)
  for (let i = 1; i < pts.length; i++) {
    if (d[i]! > at + 1e-6) {
      if (at - d[i - 1]! < 1e-6) return pts
      const t = (at - d[i - 1]!) / (d[i]! - d[i - 1]!)
      const a = pts[i - 1]!
      const b = pts[i]!
      return [...pts.slice(0, i), a.map((v, k) => v + (b[k]! - v) * t), ...pts.slice(i)]
    }
  }
  return pts
}

/**
 * 给每条线的顶点算高度，返回 [x, z, ...附加分量, h]（高度追加在最后）。
 * 首尾节点按坐标判断相接；基准为 0 的地面线不做坡
 */
export function rampHeights(lines: { pts: Pt[]; base: number }[], rampLen: number): Pt[][] {
  const key = (p: Pt) => `${p[0]!.toFixed(2)},${p[1]!.toFixed(2)}`
  const atNode = new Map<string, number[]>()
  lines.forEach((l, i) => {
    for (const p of [l.pts[0]!, l.pts[l.pts.length - 1]!]) (atNode.get(key(p)) ?? atNode.set(key(p), []).get(key(p))!).push(i)
  })
  const nodeHeight = (p: Pt, self: number) => {
    const hs = atNode.get(key(p))!.filter((i) => i !== self).map((i) => lines[i]!.base)
    return hs.length ? junctionHeight([lines[self]!.base, ...hs]) : null
  }
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return lines.map((l, i) => {
    const total = pathLength(l.pts)
    if (l.base === 0 || total === 0) return l.pts.map((p) => [...p, l.base])
    const ends = [nodeHeight(l.pts[0]!, i), nodeHeight(l.pts[l.pts.length - 1]!, i)]
    // 在坡道终点处补一个顶点，坡度才准确
    let pts = l.pts
    for (const [e, h] of ends.entries()) {
      if (h === null || h === l.base || total <= rampLen) continue
      pts = insertAt(pts, e === 0 ? rampLen : total - rampLen)
    }
    const dist = cumulative(pts)
    const len = dist[dist.length - 1]!
    const span = Math.min(rampLen, len)
    return pts.map((p, k) => {
      let h = l.base
      const fromStart = dist[k]!
      const fromEnd = len - dist[k]!
      if (ends[0] !== null && ends[0] !== l.base && fromStart < span) h += (ends[0]! - l.base) * (1 - smooth(fromStart / span))
      if (ends[1] !== null && ends[1] !== l.base && fromEnd < span) h += (ends[1]! - l.base) * (1 - smooth(fromEnd / span))
      return [...p, h]
    })
  })
}
