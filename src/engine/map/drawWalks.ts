// 地图上的 Citywalk 和咖啡地图：路线画绿色虚线，打卡点画圆点（走过的实心），下一站加一圈；咖啡馆画小杯子
import type { WalkRoute } from '../life/WalkSystem.ts'
import { toScreen, type MapView } from './drawMap.ts'

export interface WalkLayer {
  routes: WalkRoute[]
  /** 路线 id → 已经走到第几站（下一站的序号）；没开始的不在里面 */
  progress: Record<string, { next: number; done?: number }>
  /** 只画这一条（小地图画正在走的） */
  only?: string | null
  /** 咖啡馆：世界坐标、去过没有 */
  coffee?: { x: number; z: number; visited: boolean }[]
}

export function drawWalks(ctx: CanvasRenderingContext2D, view: MapView, layer: WalkLayer) {
  const d = view.dpr
  ctx.save()
  for (const r of layer.routes) {
    if (layer.only !== undefined && r.def.id !== layer.only) continue
    const prog = layer.progress[r.def.id]
    ctx.beginPath()
    r.path.forEach(([x, z], i) => {
      const [px, py] = toScreen(view, x, z)
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    })
    ctx.setLineDash([5 * d, 4 * d])
    ctx.lineWidth = 3 * d
    ctx.strokeStyle = prog?.done !== undefined ? '#d4a73a' : '#2e9e62'
    ctx.stroke()
    ctx.setLineDash([])
    r.stops.forEach((s, i) => {
      const [px, py] = toScreen(view, s.x, s.z)
      const reached = !!prog && (prog.done !== undefined || i < prog.next)
      ctx.beginPath()
      ctx.arc(px, py, 4 * d, 0, Math.PI * 2)
      ctx.fillStyle = reached ? '#2e9e62' : '#ffffff'
      ctx.strokeStyle = '#2e9e62'
      ctx.lineWidth = 2 * d
      ctx.fill()
      ctx.stroke()
      if (prog && prog.done === undefined && i === prog.next) {
        ctx.beginPath()
        ctx.arc(px, py, 8 * d, 0, Math.PI * 2)
        ctx.strokeStyle = '#4fd18b'
        ctx.stroke()
      }
    })
  }
  ctx.font = `${13 * d}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const c of layer.coffee ?? []) {
    const [px, py] = toScreen(view, c.x, c.z)
    ctx.globalAlpha = c.visited ? 1 : 0.55
    ctx.fillText('☕', px, py)
  }
  ctx.restore()
}
