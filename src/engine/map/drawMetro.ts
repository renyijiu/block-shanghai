// 地铁线路图：按真实走向画彩色线路、车站，高亮规划出的路线（docs/04 第 5 节“线路图面板”）
import type { MetroData } from '../metro/data.ts'
import type { Route } from '../metro/network.ts'
import type { MapView } from './drawMap.ts'

export interface MetroMapStyle {
  route?: Route | null
  from?: number | null
  to?: number | null
}

const sxz = (view: MapView, x: number, z: number): [number, number] => [((x - view.x) * view.scale + view.width / 2) * view.dpr, ((z - view.z) * view.scale + view.height / 2) * view.dpr]

// 画交路 path（扁平 [x, z, h, km]）在 [kmFrom, kmTo] 之间的一段
function strokePath(ctx: CanvasRenderingContext2D, view: MapView, path: number[], kmFrom = -Infinity, kmTo = Infinity) {
  ctx.beginPath()
  let started = false
  for (let i = 0; i < path.length; i += 4) {
    const km = path[i + 3]!
    if (km < kmFrom || km > kmTo) continue
    const [x, y] = sxz(view, path[i]!, path[i + 1]!)
    if (started) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
    started = true
  }
  ctx.stroke()
}

export function drawMetro(ctx: CanvasRenderingContext2D, data: MetroData, view: MapView, style: MetroMapStyle = {}) {
  const { dpr, scale } = view
  const width = Math.min(9, Math.max(2.5, scale * 14)) * dpr
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const route = style.route
  // 有路线时其他线路淡化
  ctx.globalAlpha = route ? 0.22 : 1
  for (const line of data.lines) {
    ctx.strokeStyle = line.color
    ctx.lineWidth = width
    for (const s of line.services) strokePath(ctx, view, s.path)
  }
  ctx.globalAlpha = 1

  // 路线高亮：每段找一个按顺序经过这些站的交路，画首尾站之间的那一截
  const onRoute = new Set<number>()
  if (route) {
    for (const leg of route.legs) {
      const line = data.lines.find((l) => l.id === leg.line)!
      for (const st of leg.stations) onRoute.add(st)
      for (const s of line.services) {
        const i = s.stops.indexOf(leg.from)
        const j = s.stops.indexOf(leg.to, i + 1)
        if (i < 0 || j < 0) continue
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = width * 1.9
        strokePath(ctx, view, s.path, s.chainage[i], s.chainage[j])
        ctx.strokeStyle = line.color
        ctx.lineWidth = width * 1.3
        strokePath(ctx, view, s.path, s.chainage[i], s.chainage[j])
        break
      }
    }
  }

  // 车站：换乘站大一圈；路线上的站、起终点突出
  const labelAll = scale >= 0.7
  const labelTransfer = scale >= 0.22
  ctx.font = `${11 * dpr}px system-ui, 'PingFang SC', sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  data.stations.forEach((st, i) => {
    const transfer = st.lines.length > 1
    const dim = route && !onRoute.has(i)
    const [x, y] = sxz(view, st.pos[0], st.pos[1])
    const r = (transfer ? 4.5 : 2.8) * dpr * Math.min(1.6, Math.max(0.8, scale * 2))
    ctx.globalAlpha = dim ? 0.3 : 1
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = 1.5 * dpr
    ctx.strokeStyle = transfer ? '#333333' : data.lines.find((l) => l.id === st.lines[0])?.color ?? '#333333'
    ctx.stroke()
    if (!dim && (labelAll || (transfer && labelTransfer) || onRoute.has(i))) {
      ctx.lineWidth = 3 * dpr
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(st.name, x + r + 3 * dpr, y)
      ctx.fillStyle = '#2a2a2a'
      ctx.fillText(st.name, x + r + 3 * dpr, y)
    }
  })
  ctx.globalAlpha = 1

  // 起点、终点标记
  for (const [idx, text, color] of [
    [style.from, '起', '#2e8b57'],
    [style.to, '终', '#c8282a']
  ] as const) {
    if (idx === null || idx === undefined) continue
    const st = data.stations[idx]!
    const [x, y] = sxz(view, st.pos[0], st.pos[1])
    const r = 10 * dpr
    ctx.beginPath()
    ctx.arc(x, y - r * 1.6, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - r * 0.5, y - r * 0.9)
    ctx.lineTo(x, y)
    ctx.lineTo(x + r * 0.5, y - r * 0.9)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = `700 ${11 * dpr}px system-ui, 'PingFang SC', sans-serif`
    ctx.fillText(text, x, y - r * 1.6)
    ctx.textAlign = 'left'
    ctx.font = `${11 * dpr}px system-ui, 'PingFang SC', sans-serif`
  }
}

/** 画布 CSS 坐标附近（tolerance 像素内）最近的车站 */
export function stationAt(data: MetroData, view: MapView, px: number, py: number, tolerance = 14): number | null {
  let best: number | null = null
  let bestD = tolerance
  data.stations.forEach((st, i) => {
    const x = (st.pos[0] - view.x) * view.scale + view.width / 2
    const y = (st.pos[1] - view.z) * view.scale + view.height / 2
    const d = Math.hypot(x - px, y - py)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
